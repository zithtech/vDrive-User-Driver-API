// src/modules/referrals/referral.controller.ts
import { Request, Response } from 'express';
import { ReferralService } from './referral.service';
import { logger } from '../../shared/logger';
import { ReferralRepository } from './referral.repository';

export const ReferralController = {
  async generateCode(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id;
      if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const code = await ReferralService.generateReferralCode(user_id);
      return res.status(200).json({ success: true, data: { referralCode: code } });
    } catch (error: any) {
      logger.error('ReferralController.generateCode error', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  },

  async validateCode(req: Request, res: Response) {
    try {
      const { code } = req.body;
      const refereeUserId = (req as any).user?.id; // Usually validated at signup, passed here

      if (!code || !refereeUserId) {
        return res.status(400).json({ error: 'Code and Referee User ID are required' });
      }

      const result = await ReferralService.validateReferralCode(code, refereeUserId);
      if (!result.valid) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      logger.error('ReferralController.validateCode error', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  },

  async preValidateCode(req: Request, res: Response) {
    try {
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: 'Code is required' });
      }

      const result = await ReferralService.preValidateReferralCode(code);
      if (!result.valid) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      logger.error('ReferralController.preValidateCode error', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  },

  async applyDiscount(req: Request, res: Response) {
    try {
      const refereeUserId = (req as any).user?.id;
      const { minRideAmount, tripId } = req.body;

      if (!refereeUserId) {
        return res.status(400).json({ error: 'Referee User ID is required' });
      }

      const result = await ReferralService.applyReferralDiscount(
        refereeUserId,
        minRideAmount,
        tripId
      );
      if (!result.applied) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      logger.error('ReferralController.applyDiscount error', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  },

  async getStats(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id;
      if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const stats = await ReferralService.getReferralStats(user_id);
      return res.status(200).json({ success: true, data: stats });
    } catch (error: any) {
      logger.error('ReferralController.getStats error', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  },

  async getCode(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id;
      if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const code = await ReferralService.getReferralCode(user_id);
      return res.status(200).json({ success: true, data: { referralCode: code || null } });
    } catch (error: any) {
      logger.error('ReferralController.getCode error', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  },

  async checkEligibility(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const hasUsed = await ReferralService.hasUsedReferralCode(userId);
      // eligibility means they HAVE a relationship record (used a code) but status is PENDING
      const relationship = await ReferralRepository.getReferralRelationshipByReferred(userId);

      return res.status(200).json({
        success: true,
        data: {
          isReferred: !!relationship,
          isEligible: relationship?.status === 'PENDING',
        },
      });
    } catch (error: any) {
      logger.error('ReferralController.checkEligibility error', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  },
};
