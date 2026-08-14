// src/modules/users/user.repository.ts
import { query, getClient } from '../../shared/database';
import { User } from './user.model';
import { generateOTP } from '../../utilities/helper';
import { logger } from '../../shared/logger';

export const UserRepository = {
  async findAllWithFilters(
    page: number,
    limit: number,
    search?: string
  ): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;
    let whereClause = "WHERE status <> 'deleted'";
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex + 1})`;
      params.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const selectQuery = `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    const result = await query(selectQuery, params);

    return { users: result.rows, total };
  },

  async findById(id: string, status: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE id = $1 AND status = $2', [id, status]);
    return result.rows[0] || null;
  },

  async createUser(data: User): Promise<User | null> {
    try {
      const result = await query(
        `INSERT INTO users (first_name, last_name, full_name, phone_number, alternate_contact, role, gender, date_of_birth, status, email, device_id, onboarding_status, otp, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) RETURNING *;`,
        [
          data.first_name,
          data.last_name,
          data.full_name,
          data.phone_number,
          data.alternate_contact,
          data.role,
          data.gender,
          data.date_of_birth,
          data.status,
          data.email,
          data.device_id,
          data.onboarding_status,
          data.otp || generateOTP(),
        ]
      );
      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }
  },

  async updateUser(id: string, setQuery: string, values: any[]): Promise<User | null> {
    const result = await query(
      `UPDATE users SET ${setQuery}, updated_at = NOW() WHERE id = $${values.length + 1} RETURNING *;`,
      [...values, id]
    );

    return result.rows[0] || null;
  },

  async deleteUser(id: string, status: string): Promise<User | null> {
    const result = await query(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *;`,
      [status, id]
    );

    return result.rows[0] || null;
  },

  async updateUserStatus(id: string, status: string, notes?: string): Promise<User | null> {
    const result = await query(
      `UPDATE users SET status = $1, notes = $2, updated_at = NOW() WHERE id = $3 RETURNING *;`,
      [status, notes, id]
    );

    return result.rows[0] || null;
  },

  async searchUsers(
    searchTerm: string,
    page: number,
    limit: number
  ): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;
    const searchQuery = `%${searchTerm}%`;
    const params = [searchQuery, searchQuery, limit, offset];

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users WHERE status <> 'deleted' AND (full_name ILIKE $1 OR email ILIKE $2 OR phone_number ILIKE $1)`;
    const countResult = await query(countQuery, [searchQuery, searchQuery]);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const selectQuery = `SELECT * FROM users WHERE status <> 'deleted' AND (full_name ILIKE $1 OR email ILIKE $2 OR phone_number ILIKE $1) ORDER BY created_at DESC LIMIT $3 OFFSET $4`;
    const result = await query(selectQuery, params);

    return { users: result.rows, total };
  },

  // Save or Update the FCM Token for a user
  async updateFcmToken(id: string, fcmToken: string): Promise<void> {
    await query('UPDATE users SET fcm_token = $1 WHERE id = $2', [fcmToken, id]);
  },

  // Retrieve the FCM Token to send a notification
  async getFcmTokenById(id: string): Promise<string | null> {
    const result = await query('SELECT fcm_token FROM users WHERE id = $1', [id]);
    return result.rows[0]?.fcm_token || null;
  },

  async incrementReferralCount(id: string) {
    const result = await query(
      `UPDATE users SET referral_count = referral_count + 1 WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  async incrementStats(id: string): Promise<void> {
    await query(`UPDATE users SET total_trips = COALESCE(total_trips, 0) + 1 WHERE id = $1`, [id]);
  },

  async addToWallet(
    userId: string,
    amount: number,
    type: string,
    description: string,
    externalClient?: any,
    referenceId?: string
  ): Promise<void> {
    const client = externalClient || (await getClient());
    const shouldRelease = !externalClient;
    const shouldTransact = !externalClient;

    try {
      if (shouldTransact) await client.query('BEGIN');

      const updateSql = `
        INSERT INTO user_wallets (user_id, balance, created_at, updated_at)
        VALUES ($2, $1, NOW(), NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            balance = user_wallets.balance + EXCLUDED.balance,
            updated_at = NOW()
      `;
      await client.query(updateSql, [amount, userId]);

      const syncSql = `
        UPDATE users
        SET wallet_balance = COALESCE(wallet_balance, 0) + $1
        WHERE id = $2
      `;
      await client.query(syncSql, [amount, userId]);

      const usageSql = `
        INSERT INTO user_wallet_transactions (user_id, amount, transaction_type, description, reference_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `;
      await client.query(usageSql, [userId, amount, type, description, referenceId || null]);

      if (shouldTransact) await client.query('COMMIT');
    } catch (error) {
      if (shouldTransact) await client.query('ROLLBACK');
      logger.error(`Error adding to wallet for user ${userId}:`, error);
      throw error;
    } finally {
      if (shouldRelease) client.release();
    }
  },

  async deductFromWallet(
    userId: string,
    amount: number,
    type: string,
    description: string,
    externalClient?: any
  ): Promise<void> {
    const client = externalClient || (await getClient());
    const shouldRelease = !externalClient;
    const shouldTransact = !externalClient;

    try {
      if (shouldTransact) await client.query('BEGIN');

      const updateSql = `
        UPDATE user_wallets 
        SET balance = balance - $1,
            updated_at = NOW() 
        WHERE user_id = $2 AND balance >= $1
      `;
      const result = await client.query(updateSql, [amount, userId]);

      if (result.rowCount === 0) {
        throw new Error('Insufficient wallet balance');
      }

      const syncSql = `
        UPDATE users
        SET wallet_balance = COALESCE(wallet_balance, 0) - $1
        WHERE id = $2
      `;
      await client.query(syncSql, [amount, userId]);

      const usageSql = `
        INSERT INTO user_wallet_transactions (user_id, amount, transaction_type, description, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `;
      await client.query(usageSql, [userId, -amount, type, description]);

      if (shouldTransact) await client.query('COMMIT');

      // Trigger auto-reload asynchronously to not block the main flow
      try {
        const { WalletService } = require('../wallet/wallet.service');
        const balanceResult = await client.query('SELECT wallet_balance FROM users WHERE id = $1', [
          userId,
        ]);
        const currentBalance = parseFloat(balanceResult.rows[0]?.wallet_balance || 0);

        // Execute without awaiting to allow fire-and-forget
        WalletService.checkAndTriggerAutoReload(userId, currentBalance).catch((err: any) => {
          logger.error(`Error in async auto-reload for user ${userId}: ${err}`);
        });
      } catch (err) {
        logger.error(`Failed to trigger auto reload check for user ${userId}: ${err}`);
      }
    } catch (error) {
      if (shouldTransact) await client.query('ROLLBACK');
      logger.error(`Error deducting from wallet for user ${userId}:`, error);
      throw error;
    } finally {
      if (shouldRelease) client.release();
    }
  },

  async setupWalletPin(userId: string, hashedPin: string): Promise<void> {
    await query('UPDATE users SET wallet_pin = $1 WHERE id = $2', [hashedPin, userId]);
  },

  async getWalletTransactions(userId: string): Promise<any[]> {
    const result = await query(
      'SELECT id, user_id, amount, transaction_type as type, description, reference_id, created_at FROM user_wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  },
};
