// src/modules/drivers/driver.model.ts
import { DriverOnboardingStatus } from '../../enums/user.enums';

export type DriverRole = string;
export type DriverStatus = string;

export interface DocumentUrl {
  url?: string;
  front?: string;
  back?: string;
  [key: string]: string | undefined;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

export enum DriverAvailabilityStatus {
  OFFLINE = 'OFFLINE',
  ONLINE = 'ONLINE',
  ON_TRIP = 'ON_TRIP',
  HAS_UPCOMING_SCHEDULED = 'HAS_UPCOMING_SCHEDULED',
}

export interface Availability {
  online: boolean;
  status: DriverAvailabilityStatus;
  lastActive: string | null;
}

export interface KYC {
  overallStatus: 'verified' | 'pending' | 'rejected' | string;
  verifiedAt: string | null;
}

export interface Credit {
  limit: number;
  balance: number;
  totalRecharged: number;
  totalUsed: number;
  lastRechargeAt: string | null;
}

export interface Recharge {
  transactionId: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  status: string;
  createdAt: string;
}

export interface CreditUsage {
  usageId: string;
  tripId: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

export interface Document {
  documentId: string;
  documentType: string;
  documentNumber: string;
  documentUrl: DocumentUrl;
  licenseStatus: string;
  expiryDate: string;
}

export interface Performance {
  averageRating: number;
  totalTrips: number;
  cancellations: number;
  lastActive: string | null;
}

export interface Payments {
  totalEarnings: number;
  pendingPayout: number;
  commissionPaid: number;
}

export interface ActivityLog {
  logId: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface Driver {
  driverId?: string;
  device_id?: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  phone_number: string;
  alternate_contact?: string;
  email: string;
  profilePicUrl?: string;
  profile_picture?: string;
  profile_pic_url?: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  address?: Address;
  role: DriverRole;
  status: DriverStatus;
  status_reason?: string;
  rating?: number;
  total_trips?: number;
  total_earnings?: number;
  availability?: Availability;
  kyc_status?: KYC;
  credit?: Credit;
  recharges?: Recharge[];
  creditUsage?: CreditUsage[];
  created_at?: string;
  updated_at?: string;
  documents?: Document[];
  onboarding_status?: DriverOnboardingStatus;
  documents_submitted?: boolean;
  performance?: Performance;
  payments?: Payments;
  activityLogs?: ActivityLog[];
  last_active?: string;
  is_trip_verified?: boolean;
  language?: string;
  is_vibration_enabled?: boolean;
  fcm_token?: string;
  vdrive_id?: string;
  active_subscription?: {
    platform_subscription_id?: number;
    plan_name: string;
    billing_cycle: string;
    start_date: string;
    expiry_date: string;
    status: string;
  };

  current_lat?: number;
  current_lng?: number;
  location?: string;
  current_heading?: number;
  referral_code?: string;
  referred_by?: string;
}

export interface CreateDriverInput {
  device_id?: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone_number: string;
  alternate_contact?: string;
  email: string;
  profilePicUrl?: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  address: Address;
  role: DriverRole;
  status: DriverStatus;
  documents?: Omit<Document, 'documentId'>[];
  kyc_status?: KYC;
  onboarding_status?:
    | 'PHONE_VERIFIED'
    | 'PROFILE_COMPLETED'
    | 'ADDRESS_COMPLETED'
    | 'DOCS_SUBMITTED'
    | 'DOCUMENTS_APPROVED'
    | 'SUBSCRIPTION_ACTIVE'
    | 'DOCS_REJECTED'
    | 'ACTIVE';
  documents_submitted?: boolean;
  credit?: Credit;
  availability?: Availability;
  performance?: Performance;
  payments?: Payments;
  rating?: number;
  is_trip_verified?: boolean;
  total_trips?: number;
  total_earnings?: number;
  language?: string;
  is_vibration_enabled?: boolean;
  fcm_token?: string;
  referral_code?: string;
  referred_by?: string;
}

export interface UpdateDriverInput
  extends Partial<
    Omit<
      CreateDriverInput,
      'documents' | 'kyc' | 'credit' | 'availability' | 'performance' | 'payments'
    >
  > {
  driverId?: string;
  documents?: Partial<Document>[];
  kyc?: Partial<KYC>;
  credit?: Partial<Credit>;
  availability?: Partial<Availability>;
  performance?: Partial<Performance>;
  payments?: Partial<Payments>;
  onboarding_status?:
    | 'PHONE_VERIFIED'
    | 'PROFILE_COMPLETED'
    | 'ADDRESS_COMPLETED'
    | 'DOCS_SUBMITTED'
    | 'DOCUMENTS_APPROVED'
    | 'SUBSCRIPTION_ACTIVE'
    | 'DOCS_REJECTED'
    | 'ACTIVE';
  documents_submitted?: boolean;
  is_trip_verified?: boolean;
  language?: string;
  is_vibration_enabled?: boolean;
  fcm_token?: string;
  rating?: number;
  status_reason?: string;
  total_earnings?: number;
  total_trips?: number;
  referral_code?: string;
  referred_by?: string;
}
