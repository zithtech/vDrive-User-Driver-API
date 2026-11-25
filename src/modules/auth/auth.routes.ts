// src/modules/auth/auth.routes.ts
import { Router } from 'express';
import { AuthController } from './auth.controller';
import isAuthenticated from '../../shared/authentication';
import { AuthValidation } from './auth.validator';
import { validateBody, validateParams } from '../../utilities/helper';
import { UserValidation } from '../users/user.validator';
import { authMiddleware } from './auth.middleware';

const router = Router();

router.post(
  '/request-otp',
  validateBody(AuthValidation.requestOtpValidation),
  AuthController.requestOtp
);

router.post(
  '/verify-otp',
  validateBody(AuthValidation.verifyOtpValidation),
  AuthController.verifyOtp
);

router.post(
  '/refresh-token',
  validateBody(AuthValidation.refreshTokenValidation),
  AuthController.refreshAccessToken
);

router.post('/signup', validateBody(UserValidation.createUserValidation), AuthController.signUp);

// Driver auth routes
router.post(
  '/drivers/signup',
  validateBody(UserValidation.createUserValidation),
  AuthController.driverSignUp
);
router.post(
  '/drivers/login',
  validateBody(AuthValidation.verifyOtpValidation),
  AuthController.driverLogin
);

// Signout route placed before strict isAuthenticated check so expired tokens or clients can cleanly sign out
router.post('/signout/:id', validateParams(UserValidation.idValidation), AuthController.signOut);

router.use(isAuthenticated);

router.get('/me', AuthController.getMe);

router.get('/get-deleted-user', AuthController.getDeletedUser);

router.get('/validate-session', authMiddleware, AuthController.validateSession);

export default router;
