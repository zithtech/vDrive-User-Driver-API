import { TripVerificationStatus, ImageVerificationStatus } from './trip-verification.model';

export type VerificationEventType = 'initial_submission' | 'reupload' | 'admin_review';

export interface TripVerificationHistory {
  id: string;
  verification_id: string;
  driver_id: string;
  trip_id?: string;
  selfie_url: string;
  car_image_url?: string;
  car_images?: string[];
  status: TripVerificationStatus | 'submitted';
  selfie_status?: ImageVerificationStatus;
  car_image_status?: ImageVerificationStatus;
  event_type: VerificationEventType;
  admin_id?: string;
  remarks?: string;
  selfie_remarks?: string;
  car_image_remarks?: string;
  created_at: Date;
}

export interface LogVerificationEventInput {
  verification_id: string;
  driver_id: string;
  trip_id?: string;
  selfie_url: string;
  car_image_url?: string;
  car_images?: string[];
  status: TripVerificationStatus | 'submitted';
  selfie_status?: ImageVerificationStatus;
  car_image_status?: ImageVerificationStatus;
  event_type: VerificationEventType;
  admin_id?: string;
  remarks?: string;
  selfie_remarks?: string;
  car_image_remarks?: string;
}
