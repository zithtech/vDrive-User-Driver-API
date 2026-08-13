import { Pool } from 'pg';
import * as db from '../../shared/database';
import { WalletAutoReloadSettings, WalletAutoReloadHistory } from './wallet.model';

class WalletRepository {
  public async getSettings(userId: string): Promise<WalletAutoReloadSettings | null> {
    const query = 'SELECT * FROM wallet_auto_reload_settings WHERE user_id = $1';
    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }

  public async upsertSettings(
    userId: string,
    settings: Partial<WalletAutoReloadSettings>
  ): Promise<WalletAutoReloadSettings> {
    const query = `
      INSERT INTO wallet_auto_reload_settings (
        user_id, enabled, threshold_amount, reload_amount, payment_method_id, 
        daily_limit, monthly_limit, push_notification, email_notification, sms_notification, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, current_timestamp
      )
      ON CONFLICT (user_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        threshold_amount = EXCLUDED.threshold_amount,
        reload_amount = EXCLUDED.reload_amount,
        payment_method_id = EXCLUDED.payment_method_id,
        daily_limit = EXCLUDED.daily_limit,
        monthly_limit = EXCLUDED.monthly_limit,
        push_notification = EXCLUDED.push_notification,
        email_notification = EXCLUDED.email_notification,
        sms_notification = EXCLUDED.sms_notification,
        updated_at = current_timestamp
      RETURNING *;
    `;
    const values = [
      userId,
      settings.enabled ?? false,
      settings.threshold_amount ?? 100,
      settings.reload_amount ?? 500,
      settings.payment_method_id ?? null,
      settings.daily_limit ?? 1,
      settings.monthly_limit ?? 30,
      settings.push_notification ?? true,
      settings.email_notification ?? false,
      settings.sms_notification ?? false,
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  public async getDailyReloadCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count 
      FROM wallet_auto_reload_history 
      WHERE user_id = $1 
        AND status = 'SUCCESS' 
        AND created_at >= current_date
    `;
    const result = await db.query(query, [userId]);
    return parseInt(result.rows[0].count, 10);
  }

  public async getMonthlyReloadCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count 
      FROM wallet_auto_reload_history 
      WHERE user_id = $1 
        AND status = 'SUCCESS' 
        AND created_at >= date_trunc('month', current_date)
    `;
    const result = await db.query(query, [userId]);
    return parseInt(result.rows[0].count, 10);
  }

  public async recordHistory(history: WalletAutoReloadHistory): Promise<WalletAutoReloadHistory> {
    const query = `
      INSERT INTO wallet_auto_reload_history (
        user_id, amount, status, payment_transaction_id, failure_reason
      ) VALUES (
        $1, $2, $3, $4, $5
      ) RETURNING *;
    `;
    const values = [
      history.user_id,
      history.amount,
      history.status,
      history.payment_transaction_id ?? null,
      history.failure_reason ?? null,
    ];
    const result = await db.query(query, values);
    return result.rows[0];
  }
}

export default new WalletRepository();
