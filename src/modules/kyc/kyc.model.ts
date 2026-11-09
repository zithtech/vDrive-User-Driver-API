export type VideoKycStatus = 'QUEUED' | 'IN_CALL' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';

export interface VideoKycSession {
  id?: string;
  session_id: string;
  driver_id: string;
  admin_id?: string;
  admin_name?: string;
  channel_name: string;
  status: VideoKycStatus;
  driver_uid: number;
  admin_uid: number;
  driver_token?: string;
  admin_token?: string;
  remarks?: string;
  rejection_reasons?: string[];
  location?: { latitude: number; longitude: number };
  started_at?: Date;
  ended_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

