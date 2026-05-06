import cron from 'node-cron';
import { SubscriptionRepository } from '../modules/subscriptions/subscription.repository';
import { TripSchedulerService } from '../modules/trip/trip-scheduler.service';
import { acquireLock, releaseLock } from './redis';
import { logger } from './logger';
import { CouponService } from '../modules/coupon-management/coupon.service';
import { PromoService } from '../modules/promos/promo.service';

export const initCronJobs = () => {
  // Daily at midnight
  cron.schedule('0 0 * * *', async () => {
    const lockKey = 'daily_subscription_expiry';
    const hasLock = await acquireLock(lockKey, 3600); // 1 hour TTL for daily job
    if (!hasLock) return;

    logger.info('Running daily subscription expiration job...');
    try {
      const expiredCount = await SubscriptionRepository.expireReachedSubscriptions();
      logger.info(`Successfully expired ${expiredCount} subscriptions.`);
    } catch (error) {
      logger.error('Error running subscription expiration job:', error);
    } finally {
      await releaseLock(lockKey);
    }
  });
 
  // Trip Scheduler: Every minute
  cron.schedule('* * * * *', async () => {
    const lockKey = 'trip_scheduler_job';
    const hasLock = await acquireLock(lockKey, 50); // 50s TTL for a 1-min interval
    
    if (!hasLock) {
      logger.debug('Trip Scheduler job skipped: already running on another instance.');
      return;
    }

    logger.debug('Processing scheduled rides...');
    try {
      await TripSchedulerService.processScheduledRides();
      await TripSchedulerService.broadcastUpcomingScheduledRides();
    } catch (error) {
      logger.error('Error in Trip Scheduler job:', error);
    } finally {
      await releaseLock(lockKey);
    }
  });

  // Coupon Notification: Daily at 5 PM
  cron.schedule('0 17 * * *', async () => {
    const lockKey = 'daily_coupon_notifications';
    const hasLock = await acquireLock(lockKey, 3600);
    if (!hasLock) return;

    logger.info('Running expiring coupon notification job...');
    try {
      await CouponService.sendExpiryNotificationsForAllCoupons();
      logger.info('Expiring coupon notification job completed successfully.');
    } catch (error) {
      logger.error('Error in Coupon Notification job:', error);
    } finally {
      await releaseLock(lockKey);
    }
  });

  // Background Email Campaign Processor: Every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.debug('Checking for pending coupon notification campaigns...');
    try {
      await CouponService.processPendingNotifications();
    } catch (error) {
      logger.error('Error in Email Campaign Processor job:', error);
    }
  });

  // Background Promo Notification Processor: Every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.debug('Checking for pending promo notification campaigns...');
    try {
      await PromoService.processPendingNotifications();
    } catch (error) {
      logger.error('Error in Email Campaign Processor job:', error);
    }
  });

  // Sync Redis Driver Locations to Postgres: Every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    const lockKey = 'driver_location_sync_job';
    const hasLock = await acquireLock(lockKey, 280); // 280s TTL for a 5-min interval
    
    if (!hasLock) {
      logger.debug('Driver Location Sync job skipped: already running on another instance.');
      return;
    }

    logger.debug('Syncing driver locations from Redis to Postgres...');
    try {
      const { getRedisClient } = require('./redis');
      const redis = getRedisClient();
      const { getClient } = require('./database');

      const driverIds = await redis.zrange('driver_locations', 0, -1);
      if (driverIds.length === 0) {
        await releaseLock(lockKey);
        return;
      }

      const coordinates = await redis.geopos('driver_locations', ...driverIds);
      
      const client = await getClient();
      try {
        await client.query('BEGIN');
        
        let updateCount = 0;
        for (let i = 0; i < driverIds.length; i++) {
          const driverId = driverIds[i];
          const coord = coordinates[i];
          if (coord) {
            const [lng, lat] = coord;
            const address = await redis.hget(`driver_info:${driverId}`, 'address') || '';

            await client.query(`
              UPDATE drivers 
              SET 
                  current_lat = $1,
                  current_lng = $2,
                  location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                  last_active = NOW()
              WHERE id = $3 AND is_deleted = FALSE
            `, [parseFloat(lat), parseFloat(lng), driverId]);
            updateCount++;
          }
        }

        await client.query('COMMIT');
        logger.info(`Successfully synced ${updateCount} driver locations to Postgres.`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error in Driver Location Sync job:', error);
    } finally {
      await releaseLock(lockKey);
    }
  });

  logger.info('✅ Cron jobs initialized');
};
