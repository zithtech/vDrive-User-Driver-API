import { query } from '../../shared/database';
import { logger } from '../../shared/logger';
import {
  DrivingTestRoute,
  DrivingTestSession,
  DrivingTestRecording,
  DrivingTelemetryPoint,
  ScoreBreakdown,
  InfractionsCount,
  AutoVerdict,
  AdminDecision,
} from './driving-test.model';

export class DrivingTestRepository {
  private static tableInitialized = false;

  public static async ensureTables(): Promise<void> {
    if (this.tableInitialized) return;
    try {
      // 1. Driving Test Routes
      await query(`
        CREATE TABLE IF NOT EXISTS driving_test_routes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(150) NOT NULL,
          city VARCHAR(100) NOT NULL,
          total_distance_meters INT NOT NULL,
          estimated_duration_minutes INT DEFAULT 20,
          polyline JSONB DEFAULT '[]'::jsonb,
          checkpoints JSONB DEFAULT '[]'::jsonb,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_test_route_active ON driving_test_routes(is_active);

        -- 2. Driving Test Sessions
        CREATE TABLE IF NOT EXISTS driving_test_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          driver_id UUID NOT NULL,
          route_id UUID,
          status VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE,
          total_duration_seconds INT DEFAULT 0,
          total_distance_meters INT DEFAULT 0,
          device_model VARCHAR(100),
          simultaneous_camera_supported BOOLEAN DEFAULT FALSE,
          drive_score INT,
          score_breakdown JSONB,
          auto_verdict VARCHAR(50) DEFAULT 'PENDING',
          infractions_count JSONB,
          admin_decision VARCHAR(50) DEFAULT 'PENDING',
          admin_reviewer_id UUID,
          admin_notes TEXT,
          reviewed_at TIMESTAMP WITH TIME ZONE,
          retention_expires_at TIMESTAMP WITH TIME ZONE,
          recordings_deleted BOOLEAN DEFAULT FALSE,
          legal_hold BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_test_session_driver ON driving_test_sessions(driver_id);
        CREATE INDEX IF NOT EXISTS idx_test_session_status ON driving_test_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_test_session_decision ON driving_test_sessions(admin_decision);
        CREATE INDEX IF NOT EXISTS idx_test_session_retention ON driving_test_sessions(retention_expires_at, recordings_deleted);

        -- 3. Segmented Video Recordings
        CREATE TABLE IF NOT EXISTS driving_test_recordings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID NOT NULL,
          camera_type VARCHAR(20) NOT NULL,
          segment_index INT NOT NULL,
          duration_ms INT DEFAULT 60000,
          s3_bucket VARCHAR(150) NOT NULL,
          s3_key VARCHAR(255) NOT NULL,
          file_size_bytes BIGINT DEFAULT 0,
          checksum_sha256 VARCHAR(64),
          is_uploaded BOOLEAN DEFAULT FALSE,
          is_purged BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_test_rec_session ON driving_test_recordings(session_id);

        -- 4. Driving Telemetry
        CREATE TABLE IF NOT EXISTS driving_test_telemetry (
          id BIGSERIAL PRIMARY KEY,
          session_id UUID NOT NULL,
          timestamp BIGINT NOT NULL,
          latitude NUMERIC(10, 7) NOT NULL,
          longitude NUMERIC(10, 7) NOT NULL,
          speed_kmh NUMERIC(5, 2) NOT NULL,
          heading NUMERIC(5, 2) DEFAULT 0,
          accuracy NUMERIC(5, 2) DEFAULT 5,
          flagged_event VARCHAR(50) DEFAULT 'NONE',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_test_telemetry_session ON driving_test_telemetry(session_id);

        -- 5. Retention Logs
        CREATE TABLE IF NOT EXISTS recording_retention_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID NOT NULL,
          driver_id UUID NOT NULL,
          total_files_purged INT DEFAULT 0,
          total_bytes_freed BIGINT DEFAULT 0,
          purged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          purged_by VARCHAR(100) DEFAULT 'AUTOMATED_RETENTION_WORKER'
        );
      `);

      // Seed standard test route if none exists
      const existing = await query(`SELECT id FROM driving_test_routes LIMIT 1`);
      if (existing.rows.length === 0) {
        const defaultCheckpoints = [
          {
            sequenceOrder: 1,
            checkpointType: 'START',
            latitude: 13.0827,
            longitude: 80.2707,
            radiusMeters: 30,
            speedLimitKmh: 40,
            voicePromptEn: 'Start your driving test. Maintain a safe driving speed.',
            voicePromptTa: 'உங்கள் ஓட்டுநர் சோதனையைத் தொடங்குங்கள். பாதுகாப்பான வேகத்தை பராமரிக்கவும்.',
            mandatoryStopDurationSec: 0,
          },
          {
            sequenceOrder: 2,
            checkpointType: 'LEFT_TURN',
            latitude: 13.085,
            longitude: 80.272,
            radiusMeters: 25,
            speedLimitKmh: 35,
            voicePromptEn: 'In 100 meters, take the next left turn safely. Use indicators.',
            voicePromptTa: 'அடுத்த இடதுபுறம் திரும்பவும். இன்டிகேட்டரை பயன்படுத்தவும்.',
            mandatoryStopDurationSec: 0,
          },
          {
            sequenceOrder: 3,
            checkpointType: 'TRAFFIC_SIGNAL',
            latitude: 13.088,
            longitude: 80.275,
            radiusMeters: 20,
            speedLimitKmh: 30,
            voicePromptEn: 'Approaching traffic signal. Bring vehicle to a complete stop at the stop line.',
            voicePromptTa: 'போக்குவரத்து சிக்னல் வருகிறது. நிறுத்தக் கோட்டில் முழுமையாக நிறுத்தவும்.',
            mandatoryStopDurationSec: 5,
          },
          {
            sequenceOrder: 4,
            checkpointType: 'RIGHT_TURN',
            latitude: 13.091,
            longitude: 80.273,
            radiusMeters: 25,
            speedLimitKmh: 40,
            voicePromptEn: 'Take the next right turn safely.',
            voicePromptTa: 'அடுத்த வலதுபுறம் பாதுகாப்பாக திரும்பவும்.',
            mandatoryStopDurationSec: 0,
          },
          {
            sequenceOrder: 5,
            checkpointType: 'REVERSE_PARK',
            latitude: 13.094,
            longitude: 80.271,
            radiusMeters: 20,
            speedLimitKmh: 15,
            voicePromptEn: 'Perform reverse parking between marked boundaries safely.',
            voicePromptTa: 'குறிக்கப்பட்ட எல்லைகளுக்கு இடையே ரிவர்ஸ் பார்க்கிங் செய்யவும்.',
            mandatoryStopDurationSec: 10,
          },
          {
            sequenceOrder: 6,
            checkpointType: 'DESTINATION',
            latitude: 13.097,
            longitude: 80.269,
            radiusMeters: 30,
            speedLimitKmh: 20,
            voicePromptEn: 'You have reached the final destination. Bring vehicle to a complete halt.',
            voicePromptTa: 'இறுதி இலக்கை அடைந்துவிட்டீர்கள். வாகனத்தை முழுமையாக நிறுத்தவும்.',
            mandatoryStopDurationSec: 0,
          },
        ];

        await query(
          `INSERT INTO driving_test_routes (title, city, total_distance_meters, estimated_duration_minutes, checkpoints, is_active)
           VALUES ($1, $2, $3, $4, $5, TRUE)`,
          ['Anna Nagar Driving Test Route 01', 'Chennai', 4500, 20, JSON.stringify(defaultCheckpoints)]
        );
        logger.info('✅ Seeded default Anna Nagar Driving Test Route');
      }

      this.tableInitialized = true;
      logger.info('✅ Driving Test tables verified/created successfully');
    } catch (err) {
      logger.error('❌ Failed to initialize Driving Test tables:', err);
    }
  }

