import { query } from '../../shared/database';
import { Notification, NotificationDispatch } from './notification-management.model';

export const NotificationRepository = {
  async createNotification(data: Notification) {
    const res = await query(
      `INSERT INTO notifications (title, body, target_type, target_audience, specific_user_id, attached_offer, coupon_code, promo_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        data.title,
        data.body,
        data.target_type,
        data.target_audience,
        data.specific_user_id || null,
        // Array.isArray(data.specific_user_id) ? data.specific_user_id[0] : (data.specific_user_id || null),
        data.attached_offer,
        data.coupon_code,
        data.promo_code,
      ]
    );
    return res.rows[0];
  },

  async getAllNotifications(target_type?: string) {
    let sql = `
      SELECT n.*, 
             nd.notify_status, 
             nd.notify_sent_at, 
             (SELECT COALESCE(SUM(notify_count), 0) FROM notification_dispatches WHERE notification_id = n.id) as notify_count
      FROM notifications n
      LEFT JOIN (
        SELECT notification_id, notify_status, notify_sent_at,
               ROW_NUMBER() OVER (PARTITION BY notification_id ORDER BY created_at DESC) as rn
        FROM notification_dispatches
      ) nd ON n.id = nd.notification_id AND nd.rn = 1
    `;
    const params = [];
    if (target_type) {
      sql += ` WHERE n.target_type = $1`;
      params.push(target_type);
    }
    sql += ` ORDER BY n.created_at DESC`;
    const res = await query(sql, params);
    return res.rows;
  },

  async updateNotification(id: string, data: Partial<Notification>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (
        [
          'title',
          'body',
          'target_type',
          'target_audience',
          'coupon_code',
          'promo_code',
          'attached_offer',
          'specific_user_id',
        ].includes(key)
      ) {
        fields.push(`${key} = $${idx++}`);
        values.push(value);
      }
    });

    if (fields.length === 0) return null;

    values.push(id);
    const sql = `UPDATE notifications SET ${fields.join(', ')}, updated_at = current_timestamp WHERE id = $${idx} RETURNING *`;
    const res = await query(sql, values);
    return res.rows[0];
  },

  async deleteNotification(id: string) {
    await query(`DELETE FROM notifications WHERE id = $1`, [id]);
  },

  async queueDispatch(data: NotificationDispatch) {
    const res = await query(
      `INSERT INTO notification_dispatches (notification_id, target_type, target_audience, specific_user_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.notification_id, data.target_type, data.target_audience, data.specific_user_id]
    );
    return res.rows[0];
  },

  async getPendingDispatches() {
    // Lock rows for update to prevent concurrent worker execution
    const res = await query(
      `SELECT * FROM notification_dispatches 
       WHERE status = 'PENDING' 
       ORDER BY created_at ASC 
       FOR UPDATE SKIP LOCKED LIMIT 10`
    );
    return res.rows;
  },

  async updateDispatchStatus(
    id: number,
    status: string,
    errorLog: string | null = null,
    notifyCount: number = 0
  ) {
    const res = await query(
      `UPDATE notification_dispatches 
       SET status = $1::text, 
           notify_status = $1::text,
           notify_count = COALESCE(notify_count, 0) + $4,
           notify_sent_at = CASE WHEN $1::text = 'COMPLETED' THEN current_timestamp ELSE notify_sent_at END,
           error_log = $2, 
           processed_at = CASE WHEN $1::text IN ('COMPLETED', 'FAILED') THEN current_timestamp ELSE processed_at END
       WHERE id = $3 RETURNING *`,
      [status, errorLog, id, notifyCount]
    );
    return res.rows[0];
  },

  async getNotificationContent(id: string) {
    const res = await query(
      `SELECT title, body, coupon_code, promo_code FROM notifications WHERE id = $1`,
      [id]
    );
    return res.rows[0];
  },

  // Target Segment Queries (Users table replaces customers)
  async getCustomerTokensAll(limit: number, offset: number) {
    const res = await query(
      `SELECT id, fcm_token FROM users 
       WHERE fcm_token IS NOT NULL AND role = 'customer' 
       ORDER BY id LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.rows.map((r: any) => ({ userId: r.id, token: r.fcm_token }));
  },

  async getCustomerTokensTop(limit: number, offset: number) {
    const res = await query(
      `SELECT id, fcm_token FROM users 
       WHERE fcm_token IS NOT NULL AND role = 'customer' 
       AND total_trips > (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_trips) FROM users WHERE role = 'customer')
       ORDER BY id LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.rows.map((r: any) => ({ userId: r.id, token: r.fcm_token }));
  },

  async getCustomerTokensLow(limit: number, offset: number) {
    const res = await query(
      `SELECT id, fcm_token FROM users 
       WHERE fcm_token IS NOT NULL AND role = 'customer' 
       AND total_trips <= 1
       ORDER BY id LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.rows.map((r: any) => ({ userId: r.id, token: r.fcm_token }));
  },

  async getCustomerTokenSpecific(id: string) {
    const res = await query(
      `SELECT id, fcm_token FROM users WHERE id = $1 AND fcm_token IS NOT NULL`,
      [id]
    );
    return res.rows.map((r: any) => ({ userId: r.id, token: r.fcm_token }));
  },

  // Driver Queries
  async getDriverTokensAll(limit: number, offset: number) {
    const res = await query(
      `SELECT id, fcm_token FROM drivers 
       WHERE fcm_token IS NOT NULL 
       ORDER BY id LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.rows.map((r: any) => ({ userId: r.id, token: r.fcm_token }));
  },

  async getDriverTokensTop(limit: number, offset: number) {
    const res = await query(
      `SELECT id, fcm_token FROM drivers 
       WHERE fcm_token IS NOT NULL 
       AND total_trips > (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_trips) FROM drivers)
       ORDER BY id LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.rows.map((r: any) => ({ userId: r.id, token: r.fcm_token }));
  },

  async getDriverTokensLow(limit: number, offset: number) {
    const res = await query(
      `SELECT id, fcm_token FROM drivers 
       WHERE fcm_token IS NOT NULL 
       AND total_trips <= 5
       ORDER BY id LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.rows.map((r: any) => ({ userId: r.id, token: r.fcm_token }));
  },

  async getDriverTokenSpecific(id: string | string[]) {
    const driverId = Array.isArray(id) ? id[0] : id;
    const res = await query(
      `SELECT id, fcm_token FROM drivers WHERE id = $1 AND fcm_token IS NOT NULL`,
      [driverId]
    );
    return res.rows.map((r: any) => ({ userId: r.id, token: r.fcm_token }));
  },

  // Logging and Duplicate Prevention
  async hasReceivedNotification(notificationId: string, userId: string, targetType: string) {
    const table = targetType === 'DRIVER' ? 'driver_notification_logs' : 'user_notification_logs';
    const idField = targetType === 'DRIVER' ? 'driver_id' : 'user_id';

    const res = await query(
      `SELECT id FROM ${table} 
       WHERE notification_id = $1 AND ${idField} = $2 AND status = 'SENT'`,
      [notificationId, userId]
    );
    return res.rows.length > 0;
  },

  async filterExistingRecipients(notificationId: string, userIds: string[], targetType: string) {
    if (userIds.length === 0) return [];

    const table = targetType === 'DRIVER' ? 'driver_notification_logs' : 'user_notification_logs';
    const idField = targetType === 'DRIVER' ? 'driver_id' : 'user_id';

    const res = await query(
      `SELECT ${idField} FROM ${table} 
       WHERE notification_id = $1 AND ${idField} = ANY($2) AND status = 'SENT'`,
      [notificationId, userIds]
    );

    const sentIds = new Set(res.rows.map((r: any) => r[idField]));
    return userIds.filter((id) => !sentIds.has(id));
  },

  async logNotificationSend(
    notificationId: string,
    targetType: string,
    userId: string,
    status: string,
    error?: string
  ) {
    const table = targetType === 'DRIVER' ? 'driver_notification_logs' : 'user_notification_logs';
    const idField = targetType === 'DRIVER' ? 'driver_id' : 'user_id';

    await query(
      `INSERT INTO ${table} (notification_id, ${idField}, status, error_message)
       VALUES ($1, $2, $3, $4)`,
      [notificationId, userId, status, error || null]
    );
  },

  async logBulkSends(
    notificationId: string,
    targetType: string,
    userIds: string[],
    status: string
  ) {
    if (userIds.length === 0) return;

    const table = targetType === 'DRIVER' ? 'driver_notification_logs' : 'user_notification_logs';
    const idField = targetType === 'DRIVER' ? 'driver_id' : 'user_id';

    // Construct bulk insert query
    const values = userIds.map((id, i) => `($1, $${i + 2}, $${userIds.length + 2})`).join(', ');
    await query(
      `INSERT INTO ${table} (notification_id, ${idField}, status)
       VALUES ${values}`,
      [notificationId, ...userIds, status]
    );
  },
};
