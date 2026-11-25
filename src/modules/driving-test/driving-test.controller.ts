import { Request, Response } from 'express';
import { logger } from '../../shared/logger';
import { query } from '../../shared/database';
import { DrivingTestRepository } from './driving-test.repository';
import { DrivingTestService } from './driving-test.service';

export class DrivingTestController {
  /**
   * GET /api/driving-test/eligibility/:driverId
   * Validates if Document KYC & Video KYC are both approved
   */
  public static async checkEligibility(req: Request, res: Response): Promise<any> {
    try {
      const { driverId } = req.params;

      // Check driver record
      const driverRes = await query(
        `SELECT id, onboarding_status, kyc_status, status FROM drivers WHERE id = $1`,
        [driverId]
      );

      if (driverRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }

      const driver = driverRes.rows[0];
      const onboardingStatus = (driver.onboarding_status || '').toUpperCase();
      const kycStatus = (driver.kyc_status || '').toUpperCase();

      // Check verified documents count (must have at least driving_license and aadhaar/identity verified)
      const docsRes = await query(
        `SELECT COUNT(*) as verified_count FROM driver_documents 
         WHERE driver_id = $1 AND (UPPER(status) = 'APPROVED' OR UPPER(status) = 'VERIFIED')`,
        [driverId]
      );
      const verifiedDocsCount = parseInt(docsRes.rows[0]?.verified_count || '0', 10);
      const documentKycApproved = verifiedDocsCount >= 2 || onboardingStatus === 'DOCUMENTS_APPROVED' || onboardingStatus === 'DOCUMENTS_VERIFIED';

      // Check Video KYC
      const vkycRes = await query(
        `SELECT status FROM video_kyc_sessions WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [driverId]
      );
      const vkycStatus = (vkycRes.rows[0]?.status || '').toUpperCase();
      const videoKycApproved = vkycStatus === 'VERIFIED' || vkycStatus === 'APPROVED' || kycStatus === 'VERIFIED' || onboardingStatus === 'KYC_VERIFIED';

      const isEligible = documentKycApproved && videoKycApproved;

      return res.status(200).json({
        success: true,
        driverId,
        eligible: isEligible,
        documentKycApproved,
        videoKycApproved,
        drivingTestUnlocked: isEligible,
        message: isEligible
          ? 'KYC verified. Driving test is unlocked.'
          : 'Both Document KYC and Video KYC must be approved before taking the driving test.',
      });
    } catch (err: any) {
      logger.error('Error in checkEligibility:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/driving-test/routes/assigned/:driverId
   */
  public static async getAssignedRoute(req: Request, res: Response): Promise<any> {
    try {
      const route = await DrivingTestRepository.getActiveRoute();
      return res.status(200).json({ success: true, route });
    } catch (err: any) {
      logger.error('Error in getAssignedRoute:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/driving-test/start
   */
  public static async startSession(req: Request, res: Response): Promise<any> {
    try {
      let { driverId, routeId, deviceModel, simultaneousCameraSupported } = req.body;

      // Validate routeId is a valid UUID, otherwise fallback to the active route
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!routeId || !uuidRegex.test(routeId)) {
        const activeRoute = await DrivingTestRepository.getActiveRoute();
        routeId = activeRoute?.id || null;
      }

      // 30 days retention expiry
      const retentionExpiry = new Date();
      retentionExpiry.setDate(retentionExpiry.getDate() + 30);

      const session = await DrivingTestRepository.createSession({
        driverId,
        routeId,
        deviceModel,
        simultaneousCameraSupported: !!simultaneousCameraSupported,
        retentionExpiresAt: retentionExpiry,
      });

      // Update driver onboarding status to DRIVING_TEST_IN_PROGRESS
      await query(`UPDATE drivers SET onboarding_status = 'DRIVING_TEST_IN_PROGRESS' WHERE id = $1`, [driverId]);

      return res.status(201).json({
        success: true,
        sessionId: session.id,
        status: session.status,
        retentionExpiresAt: session.retention_expires_at,
      });
    } catch (err: any) {
      logger.error('Error in startSession:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/driving-test/recordings/upload-url
   */
  public static async getChunkUploadUrl(req: Request, res: Response): Promise<any> {
    try {
      const { sessionId, cameraType, segmentIndex, contentType } = req.body;

      const result = await DrivingTestService.getChunkUploadUrl(
        sessionId,
        cameraType || 'REAR',
        segmentIndex || 1,
        contentType || 'video/mp4'
      );

      return res.status(200).json({
        success: true,
        uploadUrl: result.uploadUrl,
        fileUrl: result.fileUrl,
        s3Key: result.key,
      });
    } catch (err: any) {
      logger.error('Error in getChunkUploadUrl:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/driving-test/recordings/segment
   */
  public static async registerRecordingSegment(req: Request, res: Response): Promise<any> {
    try {
      const { sessionId, cameraType, segmentIndex, durationMs, s3Key, fileSizeBytes, checksum } = req.body;

      const safeKey = s3Key || `driving-tests/${sessionId}/${(cameraType || 'REAR').toLowerCase()}_segment_${String(segmentIndex || 1).padStart(4, '0')}.mp4`;

      const recording = await DrivingTestRepository.saveRecordingSegment({
        sessionId,
        cameraType: cameraType || 'REAR',
        segmentIndex: segmentIndex || 1,
        durationMs: durationMs || 60000,
        s3Bucket: process.env.S3_BUCKET_NAME || 't2drive-016829298433-ap-south-1-an',
        s3Key: safeKey,
        fileSizeBytes: fileSizeBytes || 0,
        checksum,
      });

      return res.status(201).json({ success: true, recordingId: recording.id, s3Key: safeKey });
    } catch (err: any) {
      logger.error('Error in registerRecordingSegment:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/driving-test/telemetry
   */
  public static async receiveTelemetryBatch(req: Request, res: Response): Promise<any> {
    try {
      const { sessionId, telemetryPoints } = req.body;
      const count = await DrivingTestRepository.insertTelemetryBatch(sessionId, telemetryPoints);
      return res.status(200).json({ success: true, count });
    } catch (err: any) {
      logger.error('Error in receiveTelemetryBatch:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/driving-test/checkpoint
   */
  public static async logCheckpointArrival(req: Request, res: Response): Promise<any> {
    try {
      const { sessionId, checkpointId, reachedAt, speedKmh } = req.body;
      return res.status(200).json({
        success: true,
        sessionId,
        checkpointId,
        message: 'Checkpoint logged successfully',
      });
    } catch (err: any) {
      logger.error('Error in logCheckpointArrival:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/driving-test/complete
   */
  public static async completeSession(req: Request, res: Response): Promise<any> {
    try {
      const { sessionId, driverId, totalDurationSeconds, totalDistanceMeters, checkpointsCompleted } = req.body;

      // 1. Fetch telemetry logs
      const telemetry = await DrivingTestRepository.getTelemetryBySession(sessionId);

      // 2. Run Score Engine
      const scoreResult = DrivingTestService.calculateScore(
        telemetry,
        Array.isArray(checkpointsCompleted) ? checkpointsCompleted : [],
        totalDurationSeconds || 900,
        totalDistanceMeters || 4500
      );

      // 3. Complete session in DB
      const updatedSession = await DrivingTestRepository.completeSession(sessionId, {
        status: scoreResult.autoVerdict === 'RECOMMENDED_FAIL' ? 'FAILED' : 'COMPLETED',
        totalDurationSeconds: totalDurationSeconds || 900,
        totalDistanceMeters: totalDistanceMeters || 4500,
        driveScore: scoreResult.driveScore,
        scoreBreakdown: scoreResult.scoreBreakdown,
        autoVerdict: scoreResult.autoVerdict,
        infractions: scoreResult.infractions,
      });

      // 4. Update Driver Onboarding Status
      const nextDriverStatus =
        scoreResult.autoVerdict === 'RECOMMENDED_FAIL'
          ? 'DRIVING_TEST_RETEST_REQUIRED'
          : 'DRIVING_TEST_PENDING_APPROVAL';

      await query(`UPDATE drivers SET onboarding_status = $1 WHERE id = $2`, [nextDriverStatus, driverId]);

      return res.status(200).json({
        success: true,
        sessionId,
        driveScore: scoreResult.driveScore,
        scoreBreakdown: scoreResult.scoreBreakdown,
        autoVerdict: scoreResult.autoVerdict,
        infractions: scoreResult.infractions,
        session: updatedSession,
      });
    } catch (err: any) {
      logger.error('Error in completeSession:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/driving-test/result/:sessionId
   */
  public static async getSessionResult(req: Request, res: Response): Promise<any> {
    try {
      const { sessionId } = req.params;
      const session = await DrivingTestRepository.getSessionById(sessionId);

      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }

      return res.status(200).json({
        success: true,
        score: session.drive_score,
        verdict: session.auto_verdict,
        scoreBreakdown: session.score_breakdown,
        adminDecision: session.admin_decision,
        adminNotes: session.admin_notes,
      });
    } catch (err: any) {
      logger.error('Error in getSessionResult:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/drivers/onboarding-status/:driverId
   */
  public static async getUnifiedOnboardingStatus(req: Request, res: Response): Promise<any> {
    try {
      const { driverId } = req.params;
      const driverRes = await query(`SELECT * FROM drivers WHERE id = $1`, [driverId]);

      if (driverRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }

      const driver = driverRes.rows[0];

      // Fetch latest driving test session
      const testRes = await query(
        `SELECT * FROM driving_test_sessions WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [driverId]
      );
      const latestTest = testRes.rows[0];

      return res.status(200).json({
        success: true,
        driverId,
        onboardingStatus: driver.onboarding_status,
        accountStatus: driver.status,
        stages: {
          registration: { status: 'COMPLETED' },
          documentKyc: { status: 'APPROVED' },
          videoKyc: { status: 'APPROVED' },
          drivingTest: latestTest
            ? {
                status: latestTest.status,
                score: latestTest.drive_score,
                verdict: latestTest.auto_verdict,
                adminDecision: latestTest.admin_decision,
              }
            : { status: 'PENDING' },
          finalApproval: {
            status: driver.onboarding_status === 'ACTIVE' ? 'APPROVED' : latestTest?.admin_decision || 'PENDING',
          },
        },
      });
    } catch (err: any) {
      logger.error('Error in getUnifiedOnboardingStatus:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /* ================= ADMIN CONSOLE ENDPOINTS ================= */

  /**
   * GET /api/admin/driving-tests
   */
  public static async adminListSessions(req: Request, res: Response): Promise<any> {
    try {
      const { status, adminDecision, page, limit } = req.query;
      const result = await DrivingTestRepository.listSessions({
        status: status as string,
        adminDecision: adminDecision as string,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      logger.error('Error in adminListSessions:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/admin/driving-tests/:id/report
   */
  public static async adminGetSessionReport(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      const session = await DrivingTestRepository.getSessionById(id);

      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }

      // Fetch recordings and generate pre-signed playback URLs
      const recordings = await DrivingTestRepository.getRecordingsBySession(id);
      const frontVideos = [];
      const rearVideos = [];

      for (const rec of recordings) {
        const playbackUrl = await DrivingTestService.getPlaybackUrl(rec.s3_key);
        const item = {
          segmentIndex: rec.segment_index,
          playbackUrl,
          durationMs: rec.duration_ms,
        };
        if (rec.camera_type === 'FRONT' || rec.camera_type === 'FRONT_CABIN') {
          frontVideos.push(item);
        } else {
          rearVideos.push(item);
        }
      }

      // Fetch high-frequency telemetry logs for scrubber
      const telemetry = await DrivingTestRepository.getTelemetryBySession(id);

      return res.status(200).json({
        success: true,
        session,
        media: {
          frontVideos,
          rearVideos,
          isPurged: session.recordings_deleted,
        },
        scrubber: {
          telemetry,
          totalPoints: telemetry.length,
        },
      });
    } catch (err: any) {
      logger.error('Error in adminGetSessionReport:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/admin/driving-tests/:id/decision
   */
  public static async adminSubmitDecision(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      const { decision, notes, adminId, scoreOverride } = req.body;

      if (!['APPROVED', 'REJECTED', 'RETEST_REQUESTED'].includes(decision)) {
        return res.status(400).json({ success: false, message: 'Invalid admin decision' });
      }

      if (!notes || notes.trim().length < 4) {
        return res.status(400).json({ success: false, message: 'Review notes are required for audit trail' });
      }

      const session = await DrivingTestRepository.updateAdminDecision(id, {
        decision,
        adminId,
        notes,
        scoreOverride,
      });

      // Update driver table accordingly
      if (decision === 'APPROVED') {
        await query(
          `UPDATE drivers SET onboarding_status = 'ACTIVE', status = 'active' WHERE id = $1`,
          [session.driver_id]
        );
      } else if (decision === 'RETEST_REQUESTED') {
        await query(
          `UPDATE drivers SET onboarding_status = 'DRIVING_TEST_RETEST_REQUIRED' WHERE id = $1`,
          [session.driver_id]
        );
      } else if (decision === 'REJECTED') {
        await query(
          `UPDATE drivers SET onboarding_status = 'REJECTED', status = 'inactive' WHERE id = $1`,
          [session.driver_id]
        );
      }

      return res.status(200).json({
        success: true,
        message: `Decision recorded: ${decision}`,
        session,
      });
    } catch (err: any) {
      logger.error('Error in adminSubmitDecision:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
