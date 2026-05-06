import admin from "../config/firebase";
import { logger } from "../shared/logger";

export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, string>; // Optional: for deep-linking or app logic
}

export const notificationService = {
    /**
     * Sends a generic push notification to a specific FCM token
     */
    async sendPushNotification(token: string, payload: PushPayload) {
        if (!token) {
            logger.error("Cannot send notification: No token provided.");
            return;
        }

        const message = {
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data || {},
            android: {
                priority: 'high' as const,
                notification: {
                    channelId: 'v-drive-alerts',
                    icon: 'ic_notification',
                    color: '#FF5722',
                },
            },
            token: token,
        };

        try {
            const response = await admin.messaging().send(message);
            logger.info(`✅ Push notification delivered: ${response}`);
            return response;
        } catch (error) {
            logger.error('❌ Firebase delivery failed:', error);
            throw error;
        }
    }
};