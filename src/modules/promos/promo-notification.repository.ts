
import { query } from '../../shared/database';
import { logger } from '../../shared/logger';

export const PromoNotificationRepository = {
  /**
   * Fetches promos that are pending notification processing
   */
  async getPendingCampaigns() {
    const res = await query(
      `SELECT * FROM promos 
       WHERE notify_status = 'PENDING' 
       AND (notify_locked_at IS NULL OR notify_locked_at < NOW() - INTERVAL '20 minutes')
       LIMIT 1`
    );
    return res.rows;
  },

  /**
   * Locks a campaign for processing
   */
  async lockCampaign(promoId: string | number) {
    await query(
      `UPDATE promos 
       SET notify_status = 'PROCESSING', notify_locked_at = NOW() 
       WHERE id = $1`,
      [promoId]
    );
  },

  /**
   * Fetches drivers to notify based on target criteria
   */
  async getTargetDrivers(targetType: string, specificDriverId?: string, limit: number = 50, offset: number = 0) {
    let sql = `SELECT id, email, full_name, total_trips FROM drivers WHERE status = 'active' AND email IS NOT NULL`;
    const params: any[] = [];

    if (targetType === 'TOP_RIDE') {
      const threshold = await this.getThreshold('driver_top_ride_threshold', 10);
      sql += ` AND total_trips >= $1`;
      params.push(threshold);
    } else if (targetType === 'LOW_RIDE') {
      const threshold = await this.getThreshold('driver_low_ride_threshold', 2);
      sql += ` AND total_trips < $1`;
      params.push(threshold);
    } else if (targetType === 'SPECIFIC' && specificDriverId) {
      sql += ` AND id = $1`;
      params.push(specificDriverId);
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
   * Logs a notification attempt for a driver
   */
  async logNotification(promoId: string | number, driverId: string, status: 'SENT' | 'FAILED', error?: string) {
    await query(
      `INSERT INTO driver_notification_logs (promo_id, driver_id, status, error_message) 
       VALUES ($1, $2, $3, $4)`,
      [promoId, driverId, status, error || null]
    );
  },

  /**
   * Updates the campaign status upon completion
   */
  async updateCampaignStatus(promoId: string | number, status: string, totalSent: number) {
    const isCompleted = status === 'COMPLETED';
    await query(
      `UPDATE promos 
       SET notify_status = $1, 
           notify_count = notify_count + $2, 
           notify_sent_at = ${isCompleted ? 'NOW()' : 'notify_sent_at'},
           notify_locked_at = NULL
       WHERE id = $3`,
      [status, totalSent, promoId]
    );
  },

  /**
   * Checks if a driver has already received this promo notification
   */
  async hasReceivedNotification(promoId: string | number, driverId: string) {
    const res = await query(
      `SELECT id FROM driver_notification_logs WHERE promo_id = $1 AND driver_id = $2 AND status = 'SENT'`,
      [promoId, driverId]
    );
    return res.rows.length > 0;
  }
};