  public static async getActiveRoute(): Promise<any> {
    await this.ensureTables();
    const res = await query(`SELECT * FROM driving_test_routes WHERE is_active = TRUE LIMIT 1`);
    return res.rows[0] || null;
  }

  public static async createSession(data: {
    driverId: string;
    routeId?: string;
    deviceModel?: string;
    simultaneousCameraSupported?: boolean;
    retentionExpiresAt: Date;
  }): Promise<any> {
    await this.ensureTables();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let safeRouteId = data.routeId && uuidRegex.test(data.routeId) ? data.routeId : null;
    if (!safeRouteId) {
      const activeRoute = await this.getActiveRoute();
      safeRouteId = activeRoute?.id || null;
    }

    const res = await query(
      `INSERT INTO driving_test_sessions (
        driver_id, route_id, status, started_at, device_model, simultaneous_camera_supported, retention_expires_at
      ) VALUES ($1, $2, 'IN_PROGRESS', NOW(), $3, $4, $5)
      RETURNING *`,
      [
        data.driverId,
        safeRouteId,
        data.deviceModel || 'Unknown',
        !!data.simultaneousCameraSupported,
        data.retentionExpiresAt,
      ]
    );
    return res.rows[0];
  }

  public static async getSessionById(sessionId: string): Promise<any> {
    await this.ensureTables();
    const res = await query(`SELECT * FROM driving_test_sessions WHERE id = $1`, [sessionId]);
    return res.rows[0] || null;
  }

