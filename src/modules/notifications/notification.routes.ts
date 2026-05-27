import { Router } from 'express';
import { NotificationController } from './notification.controller';
import isServiceAuthenticated from '../../shared/serviceAuthentication';

const router = Router();

// POST /api/notifications/test — send a test notification to a driver
router.post('/test', NotificationController.sendTestNotification);

// POST /api/notifications/send — send a notification to a driver
router.post('/send', NotificationController.sendNotification);

// POST /api/notifications/subscribe-to-coupon
router.post('/subscribe-to-coupon', NotificationController.subscribeToCoupon);

// POST /api/notifications/unsubscribe
router.post('/unsubscribe', NotificationController.unsubscribeFromCoupon);

// 🛡️ Internal Service Route (Used by Admin BE)
router.post('/internal/send', isServiceAuthenticated, NotificationController.sendNotification);

export default router;
