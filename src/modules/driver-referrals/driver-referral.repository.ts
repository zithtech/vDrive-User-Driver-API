// src/modules/driver-referrals/driver-referral.repository.ts
// Driver referral database operations

import { query } from '../../shared/database';
import { logger } from '../../shared/logger';

export interface DriverReferral {
  id: string;
  referrer_id: string;
  referee_id: string;
  referral_type: 'DRIVER' | 'CUSTOMER';
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
  created_at: string;
  updated_at: string;
}

export const DriverReferralRepository = {
  async createReferral(data: Partial<DriverReferral>, client?: any): Promise<DriverReferral> {
    const q = client ? client.query.bind(client) : query;
    const { referrer_id, referee_id, referral_type, status } = data;
    const result = await q(
      `INSERT INTO referrals (referrer_id, referee_id, referral_type, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [referrer_id, referee_id, referral_type || 'DRIVER', status || 'PENDING']
    );
    return result.rows[0];
  },

  async findByRefereeId(
    refereeId: string,
    referralType: 'DRIVER' | 'CUSTOMER',
    client?: any
  ): Promise<DriverReferral | null> {
    const q = client ? client.query.bind(client) : query;
    const result = await q('SELECT * FROM referrals WHERE referee_id = $1 AND referral_type = $2', [
      refereeId,
      referralType,
    ]);
    return result.rows[0] || null;
  },

  async updateStatus(
    id: string,
    status: 'PENDING' | 'COMPLETED' | 'EXPIRED',
    client?: any
  ): Promise<DriverReferral> {
    const q = client ? client.query.bind(client) : query;
    const result = await q(
      'UPDATE referrals SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  },

  async getStatsByReferrer(referrerId: string, referralType: 'DRIVER' | 'CUSTOMER') {
    const result = await query(
      `SELECT 
        COUNT(*) as total_referrals,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as successful_referrals,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_referrals
       FROM referrals 
       WHERE referrer_id = $1 AND referral_type = $2`,
      [referrerId, referralType]
    );
    return result.rows[0];
  },

  async findByCode(
    code: string,
    referralType: 'DRIVER' | 'CUSTOMER' = 'DRIVER'
  ): Promise<string | null> {
    const tableName = referralType === 'DRIVER' ? 'drivers' : 'users';
    const result = await query(
      `SELECT id FROM ${tableName} WHERE UPPER(referral_code) = UPPER($1) LIMIT 1`,
      [code]
    );
    return result.rows[0]?.id || null;
  },

  async generateUniqueReferralCode(
    firstName: string,
    referralType: 'DRIVER' | 'CUSTOMER' = 'DRIVER'
  ): Promise<string> {
    const tableName = referralType === 'DRIVER' ? 'drivers' : 'users';
    const prefix = firstName ? firstName.substring(0, 3).toUpperCase() : 'REF';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    let isUnique = false;
    let code = '';

    while (!isUnique) {
      let randomPart = '';
      for (let i = 0; i < 4; i++) {
        randomPart += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      code = `${prefix}${randomPart}`;

      const existing = await query(`SELECT id FROM ${tableName} WHERE referral_code = $1`, [code]);
      if (existing.rows.length === 0) {
        isUnique = true;
      }
    }

    return code;
  },

  async getActiveConfig(userType: 'DRIVER' | 'CUSTOMER') {
    try {
      const result = await query(
        'SELECT * FROM referral_configurations WHERE user_type = $1 AND is_active = TRUE LIMIT 1',
        [userType]
      );
      return result.rows[0] || null;
    } catch (err: any) {
      logger.warn(
        `Referral configurations table not found or query failed: ${err.message}. Using defaults.`
      );
      return {
        user_type: userType,
        referrer_reward: 50,
        referee_reward: 100,
        is_active: true,
      };
    }
  },
};
