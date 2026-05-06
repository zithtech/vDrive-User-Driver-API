// src/modules/driver-referrals/driver-referral.controller.ts
// Driver referral API handlers

import { Request, Response, NextFunction } from 'express';
import { DriverReferralRepository } from './driver-referral.repository';
import { DriverRepository } from '../drivers/driver.repository';
import { successResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';
import { PromoService } from '../promos/promo.service';
import config from '../../config';

export const DriverReferralController = {
  /**
   * GET /drivers/referral/code
   * Returns the current driver's referral code. Generates one if it doesn't exist.
   */
  async getMyReferralCode(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user?.id;
      if (!driverId) throw { statusCode: 401, message: 'Unauthorized' };

      const driver = await DriverRepository.findById(driverId);
      if (!driver) throw { statusCode: 404, message: 'Driver not found' };

      let referralCode = driver.referral_code;

      // Generate if doesn't exist (for existing drivers before the feature)
      if (!referralCode) {
        referralCode = await DriverReferralRepository.generateUniqueReferralCode(driver.first_name || 'VDR', 'DRIVER');
        await DriverRepository.update(driverId, { referral_code: referralCode });
      }

      const config = await DriverReferralRepository.getActiveConfig('DRIVER');
      const refereeReward = config ? config.referee_reward : 100;

      return successResponse(res, 200, 'Referral code fetched successfully', {
        referral_code: referralCode,
        share_message: `Hey! Join V-Drive using my code ${referralCode} and get ₹${refereeReward} subscription discount after your first ride! Download now: ${config.referralDownloadUrl}`,
      });
    } catch (err: any) {
      logger.error(`Error fetching referral code: ${err.message}`);
      next(err);
    }
  },

  /**
   * GET /drivers/referral/stats
   * Returns referral statistics for the current driver.
   */
  async getMyReferralStats(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user?.id;
      if (!driverId) throw { statusCode: 401, message: 'Unauthorized' };

      const stats = await DriverReferralRepository.getStatsByReferrer(driverId, 'DRIVER');
      const referralCoupons = await PromoService.getReferralRewardsForDriver(driverId);
      
      const totalCouponValue = referralCoupons.reduce((sum, p) => sum + Number(p.discount_value), 0);

      return successResponse(res, 200, 'Referral stats fetched successfully', {
        total_referrals: parseInt(stats.total_referrals) || 0,
        successful_referrals: parseInt(stats.successful_referrals) || 0,
        pending_referrals: parseInt(stats.pending_referrals) || 0,
        total_earned_coupons: totalCouponValue,
        earned_coupons: referralCoupons.map(p => ({
          code: p.code,
          value: p.discount_value,
          description: p.description,
          expiry_date: p.expiry_date,
          is_used: (p as any).isUsed
        })),
      });
    } catch (err: any) {
      logger.error(`Error fetching referral stats: ${err.message}`);
      next(err);
    }
  },

  /**
   * POST /drivers/referral/apply
   * Validates a referral code during driver registration.
   * Body: { code: string }
   */
  async applyReferralCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        throw { statusCode: 400, message: 'Referral code is required' };
      }

      const cleanCode = code.trim().toUpperCase();

      // Find the driver who owns this code
      const referrerId = await DriverReferralRepository.findByCode(cleanCode, 'DRIVER');

      if (!referrerId) {
        return successResponse(res, 200, 'Invalid referral code', {
          valid: false,
          message: 'This referral code does not exist.',
        });
      }

      const config = await DriverReferralRepository.getActiveConfig('DRIVER');
      const refereeReward = config ? config.referee_reward : 100;

      return successResponse(res, 200, 'Referral code is valid', {
        valid: true,
        referral_code: cleanCode,
        message: `Code applied! You will receive ₹${refereeReward} off on your subscription after your first ride.`,
      });
    } catch (err: any) {
      logger.error(`Error applying referral code: ${err.message}`);
      next(err);
    }
  },
};
