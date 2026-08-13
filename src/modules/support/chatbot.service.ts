import { VertexAI } from '@google-cloud/vertexai';
import { logger } from '../../shared/logger';
import path from 'path';

/* ================================================================
   Production Constants
   ================================================================ */

const MAX_HISTORY_MESSAGES = 20;     // Cap conversation history
const REQUEST_TIMEOUT_MS = 25000;    // 25 second timeout for Vertex AI
const RATE_LIMIT_WINDOW_MS = 60000;  // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10;  // Max 10 messages per minute per user

// In-memory rate limiter (per IP / userId)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/* ================================================================
   Vertex AI Gemini Chatbot Service
   ================================================================ */

// Use the same Google Cloud credentials as Vision OCR
const PROJECT_ID = 'vdrivedriver-production';
const LOCATION = 'asia-south1';
const MODEL_ID = 'gemini-1.5-flash';

// Set credentials path if not already set
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, '../../../google-vision-key.json');
}

const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

const generativeModel = vertexAI.getGenerativeModel({
  model: MODEL_ID,
  generationConfig: {
    maxOutputTokens: 1024,
    temperature: 0.7,
    topP: 0.9,
  },
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_MEDIUM_AND_ABOVE' as any },
    { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_MEDIUM_AND_ABOVE' as any },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_MEDIUM_AND_ABOVE' as any },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_MEDIUM_AND_ABOVE' as any },
  ],
});

/* ================================================================
   System Prompt — t2drive Knowledge Base
   ================================================================ */

const SYSTEM_PROMPT = `You are the t2drive Support Assistant — a helpful, friendly chatbot for drivers using the t2drive ride-hailing app.

## Key Knowledge About t2drive:

### Earnings & Payments:
- Drivers earn money by completing rides. Passengers pay the driver directly via cash or online payment.
- t2drive does NOT charge any commission on rides. The driver keeps 100% of the fare.
- Drivers can view their earnings in the "Earnings" section of the app.
- To withdraw earnings: Go to Earnings > Withdraw > Select bank account > Enter amount (minimum ₹100) > Confirm.
- Payouts are processed within 1-3 business days.
- Earnings history shows daily, weekly, and monthly breakdowns.

### Trips & Bookings:
- Drivers receive ride requests based on their location and availability.
- Drivers can accept or decline ride requests.
- Once accepted, the driver navigates to the pickup point, picks up the passenger, and drives to the destination.
- Trip fare is calculated based on distance, time, and base fare.
- Drivers can view trip history in the "Ride Activity" section.
- If a passenger cancels, the driver may receive a cancellation fee.

### Account & Documents:
- Drivers must complete KYC verification to start driving.
- Required documents: Driving License, Vehicle Registration Certificate (RC), Vehicle Insurance, Aadhaar Card.
- Documents can be uploaded in the "Account" > "Documents" section.
- Document verification usually takes 24-48 hours.
- Profile information can be updated in the "Account" section.

### Subscription & Plans:
- Drivers need an active subscription plan to accept ride requests.
- Subscription plans vary by duration and benefits.
- Plans can be purchased from the "Subscription" section.
- Plan benefits may include priority ride requests and other perks.
- Expired subscriptions must be renewed to continue driving.

### Incentives & Bonuses:
- t2drive offers various incentive programs for active drivers.
- Bonuses may be available for completing a certain number of rides.
- Referral bonuses: Drivers can earn by referring other drivers using their referral code.
- Incentive details are available in the app notifications.

### Safety & Guidelines:
- Always follow traffic rules and regulations.
- Maintain your vehicle in good condition.
- Treat passengers with respect and courtesy.
- Do not use your phone while driving.
- In case of emergency, use the SOS feature in the app.
- Report any safety incidents through the app.

### App Features:
- Dashboard: View today's earnings, ride count, and online status.
- Map: See nearby ride requests and navigate to pickup/drop locations.
- Earnings: Track daily/weekly/monthly earnings and withdraw funds.
- Ride Activity: View past and upcoming rides.
- Profile: Manage account, documents, subscription, and settings.
- Help Center: Access FAQs, contact support, and chat with this assistant.
- Dark mode and light mode are available in settings.
- Multiple language support available.

## Response Guidelines:
- Be friendly, concise, and professional.
- Use emojis sparingly (1-2 per message max).
- Give step-by-step instructions when explaining how to do something.
- If you don't know the specific answer, say: "I'd recommend contacting our live support team for more details on this. Would you like me to connect you?"
- Always respond in the same language the driver uses.
- Keep responses under 200 words unless detailed steps are needed.
- Do NOT make up information about features that don't exist.
- Do NOT discuss competitor apps.`;

/* ================================================================
   Chat Message Types
   ================================================================ */

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

/* ================================================================
   Chatbot Service
   ================================================================ */

export const ChatbotService = {

  /**
   * Check rate limit for a given key (userId or IP).
   * Returns true if allowed, false if rate-limited.
   */
  checkRateLimit(key: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return true;
    }

    if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
      logger.warn(`[Chatbot] Rate limit exceeded for key: ${key}`);
      return false;
    }

    entry.count++;
    return true;
  },

  /**
   * Send a message to the Gemini chatbot and get a response.
   * Accepts conversation history to maintain context.
   */
  async sendMessage(userMessage: string, history: ChatMessage[] = [], rateLimitKey?: string): Promise<string> {
    try {
      // --- Rate Limit Check ---
      if (rateLimitKey && !this.checkRateLimit(rateLimitKey)) {
        return "You're sending messages too quickly. Please wait a moment and try again.";
      }

      logger.info(`[Chatbot] Processing message: "${userMessage.substring(0, 50)}..."`);

      // --- Cap History ---
      const cappedHistory = history.slice(-MAX_HISTORY_MESSAGES);

      // Build the conversation history for Gemini
      const contents = cappedHistory.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      // Add the current user message
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });

      // Start chat with system instruction and history
      const chat = generativeModel.startChat({
        systemInstruction: {
          role: 'system',
          parts: [{ text: SYSTEM_PROMPT }],
        },
        history: contents.slice(0, -1), // All messages except the latest
      });

      // Send the latest user message with timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT_MS)
      );

      const result = await Promise.race([
        chat.sendMessage(userMessage),
        timeoutPromise,
      ]);
      const response = result.response;

      // Extract text from response
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        logger.warn('[Chatbot] No candidates in response');
        return "I'm sorry, I couldn't process your request right now. Please try again.";
      }

      const text = candidates[0].content?.parts?.[0]?.text || '';
      
      if (!text) {
        logger.warn('[Chatbot] Empty text in response');
        return "I'm sorry, I couldn't generate a response. Please try again.";
      }

      logger.info(`[Chatbot] Response generated successfully (${text.length} chars)`);
      return text;

    } catch (error: any) {
      logger.error(`[Chatbot] Vertex AI error: ${error.message}`);
      
      // Handle specific errors
      if (error.message?.includes('PERMISSION_DENIED')) {
        logger.error('[Chatbot] Permission denied — ensure Vertex AI API is enabled and service account has access');
        return "I'm temporarily unavailable. Our team has been notified. Please try the FAQ section or contact support directly.";
      }
      
      if (error.message?.includes('RESOURCE_EXHAUSTED')) {
        return "I'm receiving too many requests right now. Please try again in a moment.";
      }

      if (error.message === 'TIMEOUT') {
        logger.warn('[Chatbot] Request timed out after 25 seconds');
        return "I'm taking too long to respond. Please try again with a shorter question.";
      }

      return "I'm sorry, I'm having trouble right now. Please try again or contact our support team directly.";
    }
  },
};
