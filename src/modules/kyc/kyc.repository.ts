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

        CREATE TABLE IF NOT EXISTS video_kyc_appointments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          driver_id UUID NOT NULL,
          session_id VARCHAR(100),
          appointment_date DATE NOT NULL,
          start_time VARCHAR(20) NOT NULL,
          end_time VARCHAR(20) NOT NULL,
          slot_label VARCHAR(100) NOT NULL,
          officer_name VARCHAR(100),
          notes TEXT,
          status VARCHAR(50) DEFAULT 'SCHEDULED',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_kyc_app_driver ON video_kyc_appointments(driver_id);

        CREATE TABLE IF NOT EXISTS admin_kyc_availability_slots (
          id VARCHAR(100) PRIMARY KEY,
          start_time VARCHAR(20) NOT NULL,
          end_time VARCHAR(20) NOT NULL,
          slot_label VARCHAR(100) NOT NULL,
          is_available BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        INSERT INTO admin_kyc_availability_slots (id, start_time, end_time, slot_label, is_available)
        VALUES 
          ('slot_09_10', '09:00', '10:00', '09:00 AM – 10:00 AM', true),
          ('slot_10_11', '10:00', '11:00', '10:00 AM – 11:00 AM', true),
          ('slot_11_12', '11:00', '12:00', '11:00 AM – 12:00 PM', true),
          ('slot_14_15', '14:00', '15:00', '02:00 PM – 03:00 PM', true),
          ('slot_15_16', '15:00', '16:00', '03:00 PM – 04:00 PM', true),
          ('slot_16_17', '16:00', '17:00', '04:00 PM – 05:00 PM', true),
          ('slot_17_18', '17:00', '18:00', '05:00 PM – 06:00 PM', true),
          ('slot_18_19', '18:00', '19:00', '06:00 PM – 07:00 PM', true)
        ON CONFLICT (id) DO NOTHING;
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
      WHERE v.status IN ('QUEUED', 'RETRYING', 'PENDING_SCHEDULING')
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
      WHERE status IN ('QUEUED', 'RETRYING')
        AND created_at <= (SELECT created_at FROM video_kyc_sessions WHERE session_id = $1)
    `;
    const res = await query(sql, [sessionId]);
    return parseInt(res.rows[0]?.position || '1', 10);
  }

  public static async createOrUpdateAppointment(appointment: Partial<VideoKycSession & any>): Promise<any> {
    await this.ensureTable();
    const sql = `
      INSERT INTO video_kyc_appointments (
        driver_id, session_id, appointment_date, start_time, end_time, slot_label, officer_name, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      appointment.driverId,
      appointment.sessionId || null,
      appointment.date,
      appointment.startTime,
      appointment.endTime,
      appointment.slotLabel,
      appointment.officerName || 'Verification Officer - Desk 1',
      appointment.notes || '',
      'SCHEDULED',
    ];
    const res = await query(sql, values);
    return res.rows[0];
  }

  public static async getAppointmentByDriverId(driverId: string): Promise<any | null> {
    await this.ensureTable();
    const sql = `
      SELECT * FROM video_kyc_appointments
      WHERE driver_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const res = await query(sql, [driverId]);
    return res.rows[0] || null;
  }

  public static async getCallHistory(): Promise<any[]> {
    await this.ensureTable();
    const sql = `
      SELECT 
        v.id,
        v.session_id,
        v.driver_id AS "driverId",
        v.admin_id AS "adminId",
        v.admin_name AS "officerName",
        v.status,
        v.remarks AS notes,
        v.rejection_reasons AS "rejectionReasons",
        v.started_at,
        v.ended_at,
        v.created_at,
        EXTRACT(EPOCH FROM (COALESCE(v.ended_at, v.updated_at) - v.started_at))::INTEGER AS "durationSeconds",
        TO_CHAR(v.created_at, 'YYYY-MM-DD') AS "callDate",
        TO_CHAR(v.created_at, 'HH12:MI AM') AS "callTime",
        CONCAT(d.first_name, ' ', d.last_name) AS "driverName",
        d.phone_number AS phone,
        d.profile_pic_url AS "profilePic"
      FROM video_kyc_sessions v
      LEFT JOIN drivers d ON v.driver_id = d.id
      ORDER BY v.created_at DESC
      LIMIT 100
    `;
    const res = await query(sql);
    return res.rows;
  }

  public static async getAvailabilitySlots(date?: string): Promise<any[]> {
    await this.ensureTable();
    const targetDate = date || new Date().toISOString().split('T')[0];

    const sql = `
      SELECT 
        s.id,
        s.start_time AS "startTime",
        s.end_time AS "endTime",
        s.slot_label AS "label",
        s.is_available AS "isAvailable",
        CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS "isBooked",
        CONCAT(d.first_name, ' ', d.last_name) AS "bookedDriverName"
      FROM admin_kyc_availability_slots s
      LEFT JOIN video_kyc_appointments a 
        ON s.start_time = a.start_time 
       AND s.end_time = a.end_time 
       AND a.appointment_date = $1 
       AND a.status = 'SCHEDULED'
      LEFT JOIN drivers d ON a.driver_id = d.id
      ORDER BY s.start_time ASC
    `;
    const res = await query(sql, [targetDate]);
    return res.rows;
  }

  public static async addAvailabilitySlot(slot: {
    id: string;
    startTime: string;
    endTime: string;
    label: string;
  }): Promise<any> {
    await this.ensureTable();
    const sql = `
      INSERT INTO admin_kyc_availability_slots (id, start_time, end_time, slot_label, is_available)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (id) DO UPDATE SET slot_label = EXCLUDED.slot_label, is_available = true, updated_at = NOW()
      RETURNING *
    `;
    const res = await query(sql, [slot.id, slot.startTime, slot.endTime, slot.label]);
    return res.rows[0];
  }

  public static async deleteAvailabilitySlot(slotId: string): Promise<boolean> {
    await this.ensureTable();
    const checkSql = `
      SELECT id FROM video_kyc_appointments 
      WHERE (start_time = (SELECT start_time FROM admin_kyc_availability_slots WHERE id = $1)
         OR slot_label = (SELECT slot_label FROM admin_kyc_availability_slots WHERE id = $1))
        AND status = 'SCHEDULED'
        AND appointment_date >= CURRENT_DATE
    `;
    const check = await query(checkSql, [slotId]);
    if (check.rows.length > 0) {
      throw new Error('Cannot delete a slot with active upcoming appointments');
    }

    await query(`DELETE FROM admin_kyc_availability_slots WHERE id = $1`, [slotId]);
    return true;
  }
}

