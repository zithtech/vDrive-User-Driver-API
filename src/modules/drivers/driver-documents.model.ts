export interface DriverDocument {
  id: string;
  driver_id: string;
  document_type:
    | 'rc'
    | 'insurance'
    | 'vehicle_license'
    | 'aadhaar_card'
    | 'driving_license'
    | 'pan_card'
    | 'profile_selfie'
    | 'police_verification';
  document_url?: any;
  status: 'pending' | 'verified' | 'rejected';
  uploaded_at: Date;
  verified_at?: Date;
  remarks?: string;
}

export enum DocumentType {
  RC = 'rc',
  INSURANCE = 'insurance',
  VEHICLE_LICENSE = 'vehicle_license',
  AADHAAR_CARD = 'aadhaar_card',
  DRIVING_LICENSE = 'driving_license',
  PAN_CARD = 'pan_card',
  PROFILE_SELFIE = 'profile_selfie',
  POLICE_VERIFICATION = 'police_verification',
}

export enum DocumentStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}