  public static async saveRecordingSegment(data: {
    sessionId: string;
    cameraType: string;
    segmentIndex: number;
    durationMs: number;
    s3Bucket: string;
    s3Key: string;
    fileSizeBytes: number;
    checksum?: string;
  }): Promise<any> {
    await this.ensureTables();

    const existing = await query(
      `SELECT id FROM driving_test_recordings
       WHERE session_id = $1 AND camera_type = $2 AND segment_index = $3
       LIMIT 1`,
      [data.sessionId, data.cameraType, data.segmentIndex]
    );

    if (existing.rows.length > 0) {
      const updated = await query(
        `UPDATE driving_test_recordings
         SET duration_ms = $2,
             s3_bucket = $3,
             s3_key = $4,
             file_size_bytes = $5,
             checksum_sha256 = $6,
             is_uploaded = TRUE,
             is_purged = FALSE
         WHERE id = $1
         RETURNING *`,
        [
          existing.rows[0].id,
          data.durationMs,
          data.s3Bucket,
          data.s3Key,
          data.fileSizeBytes,
          data.checksum || null,
        ]
      );
      return updated.rows[0];
    }

    const res = await query(
      `INSERT INTO driving_test_recordings (
        session_id, camera_type, segment_index, duration_ms, s3_bucket, s3_key, file_size_bytes, checksum_sha256, is_uploaded
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING *`,
      [
        data.sessionId,
        data.cameraType,
        data.segmentIndex,
        data.durationMs,
        data.s3Bucket,
        data.s3Key,
        data.fileSizeBytes,
        data.checksum || null,
      ]
    );
    return res.rows[0];
  }

  public static async insertTelemetryBatch(
    sessionId: string,
    points: DrivingTelemetryPoint[]
  ): Promise<number> {
    await this.ensureTables();
    if (!points || points.length === 0) return 0;

    const values: any[] = [];
    const valuePlaceholders: string[] = [];

    points.forEach((pt, idx) => {
      const offset = idx * 7;
      valuePlaceholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
      );
      values.push(
        sessionId,
        Number(pt.timestamp) || Date.now(),
        Number(pt.latitude) || 0,
        Number(pt.longitude) || 0,
        Number(pt.speedKmh ?? (pt as any).speed_kmh ?? 0),
        Number(pt.heading || 0),
        pt.flaggedEvent || (pt as any).flagged_event || 'NONE'
      );
    });

    const sql = `
      INSERT INTO driving_test_telemetry (
        session_id, timestamp, latitude, longitude, speed_kmh, heading, flagged_event
      ) VALUES ${valuePlaceholders.join(', ')}
    `;

