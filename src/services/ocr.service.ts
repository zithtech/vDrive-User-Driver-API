import vision from '@google-cloud/vision';
import axios from 'axios';
import { logger } from '../shared/logger';
import { s3Service } from '../modules/s3/s3.service';

// Initialize the Google Cloud Vision client
// Uses GOOGLE_APPLICATION_CREDENTIALS env var to find the JSON key file
const client = new vision.ImageAnnotatorClient();

/* ================================================================
   OCR Validation Result
   ================================================================ */

export interface OCRValidationResult {
  isValid: boolean;
  documentType: string;
  extractedNumber?: string;
  extractedExpiry?: string;
  extractedName?: string;
  rawText?: string;
  ocrStatus: 'COMPLETED' | 'FAILED' | 'SKIPPED';
  errorCode?: 'BLURRY' | 'WRONG_DOCUMENT' | 'EXPIRED' | 'INSUFFICIENT_TEXT';
  errorMessage?: string;
  detectedDocumentType?: string;
}

/* ================================================================
   Document Type Detection Patterns
   ================================================================ */

interface DocumentPattern {
  type: string;
  label: string;
  regex?: RegExp;
  keywords: string[];
  strictKeywordsRequired?: number;
}

const DOCUMENT_PATTERNS: DocumentPattern[] = [
  {
    type: 'aadhaar_card',
    label: 'Aadhaar Card',
    regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
    keywords: ['aadhaar', 'uidai', 'unique identification', 'government of india', 'enrolment'],
  },
  {
    type: 'pan_card',
    label: 'PAN Card',
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/i,
    keywords: ['permanent account number', 'income tax', 'pan', 'dept'],
  },
  {
    type: 'driving_license',
    label: 'Driving License',
    regex: /\b[A-Z]{2}[0-9]{2}[\s-]?[0-9]{11}\b/i,
    keywords: ['driving', 'licence', 'license', 'transport', 'motor vehicle', 'validity'],
  },
  {
    type: 'rc',
    label: 'Vehicle RC',
    regex: /\b[A-Z]{2}\s?[0-9]{2}\s?[A-Z]{1,2}\s?[0-9]{4}\b/i,
    keywords: ['registration', 'certificate', 'registering authority', 'chassis'],
  },
  {
    type: 'insurance',
    label: 'Vehicle Insurance',
    keywords: ['insurance', 'policy', 'premium', 'insured', 'validity', 'schedule'],
    strictKeywordsRequired: 2,
  },
  {
    type: 'vehicle_license',
    label: 'Vehicle Permit',
    keywords: ['permit', 'authorization', 'transport', 'valid', 'motor', 'goods'],
    strictKeywordsRequired: 2,
  },
];

/* ================================================================
   Types that should be OCR-validated
   ================================================================ */

const OCR_VALIDATABLE_TYPES = [
  'aadhaar_card',
  'pan_card',
  'driving_license',
  'rc',
  'vehicle_license',
  'insurance',
];

/* ================================================================
   Main Validation Function
   ================================================================ */

