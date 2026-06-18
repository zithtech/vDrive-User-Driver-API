import { Gender, UserRole, UserStatus, OnboardingStatus } from '../../enums/user.enums';
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
  is_trip_verified?: boolean;
  referral_code?: string;
  referral_count?: number;
  otp?: string;
  notes?: string;
  rating?: number;
  total_trips?: number;
}
