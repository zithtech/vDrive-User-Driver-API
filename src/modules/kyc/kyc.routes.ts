import { Router } from 'express';
import { KycController } from './kyc.controller';

const router = Router();

// Driver routes
router.post('/request/:driverId', KycController.requestKyc);
router.get('/token/:sessionId', KycController.getToken);
router.get('/status/:driverId', KycController.getStatus);
router.post('/cancel/:sessionId', KycController.cancelKyc);
router.post('/retry/:sessionId', KycController.retryKyc);
router.post('/timeout-to-schedule/:sessionId', KycController.timeoutToSchedule);
router.get('/appointment/:driverId', KycController.getAppointment);

// Admin routes
router.get('/queue', KycController.getQueue);
router.post('/accept/:sessionId', KycController.acceptKyc);
router.post('/prompt/:sessionId', KycController.sendPrompt);
router.post('/verdict/:sessionId', KycController.submitVerdict);
router.post('/schedule-appointment', KycController.scheduleAppointment);
router.get('/history', KycController.getHistory);
router.get('/slots', KycController.getSlots);
router.post('/slots', KycController.addSlot);
router.delete('/slots/:slotId', KycController.deleteSlot);

export default router;

