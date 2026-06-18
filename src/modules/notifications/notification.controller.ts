// src/modules/notifications/notification.controller.ts
import { Request, Response, NextFunction } from 'express';
import { NotificationService } from './notification.service';
import { successResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';
import { subscribeToTopic, unsubscribeFromTopic } from '../../config/firebase';
import { CouponRepository } from '../coupon-management/coupon.repository';
import { CouponService } from '../coupon-management/coupon.service';

export const NotificationController = {
    /**
     * POST /api/notifications/test
     * Send a test push notification to a specific driver
     *
     * Body: { driverId: string, title?: string, body?: string }
     */
    async sendTestNotification(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const { driverId, title, body } = req.body;

            if (!driverId) {
                throw { statusCode: 400, message: 'driverId is required' };
            }

            const messageId = await NotificationService.sendNotificationToDriver(
                driverId,
                title || '🚗 New Ride Request',
                body || 'You have a new ride request nearby! Pickup is 2km away.',
                { type: 'test_notification' },
            );

            logger.info(`Test notification sent to driver ${driverId}: ${messageId}`);

            return successResponse(res, 200, 'Test notification sent successfully', {
                messageId,
                driverId,
            });
        } catch (err: any) {
            logger.error(`Error sending test notification: ${err.message}`);
            next(err);
        }
    },

    /**
     * POST /api/notifications/send
     * Send a push notification to a specific driver or user (for production use)
     *
     * Body: { driverId?: string, userId?: string, title: string, body: string, data?: object }
     */
    async sendNotification(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const { driverId, userId, title, body, data } = req.body;

            if (!(driverId || userId) || !title || !body) {
                throw {
                    statusCode: 400,
                    message: 'Either driverId or userId, along with title, and body are required',
                };
            }

            let messageId;
            if (driverId) {
                messageId = await NotificationService.sendNotificationToDriver(
                    driverId,
                    title,
                    body,
                    data,
                );
            } else if (userId) {
                messageId = await NotificationService.sendNotificationToUser(
                    userId,
                    title,
                    body,
                    data,
                );
            }

            return successResponse(res, 200, 'Notification sent successfully', {
                messageId,
                driverId,
                userId,
            });
        } catch (err: any) {
            logger.error(`Error sending notification: ${err.message}`);
            next(err);
        }
    },

    /**
     * POST /api/notifications/subscribe-to-coupon
     */
    async subscribeToCoupon(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const { userId, couponCode, fcmToken } = req.body;

            if (!userId || !couponCode || !fcmToken) {
                throw { statusCode: 400, message: 'userId, couponCode, and fcmToken are required' };
            }

            // 1. Validate coupon
            const coupon = await CouponRepository.findByCode(couponCode);
            if (!coupon) {
                throw { statusCode: 404, message: 'Invalid coupon code' };
            }

            // Additional validations: expiry, budget, user eligibility
            // We use CouponService.validateCoupon for logic consistency, ignoring rideAmount
            await CouponService.validateCoupon(couponCode, userId, 0, true);

            // 2. Build topic: coupon_SAVE50
            const topicName = `coupon_${couponCode}`;

            // 3. Subscribe FCM token
            const success = await subscribeToTopic(fcmToken, topicName);
            if (!success) {
                throw { statusCode: 500, message: 'Failed to subscribe to FCM topic' };
            }

            // 4. Save subscription entry in DB
            await CouponRepository.subscribeUserToTopic({
                userId,
                couponId: coupon.id,
                topicName,
                fcmToken
            });

            return successResponse(res, 200, 'Subscribed to coupon topic successfully', {
                userId,
                couponCode,
                topicName
            });
        } catch (err: any) {
            logger.error(`Error in subscribeToCoupon: ${err.message}`);
            next(err);
        }
    },

    /**
     * POST /api/notifications/unsubscribe
     */
    async unsubscribeFromCoupon(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const { userId, couponCode, fcmToken } = req.body;

            if (!userId || !couponCode || !fcmToken) {
                throw { statusCode: 400, message: 'userId, couponCode, and fcmToken are required' };
            }

            const topicName = `coupon_${couponCode}`;

            // 1. Unsubscribe FCM
            await unsubscribeFromTopic(fcmToken, topicName);

            // 2. Delete subscription record from DB
            await CouponRepository.unsubscribeUserFromTopic(userId, topicName);

            return successResponse(res, 200, 'Unsubscribed from coupon topic successfully', {
                userId,
                couponCode,
                topicName
            });
        } catch (err: any) {
            logger.error(`Error in unsubscribeFromCoupon: ${err.message}`);
            next(err);
        }
    },
};
