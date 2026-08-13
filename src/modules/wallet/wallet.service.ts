import walletRepository from './wallet.repository';
import { WalletAutoReloadSettings } from './wallet.model';
import { UserRepository } from '../users/user.repository';
import { logger } from '../../shared/logger';
import { UserNotifications } from '../notifications/user.notification';

export const WalletService = {
  async getSettings(userId: string): Promise<WalletAutoReloadSettings | null> {
    return await walletRepository.getSettings(userId);
  },

  async updateSettings(
    userId: string,
    settings: Partial<WalletAutoReloadSettings>
  ): Promise<WalletAutoReloadSettings> {
    return await walletRepository.upsertSettings(userId, settings);
  },

  async checkAndTriggerAutoReload(userId: string, currentBalance: number): Promise<void> {
    try {
      const settings = await walletRepository.getSettings(userId);
      if (!settings) {
        return;
      }

      if (currentBalance >= settings.threshold_amount) {
        return;
      }

      const fcmToken = await UserRepository.getFcmTokenById(userId);

      // Trigger low balance notification
      if (settings.push_notification && fcmToken) {
        // Send low balance alert
        UserNotifications.walletLowBalance(fcmToken, currentBalance).catch((e) =>
          logger.error('FCM Error: ' + e)
        );
      }

      if (!settings.enabled) {
        return;
      }

      // Check Limits
      const dailyCount = await walletRepository.getDailyReloadCount(userId);
      if (dailyCount >= settings.daily_limit) {
        logger.warn(`User ${userId} exceeded daily auto-reload limit.`);
        return;
      }

      const monthlyCount = await walletRepository.getMonthlyReloadCount(userId);
      if (monthlyCount >= settings.monthly_limit) {
        logger.warn(`User ${userId} exceeded monthly auto-reload limit.`);
        return;
      }

      // Trigger payment
      const paymentSuccess = await this.chargeSavedPaymentMethod(
        userId,
        settings.payment_method_id,
        settings.reload_amount
      );

      if (paymentSuccess) {
        // Update user wallet balance using existing addToWallet method
        await UserRepository.addToWallet(
          userId,
          settings.reload_amount,
          'AUTO_RELOAD',
          'Auto-reload triggered'
        );

        await walletRepository.recordHistory({
          user_id: userId,
          amount: settings.reload_amount,
          status: 'SUCCESS',
        });

        if (settings.push_notification && fcmToken) {
          // Send success notification
          UserNotifications.walletAutoReloadSuccess(
            fcmToken,
            settings.reload_amount,
            currentBalance + settings.reload_amount
          ).catch((e) => logger.error('FCM Error: ' + e));
        }
      } else {
        await walletRepository.recordHistory({
          user_id: userId,
          amount: settings.reload_amount,
          status: 'FAILED',
          failure_reason: 'Payment failed',
        });

        if (settings.push_notification && fcmToken) {
          // Send failure notification
          UserNotifications.walletAutoReloadFailed(fcmToken).catch((e) =>
            logger.error('FCM Error: ' + e)
          );
        }
      }
    } catch (error) {
      logger.error(`Error in checkAndTriggerAutoReload for user ${userId}: ${error}`);
    }
  },

  async chargeSavedPaymentMethod(
    userId: string,
    paymentMethodId: string | undefined,
    amount: number
  ): Promise<boolean> {
    // Mock implementation for charging a saved payment method
    logger.info(
      `Mock charging payment method ${paymentMethodId} for user ${userId} amount ${amount}`
    );
    // Simulate successful payment 90% of the time
    return Math.random() > 0.1;
  },
};
