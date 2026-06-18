export type TripVerificationStatus = 'pending' | 'approved' | 'rejected';
export type ImageVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface TripVerification {
  id: string;
  driver_id: string;
  trip_id?: string;
  ride_id?: string; // Legacy column alias
  selfie_url: string;
  car_image_url: string;
  car_images?: string[];
  status: TripVerificationStatus;
  selfie_status: ImageVerificationStatus;
  car_image_status: ImageVerificationStatus;
  remarks?: string;
  selfie_remarks?: string;
  car_image_remarks?: string;
  rejection_reason?: {
    selfie?: string;
    car_image?: string;
  };
  admin_id?: string;
  attempt_number: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTripVerificationInput {
  driver_id: string;
  trip_id?: string;
  selfie_url: string;
  car_image_url?: string;
  car_images?: string[];
}

export interface UpdateTripVerificationInput {
  status?: TripVerificationStatus;
  selfie_status?: ImageVerificationStatus;
  car_image_status?: ImageVerificationStatus;
  remarks?: string;
  selfie_remarks?: string;
  car_image_remarks?: string;
  rejection_reason?: {
    selfie?: string;
    car_image?: string;
  };
  admin_id?: string;
}

// Rejection reason presets for admin UI
export const REJECTION_REASONS = {
  BLURRY: 'Image is blurry or unclear',
  IDENTITY_MISMATCH: 'Person does not match registered driver',
  WRONG_VEHICLE: 'Vehicle does not match registered vehicle',
  OBSTRUCTED: 'Face or vehicle partially obstructed',
  DARK_IMAGE: 'Image is too dark to verify',
  NOT_LIVE: 'Image appears to not be a live capture',
  WRONG_ANGLE: 'Image taken from wrong angle',
  OTHER: 'Other reason',
} as const;
