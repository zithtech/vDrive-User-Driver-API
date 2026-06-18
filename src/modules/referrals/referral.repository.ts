// src/modules/referrals/referral.repository.ts
import { query, getClient } from '../../shared/database';

export const ReferralRepository = {
  async getReferralCodeByUserId(userId: string) {
    const existingCode = await query('SELECT code FROM referral_codes WHERE user_id = $1', [
      userId,
    ]);
    return existingCode.rows[0]?.code || null;
  },

  async findByReferralCode(code: string) {
    const existingCode = await query(`SELECT user_id FROM referral_codes WHERE code = $1`, [code]);
    return existingCode.rows[0]?.user_id || null;
  },

  async insertReferralCode(code: string, userId: string) {
    await query(
      `INSERT INTO referral_codes (code, user_id, is_active)
       VALUES ($1, $2, TRUE)`,
      [code, userId]
    );
  },

  async getReferralCodeDetails(code: string) {
    const codeResult = await query(
      `SELECT rc.user_id, rc.is_active 
       FROM referral_codes rc
       WHERE rc.code = $1`,
      [code]
    );
    return codeResult.rows[0] || null;
  },

  async getReferralRelationshipByReferred(refereeUserId: string) {
    const existingReferral = await query(
      `SELECT id, referrer_user_id, status FROM referral_relationships 
       WHERE referred_user_id = $1`,
      [refereeUserId]
    );
    return existingReferral.rows[0] || null;
  },

  async createReferralRelationship(referrerId: string, refereeUserId: string, code: string) {
    const result = await query(
      `INSERT INTO referral_relationships 
       (referrer_user_id, referred_user_id, referral_code, status)
       VALUES ($1, $2, $3, 'PENDING')
       RETURNING id`,
      [referrerId, refereeUserId, code]
    );
    return result.rows[0].id;
  },

  // async createRefereeCoupon(refereeUserId: string, minRideAmount: number) {
  //   const refereeCoupon = await query(
  //     `INSERT INTO coupons
  //      (code, discount_type, discount_value, min_ride_amount,
  //       user_eligibility, is_referral_code, is_active,
  //       valid_from, valid_until)
  //      VALUES
  //      ($1, 'PERCENTAGE', 50, $2, $3, TRUE, TRUE,
  //       current_timestamp, current_timestamp + INTERVAL '30 days')
  //      ON CONFLICT (code) DO UPDATE SET
  //        is_active = EXCLUDED.is_active,
  //        valid_until = EXCLUDED.valid_until
  //      RETURNING id, discount_value`,
  //     [`ref_discount_${refereeUserId}`, minRideAmount, refereeUserId]
  //   );
  //   return refereeCoupon.rows[0];
  // },

  async completeReferralTransaction(
    relationshipId: string,
    refereeUserId: string,
    REFERRER_REWARD: number,
    REFEREE_REWARD: number
  ) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Update referral relationship status
      const refResult = await client.query(
        `UPDATE referral_relationships 
         SET status = 'COMPLETED', first_ride_date = current_timestamp
         WHERE id = $1
         RETURNING referrer_user_id, referee_reward_earned, referrer_reward_earned, id`,
        [relationshipId]
      );

      if (refResult.rows.length === 0) {
        throw new Error('Referral relationship not found');
      }

      const { referrer_user_id: referrerId } = refResult.rows[0];

      // 1. Credit referee reward (instant)
      await client.query(
        `INSERT INTO referral_rewards 
         (referral_relationship_id, user_id, reward_type, reward_amount, 
          reward_status, credited_at)
         VALUES ($1, $2, 'REFEREE', $3, 'CREDITED', current_timestamp)`,
        [relationshipId, refereeUserId, REFEREE_REWARD]
      );

      // 2. Credit referrer reward (after first ride)
      await client.query(
        `INSERT INTO referral_rewards 
         (referral_relationship_id, user_id, reward_type, reward_amount, 
          reward_status, credited_at)
         VALUES ($1, $2, 'REFERRER', $3, 'CREDITED', current_timestamp)`,
        [relationshipId, referrerId, REFERRER_REWARD]
      );

      // 3. Update referral_relationships to mark rewards as earned
      await client.query(
        `UPDATE referral_relationships 
         SET referee_reward_earned = TRUE, referrer_reward_earned = TRUE,
             referee_reward_amount = $1, referrer_reward_amount = $2
         WHERE id = $3`,
        [REFEREE_REWARD, REFERRER_REWARD, relationshipId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        referrerId,
        refereeId: refereeUserId,
        referrerReward: REFERRER_REWARD,
        refereeReward: REFEREE_REWARD,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async getReferralStats(userId: string) {
    const result = await query(
      `SELECT 
         COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as successful_referrals,
         COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_referrals,
         COALESCE(SUM(CASE WHEN referrer_reward_earned THEN referrer_reward_amount ELSE 0 END), 0) as total_earnings,
         COUNT(*) as total_referrals
       FROM referral_relationships
       WHERE referrer_user_id = $1`,
      [userId]
    );

    return result.rows[0];
  },

  async checkReferralUsage(userId: string) {
    const result = await query(
      `SELECT EXISTS (
         SELECT 1 FROM referral_relationships 
         WHERE referred_user_id = $1
       ) as has_used`,
      [userId]
    );
    return result.rows[0].has_used;
  },

  async getActiveConfig(userType: string) {
    const result = await query(
      'SELECT * FROM referral_configurations WHERE user_type = $1 AND is_active = TRUE',
      [userType]
    );
    return result.rows[0];
  },
};
