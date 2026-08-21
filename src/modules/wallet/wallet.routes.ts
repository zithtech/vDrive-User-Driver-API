import { Router } from 'express';
import { WalletController } from './wallet.controller';

const router = Router();

// In a real app, these routes should be protected by an authentication middleware
// For this example, we assume userId is either passed in req.user by a middleware
// or explicitly provided in the URL/body for testing purposes.
router.get('/settings/:userId', WalletController.getSettings);
router.put('/settings/:userId', WalletController.updateSettings);

export default router;
