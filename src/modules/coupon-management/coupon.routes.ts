import { Router } from 'express';
import { CouponController } from './coupon.controller';
import isServiceAuthenticated from '../../shared/serviceAuthentication';
import isAuthenticated from '../../shared/authentication';

const router = Router();

// All coupon routes require user authentication
router.post('/validate', isAuthenticated, CouponController.validateCoupon);
router.get('/available', isAuthenticated, CouponController.getAvailableCoupons);

export default router;
