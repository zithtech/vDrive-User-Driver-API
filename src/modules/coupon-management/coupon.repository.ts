import { query } from '../../shared/database';
import { logger } from '../../shared/logger';

export const CouponRepository = {
  // async findByCode(code: string) {
  //   const result = await query(
  //     `SELECT * FROM coupons 
  //      WHERE code = $1 AND is_active = TRUE 
  //      AND valid_from <= CURRENT_TIMESTAMP 
  //      AND valid_until >= CURRENT_TIMESTAMP`,
  //     [code]
  //   );
  //   return result.rows[0] || null;
  // },
  async findByCode(code: string) {
  const result = await query(`SELECT *, 
      CURRENT_TIMESTAMP as server_time 
    FROM coupons WHERE code = $1`, [code]);

  logger.info(`Coupon lookup: ${JSON.stringify(result.rows)}`);

  return result.rows[0] || null;
},

  async findById(id: string) {
    const result = await query(
      `SELECT * FROM coupons WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async getExpiringCoupons(hours: number) {
    const result = await query(
      `SELECT * FROM coupons 
       WHERE is_active = TRUE 
       AND valid_until > CURRENT_TIMESTAMP 
       AND valid_until <= CURRENT_TIMESTAMP + ($1 || ' hours')::INTERVAL`,
      [hours]
    );
    return result.rows || [];
  },

  async getUserUsageCount(couponId: string, userId: string) {
    const result = await query(
      `SELECT COUNT(*) FROM coupon_usages 
       WHERE coupon_id = $1 AND user_id = $2`,
      [couponId, userId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  async getTotalUsageCount(couponId: string) {
    const result = await query(
      `SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = $1`,
      [couponId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  async trackUsage(data: {
    coupon_id: string;
    user_id: string;
    trip_id: string;
    discount_applied: number;
    referral_relationship_id?: string;
  }) {
    const result = await query(
      `INSERT INTO coupon_usages 
       (coupon_id, user_id, trip_id, discount_applied, referral_relationship_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.coupon_id,
        data.user_id,
        data.trip_id,
        data.discount_applied,
        data.referral_relationship_id || null
      ]
    );
    return result.rows[0];
  },

  async getAvailableCoupons(userId: string) {
    // Basic logic: Get all active coupons that are generic or assigned to this user
    // This can be expanded based on user_eligibility rules
    const result = await query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM coupon_usages cu WHERE cu.coupon_id = c.id AND cu.user_id = $1) as user_usage_count
       FROM coupons c
       WHERE c.is_active = TRUE 
       AND (c.user_eligibility = 'ALL' OR c.user_eligibility = $1)
       AND c.valid_until >= CURRENT_TIMESTAMP
       ORDER BY c.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async getTopicByCode(couponCode: string) {
    const result = await query(
      `SELECT ct.* FROM coupon_topics ct
       JOIN coupons c ON ct.coupon_id = c.id
       WHERE c.code = $1`,
      [couponCode]
    );
    return result.rows[0] || null;
  },

  async subscribeUserToTopic(data: {
    userId: string;
    couponId: string;
    topicName: string;
    fcmToken: string;
  }) {
    const result = await query(
      `INSERT INTO coupon_subscriptions 
       (user_id, coupon_id, topic_name, fcm_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, topic_name) DO UPDATE 
       SET fcm_token = EXCLUDED.fcm_token, subscribed_at = NOW()
       RETURNING *`,
      [data.userId, data.couponId, data.topicName, data.fcmToken]
    );
    return result.rows[0];
  },

  async unsubscribeUserFromTopic(userId: string, topicName: string) {
    const result = await query(
      `DELETE FROM coupon_subscriptions 
       WHERE user_id = $1 AND topic_name = $2
       RETURNING *`,
      [userId, topicName]
    );
    return result.rows[0] || null;
  },

  async getSubscribedTokens(couponId: string) {
    const result = await query(
      `SELECT fcm_token FROM coupon_subscriptions WHERE coupon_id = $1`,
      [couponId]
    );
    return result.rows.map((row: any) => row.fcm_token);
  }
};
