// src/modules/driver-referrals/driver-referral.service.ts
// Driver referral business logic — reward processing, coupon issuance

import { DriverReferralRepository } from './driver-referral.repository';
import { DriverRepository } from '../drivers/driver.repository';
import { PromoService } from '../promos/promo.service';
import { NotificationService } from '../notifications/notification.service';
import { logger } from '../../shared/logger';
import { getClient } from '../../shared/database';

export const DriverReferralService = {
  async processReferralReward(driverId: string) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Check if driver was referred
      const referral = await DriverReferralRepository.findByRefereeId(driverId, 'DRIVER', client);
      if (!referral || referral.status === 'COMPLETED') {
        await client.query('ROLLBACK');
        return;
      }

      // 2. Double check first ride completion
      const rideCount = await client.query(
        "SELECT COUNT(*) FROM trips WHERE driver_id = $1 AND trip_status = 'COMPLETED'",
        [driverId]
      );

      const count = parseInt(rideCount.rows[0].count);
      if (count !== 1) {
        await client.query('ROLLBACK');
        return;
      }

      // 3. Mark referral as COMPLETED
      await DriverReferralRepository.updateStatus(referral.id, 'COMPLETED', client);

      // 4. Issue Rewards
      const config = await DriverReferralRepository.getActiveConfig('DRIVER');

      const REFEREE_REWARD = config ? parseFloat(config.referee_reward) : 100;
      const REFERRER_REWARD = config ? parseFloat(config.referrer_reward) : 50;

      const referrer = await DriverRepository.findById(referral.referrer_id);
      const referee = await DriverRepository.findById(driverId);

      if (referrer) {
        await this.issueReferralCoupon(
          referrer.driverId as string,
          REFERRER_REWARD,
          'REFERRER',
          `Reward for referring ${referee?.full_name || 'a new driver'}`,
          client
        );
      }

      if (referee) {
        await this.issueReferralCoupon(
          referee.driverId as string,
          REFEREE_REWARD,
          'REFEREE',
          `Welcome reward for joining via referral`,
          client
        );
      }

      await client.query('COMMIT');
      logger.info(
        `Referral rewards issued for driver ${driverId} (Referred by ${referral.referrer_id})`
      );
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in processReferralReward:', error);
    } finally {
      client.release();
    }
  },

  async issueWalletReward(
    driverId: string,
    amount: number,
    type: string,
    description: string,
    client?: any
  ) {
    try {
      // 1. Add credit to driver's wallet
      await DriverRepository.addCredit(driverId, amount, 'REFERRAL_REWARD', description, client);

      // 2. Send Push Notification
      const title = '🎁 Referral Reward Received!';
      const body = `Congratulations! ₹${amount} has been added to your wallet rewards for: ${description}.`;

      await NotificationService.sendNotificationToDriver(driverId, title, body, {
        type: 'REFERRAL_REWARD',
        amount: amount.toString(),
      }).catch((err) => logger.error(`Failed to send referral notification to ${driverId}:`, err));

      return true;
    } catch (error) {
      logger.error(`Error issuing wallet reward to ${driverId}:`, error);
      throw error;
    }
  },

  async issueReferralCoupon(
    driverId: string,
    amount: number,
    type: string,
    description: string,
    client?: any
  ) {
    // 1. Generate unique promo code
    const code = `REWARD-${type}-${driverId.substring(0, 5).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const promoData = {
      code,
      description: `Referral Reward - ${type}: ${description}`,
      discount_type: 'fixed',
      discount_value: amount,
      target_type: 'specific_driver',
      target_driver_id: driverId,
      min_rides_required: 0,
      max_uses: 1,
      max_uses_per_driver: 1,
      start_date: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago to handle clock drift
      expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days expiry
      is_active: true,
      promo_type: 'REFERRAL_REWARD',
    };

    const promo = await PromoService.createPromo(promoData);

    // 2. Send Push Notification
    const title = '🎁 Referral Reward Received!';
    const body = `Congratulations! You've earned a ₹${amount} coupon for: ${description}. Use code ${code} for your next subscription.`;

    await NotificationService.sendNotificationToDriver(driverId, title, body, {
      type: 'REFERRAL_COUPON',
      code: code,
      amount: amount.toString(),
    }).catch((err) => logger.error(`Failed to send referral notification to ${driverId}:`, err));

    return promo;
  },
};
