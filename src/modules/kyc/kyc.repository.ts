import { query } from '../../shared/database';
import { logger } from '../../shared/logger';
import { VideoKycSession, VideoKycStatus } from './kyc.model';

export class KycRepository {
  private static tableInitialized = false;

  public static async ensureTable(): Promise<void> {
    if (this.tableInitialized) return;
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS video_kyc_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id VARCHAR(100) UNIQUE NOT NULL,
          driver_id UUID NOT NULL,
          admin_id UUID,
          admin_name VARCHAR(100),
          channel_name VARCHAR(100) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
          driver_uid INTEGER DEFAULT 0,
          admin_uid INTEGER DEFAULT 1,
          remarks TEXT,
          rejection_reasons JSONB,
          location JSONB,
          started_at TIMESTAMP WITH TIME ZONE,
          ended_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_video_kyc_driver ON video_kyc_sessions(driver_id);
        CREATE INDEX IF NOT EXISTS idx_video_kyc_status ON video_kyc_sessions(status);
      `);
      this.tableInitialized = true;
      logger.info('✅ [KycRepository] video_kyc_sessions table ready');
    } catch (err: any) {
      logger.warn('[KycRepository] ensureTable notice:', err.message);
    }
  }

  public static async create(session: VideoKycSession): Promise<VideoKycSession> {
    await this.ensureTable();
    const sql = `
      INSERT INTO video_kyc_sessions (
        session_id, driver_id, channel_name, status, driver_uid, admin_uid, location
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      session.session_id,
      session.driver_id,
      session.channel_name,
      session.status || 'QUEUED',
      session.driver_uid || 0,
      session.admin_uid || 1,
      session.location ? JSON.stringify(session.location) : null,
    ];
    const res = await query(sql, values);
    return res.rows[0];
  }

  public static async findBySessionId(sessionId: string): Promise<VideoKycSession | null> {
    await this.ensureTable();
    const sql = `SELECT * FROM video_kyc_sessions WHERE session_id = $1`;
    const res = await query(sql, [sessionId]);
    return res.rows[0] || null;
  }

  public static async findActiveSessionByDriverId(driverId: string): Promise<VideoKycSession | null> {
    await this.ensureTable();
    const sql = `
      SELECT * FROM video_kyc_sessions
      WHERE driver_id = $1 AND status IN ('QUEUED', 'IN_CALL')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const res = await query(sql, [driverId]);
    return res.rows[0] || null;
  }

  public static async findLatestSessionByDriverId(driverId: string): Promise<VideoKycSession | null> {
    await this.ensureTable();
    const sql = `
      SELECT * FROM video_kyc_sessions
      WHERE driver_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const res = await query(sql, [driverId]);
    return res.rows[0] || null;
  }

  public static async update(sessionId: string, updates: Partial<VideoKycSession>): Promise<VideoKycSession | null> {
    await this.ensureTable();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    Object.entries(updates).forEach(([key, val]) => {
      if (val !== undefined) {
        if (key === 'rejection_reasons' || key === 'location') {
          fields.push(`${key} = $${idx++}`);
          values.push(JSON.stringify(val));
        } else {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }
    });

    fields.push(`updated_at = NOW()`);
    values.push(sessionId);

    const sql = `
      UPDATE video_kyc_sessions
      SET ${fields.join(', ')}
      WHERE session_id = $${idx}
      RETURNING *
    `;
    const res = await query(sql, values);
    return res.rows[0] || null;
  }

  public static async getQueue(): Promise<any[]> {
    await this.ensureTable();
    const sql = `
      SELECT 
        v.*,
        d.first_name,
        d.last_name,
        d.phone_number,
        d.profile_pic_url,
        d.city,
        d.onboarding_status
      FROM video_kyc_sessions v
      LEFT JOIN drivers d ON v.driver_id = d.id
      WHERE v.status = 'QUEUED'
      ORDER BY v.created_at ASC
    `;
    const res = await query(sql);
    return res.rows;
  }

  public static async getQueuePosition(sessionId: string): Promise<number> {
    await this.ensureTable();
    const sql = `
      SELECT COUNT(*) AS position
      FROM video_kyc_sessions
      WHERE status = 'QUEUED'
        AND created_at <= (SELECT created_at FROM video_kyc_sessions WHERE session_id = $1)
    `;
    const res = await query(sql, [sessionId]);
    return parseInt(res.rows[0]?.position || '1', 10);
  }
}

