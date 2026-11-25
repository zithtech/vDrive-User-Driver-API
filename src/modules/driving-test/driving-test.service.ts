import { s3Service } from '../s3/s3.service';
import { logger } from '../../shared/logger';
import { DrivingTestRepository } from './driving-test.repository';
import {
  ScoreBreakdown,
  InfractionsCount,
  AutoVerdict,
  AdminDecision,
  RouteCheckpoint,
} from './driving-test.model';

export class DrivingTestService {
  /**
   * Automated Drive Score Engine: evaluates session telemetry and checkpoints
   */
  public static calculateScore(
    telemetryLogs: any[],
    checkpoints: RouteCheckpoint[],
    totalDurationSeconds: number,
    totalDistanceMeters: number
  ): {
    driveScore: number;
    scoreBreakdown: ScoreBreakdown;
    autoVerdict: AutoVerdict;
    infractions: InfractionsCount;
    notes: string;
  } {
    if (!telemetryLogs || telemetryLogs.length < 20 || totalDurationSeconds < 60) {
      return {
        driveScore: 0,
        scoreBreakdown: {
          braking: 0,
          acceleration: 0,
          turning: 0,
          speed: 0,
          route: 0,
          parking: 0,
          signal: 0,
        },
        autoVerdict: 'INSUFFICIENT_DATA',
        infractions: {
          harshBrakes: 0,
          rapidAccels: 0,
          overspeeds: 0,
          signalViolations: 0,
        },
        notes: 'Session telemetry data was insufficient or GPS signal was lost.',
      };
    }

    let braking = 15;
    let acceleration = 10;
    let turning = 15;
    let speed = 15;
    let route = 15;
    let parking = 15;
    let signal = 15;

    let harshBrakes = 0;
    let rapidAccels = 0;
    let overspeeds = 0;
    let signalViolations = 0;

    // 1. Process Telemetry Events
    for (const pt of telemetryLogs) {
      if (pt.flagged_event === 'HARSH_BRAKE' || pt.flaggedEvent === 'HARSH_BRAKE') {
        harshBrakes++;
      } else if (pt.flagged_event === 'RAPID_ACCEL' || pt.flaggedEvent === 'RAPID_ACCEL') {
        rapidAccels++;
      } else if (pt.flagged_event === 'OVERSPEED' || pt.flaggedEvent === 'OVERSPEED') {
        overspeeds++;
      }
    }

    braking = Math.max(0, braking - harshBrakes * 3);
    acceleration = Math.max(0, acceleration - rapidAccels * 2);
    speed = Math.max(0, speed - overspeeds * 3);

    // 2. Process Checkpoints
    let completedCheckpoints = 0;
    for (const cp of checkpoints) {
      if (cp.reached) {
        completedCheckpoints++;

        if (cp.checkpointType === 'TRAFFIC_SIGNAL' && cp.speedAtCheckpoint && cp.speedAtCheckpoint > 5) {
          signalViolations++;
          signal = Math.max(0, signal - 10);
        }

        if (cp.checkpointType === 'REVERSE_PARK' && cp.parkingSuccessful === false) {
          parking = Math.max(0, parking - 7);
        }
      } else {
        route = Math.max(0, route - 4);
      }
    }

    const driveScore = Math.round(braking + acceleration + turning + speed + route + parking + signal);

    let autoVerdict: AutoVerdict = 'MANUAL_REVIEW';
    if (driveScore >= 80 && signalViolations === 0) {
      autoVerdict = 'RECOMMENDED_PASS';
    } else if (driveScore < 60 || signalViolations > 1) {
      autoVerdict = 'RECOMMENDED_FAIL';
    }

    return {
      driveScore,
      scoreBreakdown: {
        braking,
        acceleration,
        turning,
        speed,
        route,
        parking,
        signal,
      },
      autoVerdict,
      infractions: {
        harshBrakes,
        rapidAccels,
        overspeeds,
        signalViolations,
      },
      notes: `Automated analysis completed: ${harshBrakes} harsh brakes, ${overspeeds} overspeeds, ${completedCheckpoints}/${checkpoints.length} checkpoints reached.`,
    };
  }

  /**
   * Pre-signed S3 upload URL for a 60s video chunk
   */
  public static async getChunkUploadUrl(
    sessionId: string,
    cameraType: string,
    segmentIndex: number,
    contentType: string = 'video/mp4'
  ): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
    const key = `driving-tests/${sessionId}/${cameraType.toLowerCase()}_segment_${segmentIndex.toString().padStart(4, '0')}.mp4`;
    // 20 minutes expiration
    return await s3Service.getUploadUrl(key, contentType, 1200);
  }

  /**
   * Generates a pre-signed playback URL for video review
   */
  public static async getPlaybackUrl(s3Key: string): Promise<string> {
    try {
      return await s3Service.getReadUrl(s3Key, 3600);
    } catch (err) {
      logger.warn(`Could not sign playback URL for ${s3Key}, returning fallback`);
      return s3Key;
    }
  }

  /**
   * Daily purge routine for expired video recordings
   */
  public static async purgeExpiredRecordings(): Promise<{ purgedCount: number; bytesFreed: number }> {
    logger.info('[DrivingTestService] Starting daily video retention purge...');
    const expiredSessions = await DrivingTestRepository.getExpiredSessionsForPurge();

    let totalPurged = 0;
    let totalBytes = 0;

    for (const session of expiredSessions) {
      try {
        const recordings = await DrivingTestRepository.getRecordingsBySession(session.id);
        for (const rec of recordings) {
          if (!rec.is_purged && rec.s3_key && rec.s3_key !== '[PURGED_BY_POLICY]') {
            await s3Service.deleteFile(rec.s3_key);
            totalBytes += Number(rec.file_size_bytes || 0);
          }
        }

        await DrivingTestRepository.markRecordingsPurged(
          session.id,
          session.driver_id,
          recordings.length,
          totalBytes
        );
        totalPurged++;
      } catch (err) {
        logger.error(`Error purging videos for session ${session.id}:`, err);
      }
    }

    logger.info(`[DrivingTestService] Retention purge finished. Purged ${totalPurged} sessions.`);
    return { purgedCount: totalPurged, bytesFreed: totalBytes };
  }
}
