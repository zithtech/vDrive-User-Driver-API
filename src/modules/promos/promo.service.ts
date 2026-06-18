import { PromoRepository } from './promo.repository';
import { TripRepository } from '../trip/trip.repository';
import { ValidatePromoResponse } from './promo.model';
import { PromoNotificationRepository } from './promo-notification.repository';
import { logger } from '../../shared/logger';

export const PromoService = {
  async validatePromo(
    code: string,
    driverId: string,
    currentAmount: number
  ): Promise<ValidatePromoResponse> {
    const promo = await PromoRepository.findByCode(code);

    if (!promo) {
      return { isValid: false, discountAmount: 0, message: 'Invalid or expired promo code' };
    }

    // 1. Global usage limit check
    if (promo.max_uses !== null && promo.max_uses !== undefined) {
      const totalUsed = await PromoRepository.getUsageCount(promo.id);
      if (totalUsed >= promo.max_uses) {
        return { isValid: false, discountAmount: 0, message: 'Promo code usage limit reached' };
      }
    }

    // 2. Per-driver usage limit check
    const driverUsed = await PromoRepository.getUsageCount(promo.id, driverId);
    if (driverUsed >= promo.max_uses_per_driver) {
      return {
        isValid: false,
        discountAmount: 0,
        message: 'You have already used this promo code',
      };
    }

    // 3. Targeting & Eligibility Logic
    if (promo.target_type === 'specific_driver') {
      if (promo.target_driver_id !== driverId) {
        return {
          isValid: false,
          discountAmount: 0,
          message: 'This offer is not valid for your account',
        };
      }
    } else if (promo.target_type === 'ride_count_based') {
      const stats = await TripRepository.getStatsByDriverId(driverId);
      const completedRides = parseInt(stats?.completed_trips || '0');

      if (completedRides < promo.min_rides_required) {
        return {
          isValid: false,
          discountAmount: 0,
          message: `This offer requires a minimum of ${promo.min_rides_required} completed rides. You have ${completedRides}.`,
        };
      }
    }

    // 4. Calculate Discount
    let discountAmount = 0;
    if (promo.discount_type === 'percentage') {
      discountAmount = (currentAmount * promo.discount_value) / 100;
    } else {
      discountAmount = Math.min(Number(promo.discount_value), currentAmount);
    }

    return {
      isValid: true,
      promo,
      discountAmount,
      message: 'Promo applied successfully',
    };
  },

  async usePromo(
    promoId: number,
    driverId: string,
    paymentId: number,
    discountApplied: number,
    client?: any
  ) {
    return await PromoRepository.recordUsage(
      {
        promo_id: promoId,
        driver_id: driverId,
        payment_id: paymentId,
        discount_applied: discountApplied,
      },
      client
    );
  },

  async getAllPromos() {
    return await PromoRepository.findAll();
  },

  async getPromoById(id: number) {
    return await PromoRepository.findById(id);
  },

  async createPromo(data: any) {
    return await PromoRepository.create(data);
  },

  async updatePromo(id: number, data: any) {
    return await PromoRepository.update(id, data);
  },

  async deletePromo(id: number) {
    return await PromoRepository.delete(id);
  },

  async getAvailablePromosForDriver(driverId: string) {
    return await PromoRepository.findAvailableForDriver(driverId);
  },

  /**
   * Cron job logic: Process pending email notification campaigns in batches
   */
  async processPendingNotifications() {
    const { EmailService } = require('../email/email.service');

    const campaigns = await PromoNotificationRepository.getPendingCampaigns();
    if (campaigns.length === 0) return;

    for (const coupon of campaigns) {
      logger.info(`Processing notification campaign for coupon: ${coupon.code} (${coupon.id})`);

      try {
        await PromoNotificationRepository.lockCampaign(coupon.id);

        let offset = 0;
        const batchSize = 50;
        let totalSentInThisRun = 0;
        let hasMoreUsers = true;

        while (hasMoreUsers && totalSentInThisRun < 500) {
          // Safety limit per cron run
          const users = await PromoNotificationRepository.getTargetDrivers(
            coupon.notify_target,
            coupon.notify_specific_driver_id,
            batchSize,
            offset
          );

          if (users.length === 0) {
            hasMoreUsers = false;
            break;
          }

          for (const user of users) {
            try {
              // Check if already sent to avoid duplicates in case of crash/restart
              const alreadySent = await PromoNotificationRepository.hasReceivedNotification(
                coupon.id,
                user.id
              );
              if (alreadySent) continue;

              await EmailService.sendCouponEmail(user.email, user.full_name, coupon);
              await PromoNotificationRepository.logNotification(coupon.id, user.id, 'SENT');
              totalSentInThisRun++;
            } catch (error) {
              logger.error(`Error sending email to user ${user.id}: ${error}`);
              await PromoNotificationRepository.logNotification(
                coupon.id,
                user.id,
                'FAILED',
                String(error)
              );
            }
          }

          offset += batchSize;

          // If we reached the end of users for this target type
          if (users.length < batchSize) {
            hasMoreUsers = false;
          }

          // Small delay between batches to be nice to the SMTP server
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Update status. If hasMoreUsers is true, it means we hit the safety limit,
        // so we keep it in PROCESSING to be picked up again (or reset to PENDING if we want).
        // For simplicity, if we hit the limit, we'll mark as PENDING again but the lock will be reset.
        const nextStatus = hasMoreUsers ? 'PENDING' : 'COMPLETED';
        await PromoNotificationRepository.updateCampaignStatus(
          coupon.id,
          nextStatus,
          totalSentInThisRun
        );

        logger.info(
          `Campaign for ${coupon.code}: Sent ${totalSentInThisRun} emails. Status: ${nextStatus}`
        );
      } catch (error) {
        logger.error(`Failed to process campaign for coupon ${coupon.id}: ${error}`);
        await PromoNotificationRepository.updateCampaignStatus(coupon.id, 'FAILED', 0);
      }
    }
  },
  async getReferralRewardsForDriver(driverId: string) {
    const rewards = await PromoRepository.findReferralRewardsForDriver(driverId);

    // Check usage for each reward to mark as used/unused
    const rewardsWithStatus = await Promise.all(
      rewards.map(async (promo) => {
        const usageCount = await PromoRepository.getUsageCount(promo.id, driverId);
        return {
          ...promo,
          isUsed: usageCount > 0,
        };
      })
    );

    return rewardsWithStatus;
  },
};
