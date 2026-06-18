import { Request, Response } from 'express';
import { CouponService } from './coupon.service';
import { CouponRepository } from './coupon.repository';
import { logger } from '../../shared/logger';

export const CouponController = {
  /**
   * Validates a coupon code and returns discount info
   */
  async validateCoupon(req: Request, res: Response) {
    try {
      const { code, rideAmount } = req.body;
      const userId = (req as any).user.id;

      if (!code || !rideAmount) {
        return res.status(400).json({ error: 'Code and rideAmount are required' });
      }

      const coupon = await CouponService.validateCoupon(code, userId, parseFloat(rideAmount));
      const discount = CouponService.calculateDiscount(coupon, parseFloat(rideAmount));

      return res.status(200).json({
        success: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
        },
        discount_amount: discount,
        final_fare: parseFloat(rideAmount) - discount,
      });
    } catch (error: any) {
      logger.error(`Error in CouponController.validateCoupon: ${error.message}`);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  },

  /**
   * Fetches available coupons for the logged-in user
   */
  async getAvailableCoupons(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const coupons = await CouponRepository.getAvailableCoupons(userId);

      return res.status(200).json({
        success: true,
        coupons,
      });
    } catch (error: any) {
      logger.error(`Error in CouponController.getAvailableCoupons: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  },
};
