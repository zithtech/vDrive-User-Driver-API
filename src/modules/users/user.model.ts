import { Gender, UserRole, UserStatus, OnboardingStatus, DeletionStatus } from '../../enums/user.enums';
export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}
export interface User {
  id?: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone_number: string;
  profile_url?: string;
  alternate_contact?: string;
  password?: Text;
  reset_token?: Text;
  reset_token_expiry?: Date;
  gender?: Gender;
  role?: UserRole;
  user_code?: string;
  date_of_birth?: Date;
  status: UserStatus;
  onboarding_status?: OnboardingStatus;
  fcm_token?: string | null;
  email?: string;
  device_id: string;
  created_by?: string;
  updated_by?: string;
  settings_preferences?: {
    invoice_email: boolean;
    promo_email: boolean;
    whatsapp_updates: boolean;
    push_notifications: boolean;
    sms_alerts: boolean;
  };
  favourite_places?: {
    id: string;
    name: string;
    showname?: string;
    address: string;
    lat: number;
    lng: number;
  }[];
  emergency_contacts?: EmergencyContact[];
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
  is_deleted?: boolean;
  language?: string;
  phone_verified?: boolean;
  is_trip_verified?: boolean;
  referral_code?: string;
  referral_count?: number;
  referred_by?: string;
  otp?: string;
  notes?: string;
  rating?: number;
  total_trips?: number;
  wallet_balance?: number;
  wallet_pin?: string;
  has_wallet_pin?: boolean;
}

export interface DeletionRequest {
  id?: string;
  user_id: string;
  status: DeletionStatus;
  reason?: string;
  requested_at?: Date;
  scheduled_deletion_date?: Date;
  cancelled_at?: Date;
  completed_at?: Date;
}

export interface AuditLog {
  id?: string;
  user_id: string | null;
  action: string;
  ip_address?: string;
  created_at?: Date;
  details?: Record<string, any>;
}
