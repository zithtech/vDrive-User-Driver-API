import { Router } from 'express';
import { UserController } from './user.controller';
import { UserValidation } from './user.validator';
import { validateBody, validateParams, validateQuery } from '../../utilities/helper';
import driverDocumentsRoutes from '../drivers/driver-documents.routes';

const router = Router();

router.get('/', UserController.getUsers);

router.get('/:id', validateParams(UserValidation.idValidation), UserController.getUserById);

router.post(
  '/add-user',
  validateBody(UserValidation.createUserValidation),
  UserController.createUser
);

router.patch(
  '/update/:id',
  validateParams(UserValidation.idValidation),
  validateBody(UserValidation.updateUserValidation),
  UserController.updateUser
);

router.patch(
  '/add-emergency-contacts',
  validateParams(UserValidation.idValidation),
  validateBody(UserValidation.updateUserValidation),
  UserController.updateUser
);

router.delete('/:id', validateParams(UserValidation.idValidation), UserController.deleteUser);

router.patch('/block/:id', validateParams(UserValidation.idValidation), UserController.blockUser);

router.patch(
  '/unblock/:id',
  validateParams(UserValidation.idValidation),
  UserController.unblockUser
);

router.patch(
  '/disable/:id',
  validateParams(UserValidation.idValidation),
  UserController.disableUser
);

router.patch('/enable/:id', validateParams(UserValidation.idValidation), UserController.enableUser);

router.patch(
  '/suspend/:id',
  validateParams(UserValidation.idValidation),
  UserController.suspendUser
);

router.patch(
  '/unsuspend/:id',
  validateParams(UserValidation.idValidation),
  UserController.unsuspendUser
);

router.get('/search', validateQuery(UserValidation.searchValidation), UserController.searchUsers);

// user documents routes
router.post('/documents/:userid/upload-url', UserController.getUploadUrl);

//fcm-token-update
router.post('/update-fcm-token', UserController.updateToken);

router.delete('/documents/:userid/delete', UserController.deleteDocument);

// ─────────── USER WALLET ───────────
router.get('/wallet/:id/balance', UserController.getWalletBalance);
router.get('/wallet/:id/transactions', UserController.getWalletTransactions);
router.post('/wallet/:id/setup-pin', UserController.setupWalletPin);
router.post('/wallet/:id/topup/order', UserController.createWalletTopupOrder);
router.post('/wallet/:id/topup/verify', UserController.verifyWalletTopupPayment);
router.post('/wallet/:id/pay-trip', UserController.payTripWithWallet);

export default router;
