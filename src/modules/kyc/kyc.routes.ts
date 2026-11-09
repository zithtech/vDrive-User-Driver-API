import { Router } from 'express';
import { KycController } from './kyc.controller';

const router = Router();

// Driver routes
router.post('/request/:driverId', KycController.requestKyc);
router.get('/token/:sessionId', KycController.getToken);
router.get('/status/:driverId', KycController.getStatus);
router.post('/cancel/:sessionId', KycController.cancelKyc);

// Admin routes
router.get('/queue', KycController.getQueue);
router.post('/accept/:sessionId', KycController.acceptKyc);
router.post('/prompt/:sessionId', KycController.sendPrompt);
router.post('/verdict/:sessionId', KycController.submitVerdict);

export default router;

