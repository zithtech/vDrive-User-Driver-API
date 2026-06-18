import { Router } from 'express';
import {
  dispatchNotification,
  getNotifications,
  createNotificationRecord,
  updateNotificationRecord,
  deleteNotificationRecord,
} from './notification-management.controller';
import isAuthenticated from '../../shared/authentication';

const router = Router();

router.use(isAuthenticated);

// Broadcast / Queue Dispatch
router.post('/dispatch', dispatchNotification);

// CRUD operations for notification templates/history
router.get('/', getNotifications);
router.post('/create', createNotificationRecord);
router.patch('/update/:id', updateNotificationRecord);
router.delete('/delete/:id', deleteNotificationRecord);

export default router;
