// src/modules/referrals/referral.service.ts
import { v4 as uuidv4 } from 'uuid';
import { ReferralRepository } from './referral.repository';
import { logger } from '../../shared/logger';
import crypto from 'crypto';

export const ReferralService = {
  /**
   * Generate unique referral code for a user
   * Format: ref_<USER_ID>_<RANDOM_8_CHAR>
   */
  async generateReferralCode(userId: string) {
    try {
      const existingCode = await ReferralRepository.getReferralCodeByUserId(userId);

      if (existingCode) {
        return existingCode;
      }

      const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
      const hash = crypto
        .createHash('sha256')
        .update(userId)
        .digest('hex')
        .substring(0, 4)
        .toUpperCase();
      const code = `REF_${randomPart}${hash}`;

      await ReferralRepository.insertReferralCode(code, userId);

      return code;
    } catch (error) {
      logger.error('Error generating referral code:', error);
      throw error;
    }
  },

  /**
   * Validate referral code during signup
   */
  async validateReferralCode(code: string, refereeUserId: string) {
    try {
      const codeResult = await ReferralRepository.getReferralCodeDetails(code);

      if (!codeResult) {
        return { valid: false, error: 'Invalid referral code' };
      }

      const { user_id: referrerId, is_active } = codeResult;

      if (!is_active) {
        return { valid: false, error: 'Referral code is inactive' };
      }

      const existingReferral =
        await ReferralRepository.getReferralRelationshipByReferred(refereeUserId);

      if (existingReferral) {
        return { valid: false, error: 'This account already used a referral code' };
      }

      if (referrerId === refereeUserId) {
        return { valid: false, error: 'Cannot use your own referral code' };
      }

      return { valid: true, referrerId };
    } catch (error) {
      logger.error('Error validating referral code:', error);
      return { valid: false, error: 'Error validating code' };
    }
  },

  /**
   * Pre-Validate referral code before signup (Unauthenticated)
   */
  async preValidateReferralCode(code: string) {
    try {
      const codeResult = await ReferralRepository.getReferralCodeDetails(code);

      if (!codeResult) {
        return { valid: false, error: 'Invalid referral code' };
      }

      if (!codeResult.is_active) {
        return { valid: false, error: 'Referral code is inactive' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error pre-validating referral code:', error);
      return { valid: false, error: 'Error validating code' };
    }
  },

  /**
   * Create referral relationship when user completes signup
   */
  async createReferralRelationship(referrerId: string, refereeUserId: string, code: string) {
    try {
      return await ReferralRepository.createReferralRelationship(referrerId, refereeUserId, code);
    } catch (error) {
      logger.error('Error creating referral relationship:', error);
      throw error;
    }
  },

  /**
   * Apply referral discount during checkout
   */
  async applyReferralDiscount(refereeUserId: string, minRideAmount = 0, tripId?: string) {
    try {
      const relationship =
        await ReferralRepository.getReferralRelationshipByReferred(refereeUserId);

      if (!relationship || relationship.status !== 'PENDING') {
        return { applied: false, error: 'No valid referral found' };
      }

      // Fetch dynamic referral configuration for Customers
      const config = await ReferralRepository.getActiveConfig('CUSTOMER');

      let discountValue = 50; // Default fallback
      let discountType = 'PERCENTAGE'; // Default fallback

      if (config) {
        discountValue = Number(config.referee_reward);
        discountType = config.referee_reward_type;
      }

      const { id: relationshipId, referrer_user_id: referrerId } = relationship;

      // If tripId is provided, update the trip record with the discount
      if (tripId) {
        const { TripRepository } = require('../trip/trip.repository');
        await TripRepository.updateTrip(tripId, '"discount" = $1', [discountValue]);
      }

      return {
        applied: true,
        discountType,
        discountValue,
        relationshipId,
        referrerId,
      };
    } catch (error) {
      logger.error('Error applying referral discount:', error);
      return { applied: false, error: 'Error applying discount' };
    }
  },

  /**
   * Complete referral after first ride/purchase
   */
  async completeReferral(relationshipId: string, refereeUserId: string, rideAmount: number) {
    try {
      // For now, defaulting to CUSTOMER configuration.
      // In a more advanced setup, we would determine the user type from the relationship.
      const config = await ReferralRepository.getActiveConfig('CUSTOMER');

      let REFERRER_REWARD = 200; // Default fallback
      let REFEREE_REWARD = 100; // Default fallback

      if (config) {
        REFERRER_REWARD =
          config.referrer_reward_type === 'PERCENTAGE'
            ? (Number(rideAmount) * Number(config.referrer_reward)) / 100
            : Number(config.referrer_reward);

        REFEREE_REWARD =
          config.referee_reward_type === 'PERCENTAGE'
            ? (Number(rideAmount) * Number(config.referee_reward)) / 100
            : Number(config.referee_reward);
      }

      return await ReferralRepository.completeReferralTransaction(
        relationshipId,
        refereeUserId,
        REFERRER_REWARD,
        REFEREE_REWARD
      );
    } catch (error) {
      logger.error('Error completing referral:', error);
      throw error;
    }
  },

  /**
   * Get referral code for a user
   */
  async getReferralCode(userId: string) {
    try {
      return await ReferralRepository.getReferralCodeByUserId(userId);
    } catch (error) {
      logger.error('Error getting referral code:', error);
      throw error;
    }
  },

  /**
   * Get referral stats for a user
   */
  async getReferralStats(userId: string) {
    try {
      return await ReferralRepository.getReferralStats(userId);
    } catch (error) {
      logger.error('Error getting referral stats:', error);
      throw error;
    }
  },

  /**
   * Check if user already used a referral code
   */
  async hasUsedReferralCode(userId: string) {
    try {
      return await ReferralRepository.checkReferralUsage(userId);
    } catch (error) {
      logger.error('Error checking referral usage:', error);
      throw error;
    }
  },
};
