import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import config from '../../config';
import { logger } from '../../shared/logger';
import { query } from '../../shared/database';
import { notifyAdmin } from '../../shared/eventBus';
import { getIO } from '../../sockets/socket';
import { KycRepository } from './kyc.repository';
import { VideoKycSession, VideoKycStatus } from './kyc.model';

export class KycService {
  /**
   * Helper to generate Agora RTC token
   */
  public static generateToken(channelName: string, uid: number, role: number = RtcRole.PUBLISHER): string {
    const appId = config.agora.appId;
    const appCertificate = config.agora.appCertificate;
    const expireTimeInSeconds = 3600; // 1 hour validity
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expireTimeInSeconds;

    return RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );
  }

  /**
   * 1. Driver requests Video KYC
   */
  public static async requestKyc(
    driverId: string,
    location?: { latitude: number; longitude: number }
  ): Promise<any> {
    // Check if driver has an existing active session
    let session = await KycRepository.findActiveSessionByDriverId(driverId);

    if (!session) {
      const sessionId = `kyc_${driverId}_${Date.now()}`;
      const channelName = `kyc_${driverId.replace(/-/g, '')}`;

      session = await KycRepository.create({
        session_id: sessionId,
        driver_id: driverId,
        channel_name: channelName,
        status: 'QUEUED',
        driver_uid: 0,
        admin_uid: 1,
        location,
      });

      // Update driver onboarding_status
      await query(
        `UPDATE drivers SET onboarding_status = $1, updated_at = NOW() WHERE id = $2`,
        ['VIDEO_KYC_WAITING', driverId]
      );
    }

    const position = await KycRepository.getQueuePosition(session.session_id);
    const estimatedWaitSeconds = Math.max(60, position * 180); // ~3 min per person in queue

    // Fetch driver details & uploaded documents to forward to Admin
    let driverInfo: any = {};
    let documents: any[] = [];
    try {
      const driverRes = await query(
        `SELECT id, first_name, last_name, phone_number, profile_pic_url, city FROM drivers WHERE id = $1`,
        [driverId]
      );
      driverInfo = driverRes.rows[0] || {};

      const docsRes = await query(
        `SELECT id, document_type, document_url, status, document_number FROM driver_documents WHERE driver_id = $1`,
        [driverId]
      );
      documents = docsRes.rows || [];
    } catch (e: any) {
      logger.warn('[KycService] Could not fetch extra driver metadata:', e.message);
    }

    // Generate token for driver
    const driverToken = this.generateToken(session.channel_name, session.driver_uid || 0);

    // Alert Admin Dashboard via Redis event bus
    notifyAdmin('NEW_VIDEO_KYC_REQUEST', {
      sessionId: session.session_id,
      driverId: session.driver_id,
      channelName: session.channel_name,
      position,
      estimatedWaitSeconds,
      driver: driverInfo,
      documents,
      location,
      timestamp: Date.now(),
    });

    logger.info(`📹 [KycService] Driver ${driverId} queued for Video KYC | Session: ${session.session_id} | Pos: ${position}`);

    return {
      sessionId: session.session_id,
      channelName: session.channel_name,
      token: driverToken,
      uid: session.driver_uid || 0,
      status: session.status,
      position,
      estimatedWaitSeconds,
    };
  }

  /**
   * 2. Get Agora RTC Token
   */
  public static async getToken(sessionId: string, driverId: string): Promise<any> {
    const session = await KycRepository.findBySessionId(sessionId);
    if (!session) {
      throw new Error('Video KYC session not found');
    }

    const token = this.generateToken(session.channel_name, session.driver_uid || 0);
    return {
      sessionId: session.session_id,
      channelName: session.channel_name,
      token,
      uid: session.driver_uid || 0,
    };
  }

  /**
   * 3. Get Session Status
   */
  public static async getStatus(driverId: string): Promise<any> {
    const session = await KycRepository.findLatestSessionByDriverId(driverId);
    if (!session) {
      return { status: 'NONE' };
    }

    let position = 0;
    if (session.status === 'QUEUED') {
      position = await KycRepository.getQueuePosition(session.session_id);
    }

    let token = '';
    if (session.status === 'IN_CALL' || session.status === 'QUEUED') {
      token = this.generateToken(session.channel_name, session.driver_uid || 0);
    }

    return {
      sessionId: session.session_id,
      channelName: session.channel_name,
      status: session.status,
      position,
      adminName: session.admin_name,
      remarks: session.remarks,
      token,
      uid: session.driver_uid || 0,
    };
  }

  /**
   * 4. Driver / Admin cancels pending or active Video KYC
   */
  public static async cancelKyc(sessionId: string, driverId?: string): Promise<any> {
    const session = await KycRepository.findBySessionId(sessionId);
    if (!session) {
      throw new Error('Video KYC session not found');
    }

    const dId = driverId || session.driver_id;

    await KycRepository.update(sessionId, { status: 'CANCELLED', ended_at: new Date() });

    // Revert driver onboarding status back to DOCS_SUBMITTED
    await query(
      `UPDATE drivers SET onboarding_status = $1, updated_at = NOW() WHERE id = $2`,
      ['DOCS_SUBMITTED', dId]
    );

    // Notify Admin Dashboard
    notifyAdmin('VIDEO_KYC_CANCELLED', {
      sessionId,
      driverId: dId,
      timestamp: Date.now(),
    });

    // Notify Driver App via socket so they exit the call screen immediately
    try {
      const io = getIO();
      io.to(`driver_${dId}`)
        .to(`kyc_${dId}`)
        .to(`kyc_session_${sessionId}`)
        .emit('KYC_ADMIN_DISCONNECTED', {
          sessionId,
          driverId: dId,
          action: 'HANGUP',
          message: 'The verification call was ended by the officer.',
        });
      logger.info(`🚫 [KycService] Session ${sessionId} cancelled; KYC_ADMIN_DISCONNECTED emitted to driver_${dId}`);
    } catch (e: any) {
      logger.warn('[KycService] Error emitting KYC_ADMIN_DISCONNECTED:', e.message);
    }

    logger.info(`🚫 [KycService] Session ${sessionId} cancelled for driver ${dId}`);
    return { success: true };
  }

  /**
   * 5. Admin accepts Video KYC request
   */
  public static async acceptKyc(
    sessionId: string,
    adminId?: string,
    adminName?: string
  ): Promise<any> {
    const session = await KycRepository.findBySessionId(sessionId);
    if (!session) {
      throw new Error('Video KYC session not found');
    }

    const updated = await KycRepository.update(sessionId, {
      status: 'IN_CALL',
      admin_id: adminId,
      admin_name: adminName || 'Verification Officer',
      started_at: new Date(),
    });

    // Generate unique numeric UID for admin and wildcard token (uid 0) to avoid UID_CONFLICT
    const adminUid = Math.floor(100000 + Math.random() * 900000);
    const adminToken = this.generateToken(session.channel_name, 0);
    const driverToken = this.generateToken(session.channel_name, session.driver_uid || 0);

    // Update driver onboarding status
    await query(
      `UPDATE drivers SET onboarding_status = $1, updated_at = NOW() WHERE id = $2`,
      ['VIDEO_KYC_IN_PROGRESS', session.driver_id]
    );

    // Push real-time event to driver's socket room
    try {
      const io = getIO();
      const payload = {
        sessionId: session.session_id,
        channelName: session.channel_name,
        token: driverToken,
        uid: session.driver_uid || 0,
        adminName: adminName || 'Verification Officer',
      };
      io.to(`driver_${session.driver_id}`)
        .to(`kyc_${session.driver_id}`)
        .to(`kyc_session_${session.session_id}`)
        .emit('KYC_CALL_ACCEPTED', payload);
      logger.info(`📞 [KycService] KYC_CALL_ACCEPTED emitted to driver_${session.driver_id}, kyc_${session.driver_id}, kyc_session_${session.session_id}`);
    } catch (e: any) {
      logger.warn('[KycService] Failed to emit via socket, relying on Redis bus:', e.message);
    }

    return {
      sessionId: session.session_id,
      channelName: session.channel_name,
      adminToken,
      adminUid,
      driverId: session.driver_id,
      status: 'IN_CALL',
    };
  }

  /**
   * 6. Admin sends live instruction prompt to driver during call
   */
  public static async sendPrompt(sessionId: string, promptText: string): Promise<any> {
    const session = await KycRepository.findBySessionId(sessionId);
    if (!session) throw new Error('Video KYC session not found');

    try {
      const io = getIO();
      io.to(`driver_${session.driver_id}`)
        .to(`kyc_${session.driver_id}`)
        .to(`kyc_session_${session.session_id}`)
        .emit('KYC_ADMIN_PROMPT', { promptText });
    } catch (e: any) {
      logger.warn('[KycService] Error emitting prompt:', e.message);
    }

    return { success: true };
  }

  /**
   * 7. Admin submits final verdict (Approved / Rejected)
   */
  public static async submitVerdict(
    sessionId: string,
    status: 'APPROVED' | 'REJECTED',
    remarks?: string,
    rejectionReasons?: string[]
  ): Promise<any> {
    const session = await KycRepository.findBySessionId(sessionId);
    if (!session) throw new Error('Video KYC session not found');

    const kycStatus: VideoKycStatus = status === 'APPROVED' ? 'COMPLETED' : 'REJECTED';

    await KycRepository.update(sessionId, {
      status: kycStatus,
      remarks,
      rejection_reasons: rejectionReasons,
      ended_at: new Date(),
    });

    const driverOnboardingStatus = status === 'APPROVED' ? 'DOCUMENTS_VERIFIED' : 'DOCS_REJECTED';
    const driverKycStatus = status === 'APPROVED' ? 'verified' : 'rejected';

    // Update driver in DB
    await query(
      `UPDATE drivers 
       SET onboarding_status = $1, 
           kyc_status = $2, 
           status = $3,
           updated_at = NOW() 
       WHERE id = $4`,
      [
        driverOnboardingStatus,
        driverKycStatus,
        status === 'APPROVED' ? 'active' : 'pending',
        session.driver_id,
      ]
    );

    // Real-time notification to driver app
    try {
      const io = getIO();
      const verdictPayload = {
        sessionId: session.session_id,
        status,
        remarks,
        rejectionReasons,
      };
      io.to(`driver_${session.driver_id}`)
        .to(`kyc_${session.driver_id}`)
        .to(`kyc_session_${session.session_id}`)
        .emit('KYC_RESULT', verdictPayload);
      logger.info(`✅ [KycService] KYC_RESULT (${status}) emitted to driver_${session.driver_id}, kyc_${session.driver_id}, kyc_session_${session.session_id}`);
    } catch (e: any) {
      logger.warn('[KycService] Error emitting verdict:', e.message);
    }

    return {
      success: true,
      sessionId,
      driverId: session.driver_id,
      status,
    };
  }

  /**
   * 8. Admin fetches active Video KYC queue
   */
  public static async getQueue(): Promise<any[]> {
    return KycRepository.getQueue();
  }
}