    await query(sql, values);
    return points.length;
  }

  public static async getTelemetryBySession(sessionId: string): Promise<any[]> {
    await this.ensureTables();
    const res = await query(
      `SELECT * FROM driving_test_telemetry WHERE session_id = $1 ORDER BY timestamp ASC`,
      [sessionId]
    );
    return res.rows;
  }

  public static async completeSession(
    sessionId: string,
    data: {
      status: string;
      totalDurationSeconds: number;
      totalDistanceMeters: number;
      driveScore: number;
      scoreBreakdown: ScoreBreakdown;
      autoVerdict: AutoVerdict;
      infractions: InfractionsCount;
    }
  ): Promise<any> {
    await this.ensureTables();
    const res = await query(
      `UPDATE driving_test_sessions SET
        status = $1,
        completed_at = NOW(),
        total_duration_seconds = $2,
        total_distance_meters = $3,
        drive_score = $4,
        score_breakdown = $5,
        auto_verdict = $6,
        infractions_count = $7,
        updated_at = NOW()
      WHERE id = $8
      RETURNING *`,
      [
        data.status,
        data.totalDurationSeconds,
        data.totalDistanceMeters,
        data.driveScore,
        JSON.stringify(data.scoreBreakdown),
        data.autoVerdict,
        JSON.stringify(data.infractions),
        sessionId,
      ]
    );
    return res.rows[0];
  }

  public static async listSessions(filters: {
    status?: string;
    adminDecision?: string;
    page?: number;
    limit?: number;
  }): Promise<{ sessions: any[]; total: number }> {
    await this.ensureTables();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (filters.status) {
      params.push(filters.status);
      whereClauses.push(`s.status = $${params.length}`);
    }

    if (filters.adminDecision) {
      params.push(filters.adminDecision);
      whereClauses.push(`s.admin_decision = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) as count FROM driving_test_sessions s ${whereSql}`, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit);
    params.push(offset);

    const listRes = await query(
      `SELECT s.*, d.first_name, d.last_name, d.phone_number, d.email
       FROM driving_test_sessions s
       LEFT JOIN drivers d ON d.id = s.driver_id
       ${whereSql}
       ORDER BY s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { sessions: listRes.rows, total };
  }

  public static async getRecordingsBySession(sessionId: string): Promise<any[]> {
    await this.ensureTables();
    const res = await query(
      `SELECT * FROM driving_test_recordings WHERE session_id = $1 ORDER BY segment_index ASC`,
      [sessionId]
    );
    return res.rows;
  }

  public static async updateAdminDecision(
    sessionId: string,
    data: {
      decision: AdminDecision;
      adminId?: string;
      notes: string;
      scoreOverride?: number;
    }
  ): Promise<any> {
    await this.ensureTables();
    const updates: string[] = ['admin_decision = $1', 'admin_notes = $2', 'reviewed_at = NOW()'];
    const params: any[] = [data.decision, data.notes];

    if (data.adminId) {
      params.push(data.adminId);
      updates.push(`admin_reviewer_id = $${params.length}`);
    }

    if (typeof data.scoreOverride === 'number') {
      params.push(data.scoreOverride);
      updates.push(`drive_score = $${params.length}`);
    }

    params.push(sessionId);
    const sql = `UPDATE driving_test_sessions SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const res = await query(sql, params);
    return res.rows[0];
  }

  public static async getExpiredSessionsForPurge(): Promise<any[]> {
    await this.ensureTables();
    const res = await query(
      `SELECT id, driver_id FROM driving_test_sessions
       WHERE retention_expires_at <= NOW()
         AND recordings_deleted = FALSE
         AND admin_decision IN ('APPROVED', 'REJECTED')
         AND legal_hold = FALSE
       LIMIT 100`
    );
    return res.rows;
  }

  public static async markRecordingsPurged(
    sessionId: string,
    driverId: string,
    totalFiles: number,
    totalBytes: number
  ): Promise<void> {
    await this.ensureTables();
    await query(`UPDATE driving_test_recordings SET is_purged = TRUE, s3_key = '[PURGED_BY_POLICY]' WHERE session_id = $1`, [sessionId]);
    await query(`UPDATE driving_test_sessions SET recordings_deleted = TRUE WHERE id = $1`, [sessionId]);
    await query(
      `INSERT INTO recording_retention_logs (session_id, driver_id, total_files_purged, total_bytes_freed, purged_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [sessionId, driverId, totalFiles, totalBytes]
    );
  }
}
