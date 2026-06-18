// src/modules/notifications/notification.service.ts
import * as admin from 'firebase-admin';
import { query } from '../../shared/database';
import { logger } from '../../shared/logger';
import { sendToDevice } from '../../config/firebase';

// 🛡️ Firebase is already initialized in src/app.ts via src/config/firebase.ts
// We just import 'admin' and it will be available.

/* ================================================================
   NOTIFICATION SERVICE
   ================================================================ */

// In-memory cache for simple rate limiting (key → timestamp)
const rateLimitCache = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds

/** Ride-related notification types that should use the ride_requests channel */
const RIDE_TYPES = new Set(['ride_request', 'NEW_RIDE_REQUEST', 'ASSIGNED_RIDE', 'TRIP_ASSIGNED']);

export const NotificationService = {
  /**
   * Send a push notification to a specific FCM token.
   * Includes built-in rate limiting to prevent duplicate sends.
   */
  async sendNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<string | null> {
    if (!title || !body) {
      logger.warn(
        `[FCM] Sending notification with missing content. Title: "${title}", Body: "${body}"`
      );
    }

    // 🛡️ Global Rate-limit (Distributed Lock): prevent duplicate notifications for the same trip within 10s
    // Using tripId and driverId in the lock key to ensure absolute uniqueness across servers
    const tripId = data?.trip_id || data?.bookingId || data?.tripId || '';
    const targetId = data?.driverId || data?.driver_id || token.substring(0, 8);
    const lockKey = `notif:${targetId}:${title}:${tripId}`;

    const now = Date.now();
    try {
      const { acquireLock } = require('../../shared/redis');
      const isLockAcquired = await acquireLock(lockKey, RATE_LIMIT_WINDOW_MS / 1000);

      if (!isLockAcquired) {
        logger.warn(`[FCM] Blocking duplicate notification (Global Lock): ${lockKey}`);
        return null;
      }
    } catch (err) {
      logger.error(`[FCM] Redis lock error (falling back to memory): ${err}`);
      // Fallback to local memory if Redis fails
      const lastSent = rateLimitCache.get(lockKey);
      if (lastSent && now - lastSent < RATE_LIMIT_WINDOW_MS) return null;
      rateLimitCache.set(lockKey, now);
    }

    // Cleanup old entries every 100 calls to prevent memory leak
    if (rateLimitCache.size > 500) {
      const cutoff = now - RATE_LIMIT_WINDOW_MS;
      for (const [key, ts] of rateLimitCache) {
        if (ts < cutoff) rateLimitCache.delete(key);
      }
    }

    try {
      const result = await sendToDevice(token, {
        title: title || 'vDrive Alert',
        body: body || 'Tap to view details',
        type: data?.type || 'notification',
        data,
        androidChannelId: RIDE_TYPES.has(data?.type || '') ? 'ride_requests' : 'default',
      });

      if (result.success) {
        return result.messageId || 'success';
      }

      // Handle invalid token cleanup
      if (result.error === 'INVALID_TOKEN') {
        logger.warn(`Clearing invalid token: ${token.substring(0, 20)}...`);
        await query('UPDATE drivers SET fcm_token = NULL WHERE fcm_token = $1', [token]);
        await query('UPDATE users SET fcm_token = NULL WHERE fcm_token = $1', [token]);
      }

      return null;
    } catch (error: any) {
      logger.error(`❌ NotificationService.sendNotification error: ${error.message}`);
      return null;
    }
  },

  /**
   * Send a push notification to a driver by their ID
   * Looks up the driver's FCM token from the database
   */
  async sendNotificationToDriver(
    driverId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<string | null> {
    try {
      const result = await query('SELECT fcm_token FROM drivers WHERE id = $1', [driverId]);

      if (result.rows.length === 0) {
        logger.error(`Driver not found: ${driverId}`);
        throw { statusCode: 404, message: 'Driver not found' };
      }

      const fcmToken = result.rows[0].fcm_token;

      if (!fcmToken) {
        logger.warn(`No FCM token for driver: ${driverId}`);
        throw {
          statusCode: 400,
          message: 'Driver does not have an FCM token registered',
        };
      }

      return await this.sendNotification(fcmToken, title, body, data);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Send a push notification to a user by their ID
   * Looks up the user's FCM token from the database
   */
  async sendNotificationToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<string | null> {
    try {
      const result = await query('SELECT fcm_token FROM users WHERE id = $1', [userId]);

      if (result.rows.length === 0) {
        logger.error(`User not found: ${userId}`);
        throw { statusCode: 404, message: 'User not found' };
      }

      const fcmToken = result.rows[0].fcm_token;

      if (!fcmToken) {
        logger.warn(`No FCM token for user: ${userId}`);
        throw {
          statusCode: 400,
          message: 'User does not have an FCM token registered',
        };
      }

      return await this.sendNotification(fcmToken, title, body, data);
    } catch (error) {
      throw error;
    }
  },
};
