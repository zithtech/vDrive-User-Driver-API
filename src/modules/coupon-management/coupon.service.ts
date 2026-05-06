import { CouponRepository } from './coupon.repository';
import { logger } from '../../shared/logger';
import { sendToTopic, sendToMultipleDevices } from '../../config/firebase';
import { CouponNotificationRepository } from './coupon-notification.repository';

export const CouponService = {
  /**
   * Validates a coupon for a specific ride
   */
  async validateCoupon(code: string, userId: string, rideAmount: number, ignoreAmount: boolean = false) {
    const coupon = await CouponRepository.findByCode(code);

    if (!coupon) {
      throw { statusCode: 404, message: 'Invalid or expired coupon code' };
    }

    if (!coupon.is_active) {
      throw { statusCode: 400, message: 'This coupon is no longer active' };
    }

    // Check expiry
    const now = new Date();
    if (new Date(coupon.valid_until) < now) {
      throw { statusCode: 400, message: 'This coupon has expired' };
    }

    if (new Date(coupon.valid_from) > now) {
      throw { statusCode: 400, message: 'This coupon is not yet valid' };
    }

    // Check minimum ride amount
    if (!ignoreAmount && rideAmount < parseFloat(coupon.min_ride_amount)) {
      throw {
        statusCode: 400,
        message: `Min ride amount of ${coupon.min_ride_amount} required to use this coupon`
      };
    }

    // Check user eligibility
    if (coupon.user_eligibility !== 'ALL' && coupon.user_eligibility !== userId) {
      throw { statusCode: 400, message: 'You are not eligible for this coupon' };
    }

    // Check total usage limit
    if (coupon.usage_limit) {
      const totalUsed = await CouponRepository.getTotalUsageCount(coupon.id);
      if (totalUsed >= coupon.usage_limit) {
        throw { statusCode: 400, message: 'Coupon usage limit reached' };
      }
    }

    // Check per user limit
    if (coupon.per_user_limit) {
      const userUsed = await CouponRepository.getUserUsageCount(coupon.id, userId);
      if (userUsed >= coupon.per_user_limit) {
        throw { statusCode: 400, message: 'You have already reached the limit for this coupon' };
      }
    }

    return coupon;
  },

  /**
   * Calculates the discount amount for a given coupon and fare
   */
  calculateDiscount(coupon: any, rideAmount: number): number {
    let discount = 0;

    if (coupon.discount_type === 'PERCENTAGE') {
      discount = (rideAmount * parseFloat(coupon.discount_value)) / 100;
      if (coupon.max_discount_amount) {
        discount = Math.min(discount, parseFloat(coupon.max_discount_amount));
      }
    } else if (coupon.discount_type === 'FIXED') {
      discount = parseFloat(coupon.discount_value);
    }

    // Ensure discount doesn't exceed ride amount
    return Math.min(discount, rideAmount);
  },

  /**
   * Marks a coupon as used after a successful trip
   */
  async markAsUsed(couponId: string, userId: string, tripId: string, discountApplied: number) {
    try {
      await CouponRepository.trackUsage({
        coupon_id: couponId,
        user_id: userId,
        trip_id: tripId,
        discount_applied: discountApplied
      });
      logger.info(`Coupon ${couponId} marked as used for trip ${tripId}`);
    } catch (error) {
      logger.error(`Error marking coupon as used: ${error}`);
      // We don't want to fail the whole trip completion if coupon tracking fails,
      // but it's important to log it.
    }
  },

  /**
   * Cron job logic: Notify users about coupons expiring within 24 hours
   */
  async sendExpiryNotificationsForAllCoupons() {
    logger.info('Running expiring coupon notification job...');

    // Find coupons expiring in the next 24 hours
    const expiringCoupons = await CouponRepository.getExpiringCoupons(24);

    for (const coupon of expiringCoupons) {
      try {
        const payload = {
          type: 'COUPON_EXPIRY',
          title: 'Hurry! Coupon expires soon',
          body: `Your coupon ${coupon.code} expires in 24 hours`,
          data: { coupon_code: coupon.code }
        };

        if (coupon.user_eligibility === 'ALL') {
          // Broadcast via topic
          const topicName = `coupon_${coupon.code}`;
          await sendToTopic(topicName, payload);
          logger.info(`Broadcasted expiry notification for coupon ${coupon.code} via topic ${topicName}`);
        } else {
          // Targeted coupon -> send only to subscribed users
          const tokens = await CouponRepository.getSubscribedTokens(coupon.id);
          
          if (tokens.length > 0) {
            await sendToMultipleDevices(tokens, payload);
            logger.info(`Sent targeted expiry notifications for coupon ${coupon.code} to ${tokens.length} users`);
          } else {
            logger.info(`No subscribers found for targeted coupon ${coupon.code}`);
          }
        }
      } catch (error) {
        logger.error(`Error sending expiry notification for coupon ${coupon.id}: ${error}`);
      }
    }
  },

  /**
   * Cron job logic: Process pending email notification campaigns in batches
   */
  async processPendingNotifications() {
    const { EmailService } = require('../email/email.service');

    const campaigns = await CouponNotificationRepository.getPendingCampaigns();
    if (campaigns.length === 0) return;

    for (const coupon of campaigns) {
      logger.info(`Processing notification campaign for coupon: ${coupon.code} (${coupon.id})`);
      
      try {
        await CouponNotificationRepository.lockCampaign(coupon.id);

        let offset = 0;
        const batchSize = 50;
        let totalSentInThisRun = 0;
        let hasMoreUsers = true;

        while (hasMoreUsers && totalSentInThisRun < 500) { // Safety limit per cron run
          const users = await CouponNotificationRepository.getTargetUsers(
            coupon.notify_target, 
            coupon.notify_specific_user_id, 
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
              const alreadySent = await CouponNotificationRepository.hasReceivedNotification(coupon.id, user.id);
              if (alreadySent) continue;

              await EmailService.sendCouponEmail(user.email, user.full_name, coupon);
              await CouponNotificationRepository.logNotification(coupon.id, user.id, 'SENT');
              totalSentInThisRun++;
            } catch (error) {
              logger.error(`Error sending email to user ${user.id}: ${error}`);
              await CouponNotificationRepository.logNotification(coupon.id, user.id, 'FAILED', String(error));
            }
          }

          offset += batchSize;
          
          // If we reached the end of users for this target type
          if (users.length < batchSize) {
            hasMoreUsers = false;
          }

          // Small delay between batches to be nice to the SMTP server
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Update status. If hasMoreUsers is true, it means we hit the safety limit, 
        // so we keep it in PROCESSING to be picked up again (or reset to PENDING if we want).
        // For simplicity, if we hit the limit, we'll mark as PENDING again but the lock will be reset.
        const nextStatus = hasMoreUsers ? 'PENDING' : 'COMPLETED';
        await CouponNotificationRepository.updateCampaignStatus(coupon.id, nextStatus, totalSentInThisRun);
        
        logger.info(`Campaign for ${coupon.code}: Sent ${totalSentInThisRun} emails. Status: ${nextStatus}`);

      } catch (error) {
        logger.error(`Failed to process campaign for coupon ${coupon.id}: ${error}`);
        await CouponNotificationRepository.updateCampaignStatus(coupon.id, 'FAILED', 0);
      }
    }
  }
};
