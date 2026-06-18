import { Driver } from './../drivers/driver.model';
import { query } from '../../shared/database';
import { User } from '../users/user.model';
import { OTP } from '../auth/otp.model';
import * as bcrypt from 'bcrypt';
import { logger } from '../../shared/logger';
import { unsubscribeFromTopic } from '../../config/firebase';
import { UserRole } from '../../enums/user.enums';

export const AuthRepository = {
  async saveHashedOtp(
    phone_number: string,
    role: string,
    otpHash: string,
    expires_at: Date,
    attempt_count: number,
    request_count: number
  ): Promise<OTP | null> {
    const now = new Date();
    const result = await query(
      `INSERT INTO OTP (phone_number, role, otp_hash, created_at, expires_at, attempt_count, request_count, last_requested_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (phone_number, role) 
       DO UPDATE SET 
          otp_hash = EXCLUDED.otp_hash, 
          expires_at = EXCLUDED.expires_at, 
          attempt_count = EXCLUDED.attempt_count, 
          request_count = EXCLUDED.request_count,
          last_requested_at = EXCLUDED.last_requested_at,
          created_at = EXCLUDED.created_at
       RETURNING *`,
      [phone_number, role, otpHash, now, expires_at, attempt_count, request_count, now]
    );
    return result.rows[0] || null;
  },

  async verifyAttemptCount(phone_number: string, role: string): Promise<number> {
    const result = await query(
      'SELECT * FROM OTP WHERE phone_number = $1 AND role = $2 ORDER BY created_at DESC LIMIT 1',
      [phone_number, role]
    );

    return result?.rows[0]?.attempt_count ?? 1;
  },

  async getOtpData(phone_number: string, role: string) {
    const result = await query(
      'SELECT * FROM OTP WHERE phone_number = $1 AND role = $2 ORDER BY created_at DESC LIMIT 1',
      [phone_number, role]
    );

    return result?.rows[0];
  },

  async incrementAttemptCount(phone_number: string, role: string) {
    await query(
      `UPDATE OTP SET attempt_count = attempt_count + 1 WHERE id = (
        SELECT id FROM OTP WHERE phone_number=$1 AND role=$2 ORDER BY created_at DESC LIMIT 1
      )`,
      [phone_number, role]
    );
  },

  async blockUser(phone_number: string, role: string, blocked_until: Date) {
    await query(`UPDATE OTP SET blocked_until = $1 WHERE phone_number = $2 AND role = $3`, [
      blocked_until,
      phone_number,
      role,
    ]);
  },

  async resetRequestCount(phone_number: string, role: string) {
    await query(`UPDATE OTP SET request_count = 0 WHERE phone_number = $1 AND role = $2`, [
      phone_number,
      role,
    ]);
  },

  async clearOtpRecord(phone_number: string, role: string) {
    await query(`DELETE FROM OTP WHERE phone_number=$1 AND role=$2`, [phone_number, role]);
  },

  async getUser(phone_number: string, role: string): Promise<User | null> {
    // 1. Map roles to specific table names
    const tableMap: Record<string, string> = {
      customer: 'users',
      driver: 'drivers',
    };

    const tableName = tableMap[role];

    // 2. Security Check: Ensure the role is valid before querying
    if (!tableName) {
      throw new Error(`Invalid role provided: ${role}`);
    }

    // 3. Execute the query using the safe table name
    const result = await query(
      `SELECT * FROM ${tableName} WHERE phone_number = $1 AND role = $2 LIMIT 1`,
      [phone_number, role]
    );

    return result?.rows[0] || null;
  },

  async getDriver(phone_number: string, role: string): Promise<User | null> {
    const result = await query(
      `SELECT * FROM drivers WHERE phone_number = $1 AND role = $2 LIMIT 1`,
      [phone_number, role]
    );

    return result?.rows[0] || null;
  },

  async signOutUser(userId: string, device_id: string, role: string): Promise<boolean> {
    try {
      const table = role === 'driver' ? 'drivers' : 'users';
      const sessionTable = this.getSessionTable(role);

      // ✅ Get FCM token before clearing session
      const fcmToken = await AuthRepository.getFcmToken(userId, role, device_id);

      // ✅ Invalidate specific device session
      await query(
        `UPDATE ${sessionTable}
       SET is_active     = FALSE,
           refresh_token = NULL,
           fcm_token     = NULL,
           force_logout  = FALSE,
           last_active   = NOW()
       WHERE user_id = $1 AND device_id = $2`,
        [userId, device_id]
      );

      // ✅ Clear device_id from users/drivers table
      await query(`UPDATE ${table} SET device_id = NULL WHERE id = $1`, [userId]);

      // ✅ Unsubscribe from FCM topic
      if (fcmToken) {
        await unsubscribeFromTopic(fcmToken, role);
      }

      logger.info(`User ${userId} signed out from device ${device_id}`);
      return true;
    } catch (err) {
      logger.error(`SignOut failed for user ${userId}: ${err}`);
      return false;
    }
  },

  async userDeviceIDUpdate(
    id: string,
    device_id: string,
    role: string,
    fcm_token: string
  ): Promise<boolean> {
    if (role === 'customer') {
      const result = await query(`UPDATE users SET device_id = $1, fcm_token = $2 WHERE id = $3`, [
        device_id,
        fcm_token,
        id,
      ]);
      return (result?.rowCount ?? 0) > 0;
    }
    if (role === 'driver') {
      const result = await query(
        `UPDATE drivers SET device_id = $1, fcm_token = $2 WHERE id = $3`,
        [device_id, fcm_token, id]
      );
      return (result?.rowCount ?? 0) > 0;
    }
    return false;
  },

  // ***************************************************************************
  // ─── Sessions ─────────────────────────────────────────────────────────────
  // ***************************************************************************

  getSessionTable(role: string): string {
    return role === 'driver' ? 'driver_sessions' : 'user_sessions';
  },

  // Create or update session for user+device
  async upsertSession(
    user_id: string,
    device_id: string,
    role: string,
    refresh_token: string,
    fcm_token: string
  ) {
    const table = this.getSessionTable(role);
    // Hash refresh token before storing
    const hashedToken = await bcrypt.hash(refresh_token, 10);
    await query(
      `INSERT INTO ${table}
         (user_id, device_id, role, refresh_token, fcm_token, is_active, last_active)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET
         refresh_token = $4,
         fcm_token = $5,
         is_active = TRUE,
         force_logout  = FALSE,
         last_active = NOW()`,
      [user_id, device_id, role, hashedToken, fcm_token]
    );
  },

  // Get active session for user
  async getActiveSession(user_id: string, role: string, exclude_device_id?: string) {
    const table = this.getSessionTable(role);
    const result = await query(
      `SELECT * FROM ${table}
     WHERE user_id = $1
       AND is_active = TRUE
       ${exclude_device_id ? 'AND device_id != $2' : ''}
     ORDER BY last_active DESC
     LIMIT 1`,
      exclude_device_id ? [user_id, exclude_device_id] : [user_id]
    );
    return result.rows[0] || null;
  },

  // Invalidate all sessions for user (logout from all devices)
  async invalidateAllSessions(user_id: string, role: string, exclude_device_id?: string) {
    const table = this.getSessionTable(role);
    await query(
      `UPDATE ${table}
     SET is_active     = FALSE,
         refresh_token = NULL,
         force_logout  = TRUE,   -- ✅ set force_logout on invalidation
         last_active   = NOW()
     WHERE user_id = $1
       ${exclude_device_id ? 'AND device_id != $2' : ''}`,
      exclude_device_id ? [user_id, exclude_device_id] : [user_id]
    );
  },

  // Invalidate specific device session
  async invalidateSession(userId: string, device_id: string, role: string) {
    const table = this.getSessionTable(role);
    // ✅ Invalidate only the specific device session
    await query(
      `UPDATE ${table}
     SET is_active = FALSE,
         refresh_token = NULL
     WHERE user_id = $1 AND device_id = $2`,
      [userId, device_id]
    );
    const userTable = role === 'driver' ? 'drivers' : 'users';
    await query(`UPDATE ${userTable} SET device_id = NULL, refresh_token = NULL WHERE id = $1`, [
      userId,
    ]);

    return true;
  },

  // Invalidate any other users who might be logged into this same device
  async invalidateOtherUsersOnDevice(device_id: string, exclude_user_id: string, role: string) {
    const table = this.getSessionTable(role);
    await query(
      `UPDATE ${table}
       SET is_active = FALSE,
           refresh_token = NULL,
           force_logout = TRUE,
           fcm_token = NULL
       WHERE device_id = $1 AND user_id != $2`,
      [device_id, exclude_user_id]
    );
    const userTable = role === 'driver' ? 'drivers' : 'users';
    await query(`UPDATE ${userTable} SET device_id = NULL WHERE device_id = $1 AND id != $2`, [
      device_id,
      exclude_user_id,
    ]);
  },

  // Also add getSessionByDevice to AuthRepository
  async getSessionByDevice(user_id: string, role: string, device_id: string) {
    const table = this.getSessionTable(role);
    const result = await query(
      `SELECT * FROM ${table}
     WHERE user_id = $1
       AND device_id = $2
     LIMIT 1`,
      [user_id, device_id]
    );
    return result.rows[0] || null;
  },

  // Validate refresh token against stored hash
  async validateRefreshToken(
    user_id: string,
    role: string,
    device_id: string,
    refresh_token: string
  ): Promise<boolean> {
    const table = this.getSessionTable(role);
    const result = await query(
      `SELECT refresh_token FROM ${table}
       WHERE user_id = $1 AND device_id = $2 AND is_active = TRUE`,
      [user_id, device_id]
    );
    const session = result.rows[0];
    if (!session?.refresh_token) return false;
    return bcrypt.compare(refresh_token, session.refresh_token);
  },

  //***************************************************************************
  // ─── FCM Token Methods ─────────────────────────────────────────────────────
  //***************************************************************************

  // Get FCM token for a device
  async getFcmToken(user_id: string, role: string, device_id: string) {
    const table = this.getSessionTable(role);
    const result = await query(
      `SELECT fcm_token FROM ${table}
     WHERE user_id = $1 AND device_id = $2 LIMIT 1`,
      [user_id, device_id]
    );
    return result.rows[0]?.fcm_token || null;
  },
  // auth.repository.ts

  async clearFcmToken(user_id: string, role: string, device_id: string): Promise<void> {
    const table = this.getSessionTable(role);
    await query(
      `UPDATE ${table}
     SET fcm_token = NULL
     WHERE user_id = $1 AND device_id = $2`,
      [user_id, device_id]
    );
    logger.info(`FCM token cleared for user: ${user_id} device: ${device_id}`);
  },
  //******************************************************************************
  // ─── Force Logout Methods ─────────────────────────────────────────────────────
  //******************************************************************************

  // Set force logout flag for old device
  async setForceLogout(user_id: string, role: string, device_id: string) {
    const table = this.getSessionTable(role);
    await query(
      `UPDATE ${table}
     SET force_logout = TRUE
     WHERE user_id = $1 AND device_id = $2`,
      [user_id, device_id]
    );
  },

  async checkForceLogout(user_id: string, role: string, device_id: string): Promise<boolean> {
    const table = this.getSessionTable(role);
    const result = await query(
      `SELECT force_logout FROM ${table}
     WHERE user_id = $1 AND device_id = $2 LIMIT 1`,
      [user_id, device_id]
    );
    return result.rows[0]?.force_logout ?? false;
  },
};