export async function validateDocument(
  imageUrl: string,
  expectedDocumentType: string
): Promise<OCRValidationResult> {
  // Skip OCR for document types that don't have text to validate
  if (!OCR_VALIDATABLE_TYPES.includes(expectedDocumentType)) {
    logger.info(`[OCR] Skipping OCR for type: ${expectedDocumentType}`);
    return {
      isValid: true,
      documentType: expectedDocumentType,
      ocrStatus: 'SKIPPED',
    };
  }

  try {
    logger.info(`[OCR] Starting validation for ${expectedDocumentType}: ${imageUrl}`);

    // --- Resolve the image URL to a buffer ---
    let requestBody: any;

    if (typeof imageUrl === 'object') {
      // Handle JSON-structured URLs (e.g., { front: "...", back: "..." })
      const urlObj = imageUrl as any;
      imageUrl = urlObj.front || urlObj.url || urlObj.back || '';
    }

    if (typeof imageUrl === 'string' && imageUrl.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(imageUrl);
        imageUrl = parsed.front || parsed.url || parsed.back || '';
      } catch (e) {
        // ignore
      }
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return {
        isValid: false,
        documentType: expectedDocumentType,
        ocrStatus: 'FAILED',
        errorCode: 'BLURRY',
        errorMessage: 'Invalid image URL. Please re-upload.',
      };
    }

    // Download image to buffer for Vision API
    if (imageUrl.startsWith('http')) {
      try {
        let downloadUrl = imageUrl;
        if (imageUrl.includes('.s3.') && imageUrl.includes('amazonaws.com')) {
          const urlObj = new URL(imageUrl);
          const key = decodeURIComponent(urlObj.pathname.substring(1));
          downloadUrl = await s3Service.getReadUrl(key, 60);
        }

        const response = await axios.get(downloadUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: {
            'User-Agent': 'VDrive-OCR/1.0',
            Accept: 'image/*,*/*;q=0.8',
          },
        });
        const buffer = Buffer.from(response.data, 'binary');
        requestBody = { image: { content: buffer } };
      } catch (err: any) {
        logger.error(`[OCR] Failed to download image: ${err.message}`);
        return {
          isValid: false,
          documentType: expectedDocumentType,
          ocrStatus: 'FAILED',
          errorCode: 'BLURRY',
          errorMessage: 'Unable to access the uploaded image. Please try again.',
          rawText: '',
        };
      }
    } else {
      // Local file path — pass directly
      requestBody = imageUrl;
    }

    // --- Run Google Cloud Vision Text Detection ---
    const [result] = await client.textDetection(requestBody);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      logger.warn(`[OCR] No text detected for ${expectedDocumentType}`);
      return {
        isValid: false,
        documentType: expectedDocumentType,
        ocrStatus: 'COMPLETED',
        errorCode: 'BLURRY',
        errorMessage:
          'Image is blurry or unreadable. Please re-upload a clear photo of your document.',
      };
    }

    const rawText = detections[0].description || '';
    const normalizedText = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ');

    logger.info(`[OCR] Raw text length: ${rawText.length}, normalized: ${normalizedText.substring(0, 200)}`);

    // --- Check 1: Insufficient text ---
    if (rawText.trim().length < 10) {
      return {
        isValid: false,
        documentType: expectedDocumentType,
        rawText,
        ocrStatus: 'COMPLETED',
        errorCode: 'INSUFFICIENT_TEXT',
        errorMessage:
          'The image does not contain enough readable text. Please capture the full document clearly.',
      };
    }

    // --- Check 2: Detect what document type this actually is ---
    const expectedPattern = DOCUMENT_PATTERNS.find((p) => p.type === expectedDocumentType);
    let detectedType: DocumentPattern | null = null;
    let extractedNumber: string | undefined;

    // Try to match the expected type first
    if (expectedPattern) {
      if (expectedPattern.regex) {
        const match = normalizedText.match(expectedPattern.regex);
        if (match) {
          extractedNumber = match[0].replace(/[\s-]/g, '').toUpperCase();
          detectedType = expectedPattern;
        }
      } else {
        // If no regex, we rely on strict keyword matching
        let matchedKeywordsCount = 0;
        for (const kw of expectedPattern.keywords) {
          if (new RegExp(`\\b${kw}\\b`, 'i').test(normalizedText)) {
            matchedKeywordsCount++;
          }
        }
        if (matchedKeywordsCount >= (expectedPattern.strictKeywordsRequired || 1)) {
          detectedType = expectedPattern;
        }
      }
    }

    // STRICT MODE CHECK: If we could not confidently detect the expected type
    if (!detectedType) {
      // It failed strict detection for the expected type. Let's see if we can identify what it IS.
      for (const pattern of DOCUMENT_PATTERNS) {
        if (pattern.type === expectedDocumentType) continue;

        let isThisPattern = false;
        if (pattern.regex) {
          if (normalizedText.match(pattern.regex)) isThisPattern = true;
        } else {
          let matchedKeywordsCount = 0;
          for (const kw of pattern.keywords) {
             if (new RegExp(`\\b${kw}\\b`, 'i').test(normalizedText)) matchedKeywordsCount++;
          }
          if (matchedKeywordsCount >= (pattern.strictKeywordsRequired || 1)) {
             isThisPattern = true;
          }
        }

        if (isThisPattern) {
          const expectedLabel = expectedPattern?.label || expectedDocumentType.replace(/_/g, ' ');
          return {
            isValid: false,
            documentType: expectedDocumentType,
            rawText,
            ocrStatus: 'COMPLETED',
            errorCode: 'WRONG_DOCUMENT',
            errorMessage: `This appears to be a ${pattern.label}, not a ${expectedLabel}. Please upload the correct document.`,
            detectedDocumentType: pattern.type,
          };
        }
      }

      // If we couldn't identify it as any other known document either
      return {
        isValid: false,
        documentType: expectedDocumentType,
        rawText,
        ocrStatus: 'COMPLETED',
        errorCode: 'WRONG_DOCUMENT',
        errorMessage: `This does not appear to be a valid ${expectedPattern?.label || expectedDocumentType}. Please ensure the ID number and details are clearly visible.`,
      };
    }

    // --- Check 4: Extract expiry date for Driving License ---
    let extractedExpiry: string | undefined;
    if (
      expectedDocumentType === 'driving_license' &&
      detectedType?.type === 'driving_license'
    ) {
      const dateMatches = normalizedText.match(/\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/g);
      if (dateMatches && dateMatches.length > 0) {
        // Find the latest date (likely the expiry)
        let maxTime = 0;
        let maxDateStr = dateMatches[dateMatches.length - 1];

        for (const d of dateMatches) {
          const parts = d.split(/[\/\-]/);
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            const time = new Date(year, month, day).getTime();
            if (time > maxTime) {
              maxTime = time;
              maxDateStr = d;
            }
          }
        }

        extractedExpiry = maxDateStr;

        // Check if expired
        if (maxTime > 0 && maxTime < Date.now()) {
          const expectedLabel = expectedPattern?.label || 'Driving License';
          return {
            isValid: false,
            documentType: expectedDocumentType,
            extractedNumber,
            extractedExpiry,
            rawText,
            ocrStatus: 'COMPLETED',
            errorCode: 'EXPIRED',
            errorMessage: `Your ${expectedLabel} appears to be expired (expiry: ${maxDateStr}). Please upload a valid, non-expired license.`,
          };
        }
      }
    }

    // --- Check 5: Extract name (common across documents) ---
    let extractedName: string | undefined;
    const nameMatch = normalizedText.match(/(?:name|naam)[:\s]+([A-Z][A-Z\s]+)/i);
    if (nameMatch) {
      extractedName = nameMatch[1].trim();
    }

    // --- All checks passed ---
    logger.info(
      `[OCR] Validation PASSED for ${expectedDocumentType}. Number: ${extractedNumber || 'N/A'}`
    );

    return {
      isValid: true,
      documentType: expectedDocumentType,
      extractedNumber,
      extractedExpiry,
      extractedName,
      rawText,
      ocrStatus: 'COMPLETED',
    };
  } catch (error: any) {
    logger.error(`[OCR] Google Cloud Vision error: ${error.message}`);
    // On OCR infrastructure failure, DON'T block the upload — just log and continue
    return {
      isValid: true,
      documentType: expectedDocumentType,
      ocrStatus: 'FAILED',
      rawText: '',
    };
  }
}
