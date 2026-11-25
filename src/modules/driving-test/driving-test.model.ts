/**
 * Driving Test Types & Models (PostgreSQL & TypeScript)
 */

export type CheckpointType =
  | 'START'
  | 'LEFT_TURN'
  | 'RIGHT_TURN'
  | 'TRAFFIC_SIGNAL'
  | 'REVERSE_PARK'
  | 'DESTINATION';

export type DrivingSessionStatus =
  | 'INITIATED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ABORTED'
  | 'PASSED'
  | 'FAILED'
  | 'RETEST_REQUIRED';

export type AutoVerdict =
  | 'RECOMMENDED_PASS'
  | 'MANUAL_REVIEW'
  | 'RECOMMENDED_FAIL'
  | 'INSUFFICIENT_DATA'
  | 'PENDING';

export type AdminDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETEST_REQUESTED';

export interface RouteCheckpoint {
  sequenceOrder: number;
  checkpointType: CheckpointType;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  speedLimitKmh: number;
  voicePromptEn: string;
  voicePromptTa: string;
  mandatoryStopDurationSec: number;
  reached?: boolean;
  speedAtCheckpoint?: number;
  parkingSuccessful?: boolean;
}

export interface DrivingTestRoute {
  id: string;
  title: string;
  city: string;
  totalDistanceMeters: number;
  estimatedDurationMinutes: number;
  polyline: Array<[number, number]>;
  checkpoints: RouteCheckpoint[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ScoreBreakdown {
  braking: number;      // max 15
  acceleration: number; // max 10
  turning: number;      // max 15
  speed: number;        // max 15
  route: number;        // max 15
  parking: number;      // max 15
  signal: number;       // max 15
}

export interface InfractionsCount {
  harshBrakes: number;
  rapidAccels: number;
  overspeeds: number;
  signalViolations: number;
}

export interface DrivingTestSession {
  id: string;
  driverId: string;
  routeId: string;
  status: DrivingSessionStatus;
  startedAt: Date;
  completedAt?: Date;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  deviceModel?: string;
  simultaneousCameraSupported: boolean;
  driveScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  autoVerdict: AutoVerdict;
  infractionsCount?: InfractionsCount;
  adminDecision: AdminDecision;
  adminReviewerId?: string;
  adminNotes?: string;
  reviewedAt?: Date;
  retentionExpiresAt: Date;
  recordingsDeleted: boolean;
  legalHold: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DrivingTestRecording {
  id: string;
  sessionId: string;
  cameraType: 'FRONT' | 'REAR' | 'COMPOSITE';
  segmentIndex: number;
  durationMs: number;
  s3Bucket: string;
  s3Key: string;
  fileSizeBytes: number;
  checksumSha256?: string;
  isUploaded: boolean;
  isPurged: boolean;
  createdAt?: Date;
}

export interface DrivingTelemetryPoint {
  sessionId: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  speedKmh: number;
  heading?: number;
  accuracy?: number;
  flaggedEvent?: 'HARSH_BRAKE' | 'RAPID_ACCEL' | 'OVERSPEED' | 'CHECKPOINT' | 'NONE';
}
