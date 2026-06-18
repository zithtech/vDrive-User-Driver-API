import { query } from '../../shared/database';
import { logger } from '../../shared/logger';

export const CouponNotificationRepository = {
  /**
   * Fetches coupons that are pending notification processing
   */
  async getPendingCampaigns() {
    const res = await query(
      `SELECT * FROM coupons 
       WHERE notify_status = 'PENDING' 
       AND (notify_locked_at IS NULL OR notify_locked_at < NOW() - INTERVAL '20 minutes')
       LIMIT 1`
    );
    return res.rows;
  },

  /**
   * Locks a campaign for processing
   */
  async lockCampaign(couponId: string) {
    await query(
      `UPDATE coupons 
       SET notify_status = 'PROCESSING', notify_locked_at = NOW() 
       WHERE id = $1`,
      [couponId]
    );
  },

  /**
   * Fetches users to notify based on target criteria
   */
  async getTargetUsers(
    targetType: string,
    specificUserId?: string,
    limit: number = 50,
    offset: number = 0
  ) {
    let sql = `SELECT id, email, full_name, total_trips FROM users WHERE status = 'active' AND email IS NOT NULL`;
    const params: any[] = [];

    if (targetType === 'TOP_RIDE') {
      const threshold = await this.getThreshold('top_ride_threshold', 10);
      sql += ` AND total_trips >= $1`;
      params.push(threshold);
    } else if (targetType === 'LOW_RIDE') {
      const threshold = await this.getThreshold('low_ride_threshold', 2);
      sql += ` AND total_trips < $1`;
      params.push(threshold);
    } else if (targetType === 'SPECIFIC' && specificUserId) {
      if (Array.isArray(specificUserId)) {
        sql += ` AND id = ANY($1)`;
        params.push(specificUserId);
      } else {
        sql += ` AND id = $1`;
        params.push(specificUserId);
      }
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const res = await query(sql, params);
    return res.rows;
  },

  /**
   * Helper to get thresholds from system_config
   */
  async getThreshold(key: string, defaultValue: number): Promise<number> {
    try {
      const res = await query(`SELECT value FROM system_config WHERE key = $1`, [key]);
      return res.rows.length > 0 ? parseInt(res.rows[0].value) : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  },

  /**
   * Logs a notification attempt for a user
   */
  async logNotification(
    couponId: string,
    userId: string,
    status: 'SENT' | 'FAILED',
    error?: string
  ) {
    await query(
      `INSERT INTO user_email_logs (coupon_id, user_id, status, error_message) 
       VALUES ($1, $2, $3, $4)`,
      [couponId, userId, status, error || null]
    );
  },

  /**
   * Updates the campaign status upon completion
   */
  async updateCampaignStatus(couponId: string, status: string, totalSent: number) {
    const isCompleted = status === 'COMPLETED';
    await query(
      `UPDATE coupons 
       SET notify_status = $1, 
           notify_count = notify_count + $2, 
           notify_sent_at = ${isCompleted ? 'NOW()' : 'notify_sent_at'},
           notify_locked_at = NULL
       WHERE id = $3`,
      [status, totalSent, couponId]
    );
  },

  /**
   * Checks if a user has already received this coupon notification
   */
  async hasReceivedNotification(couponId: string, userId: string) {
    const res = await query(
      `SELECT id FROM user_email_logs WHERE coupon_id = $1 AND user_id = $2 AND status = 'SENT'`,
      [couponId, userId]
    );
    return res.rows.length > 0;
  },
};
