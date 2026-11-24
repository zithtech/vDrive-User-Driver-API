export type VideoKycStatus =
  | 'QUEUED'
  | 'RETRYING'
  | 'PENDING_SCHEDULING'
  | 'SCHEDULED'
  | 'IN_CALL'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'MISSED';

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

export interface VideoKycAppointment {
  id?: string;
  driver_id: string;
  session_id?: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  slot_label: string;
  officer_name?: string;
  notes?: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'MISSED';
  created_at?: Date;
  updated_at?: Date;
}

