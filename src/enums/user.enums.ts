export enum UserRole {
  CUSTOMER = 'customer',
  DRIVER = 'driver',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
  PENDING_VERIFICATION = 'pending_verification',
}

export enum OnboardingStatus {
  PENDING = 'pending',
  PHONE_VERIFIED = 'phone_verified',
  PROFILE_COMPLETED = 'profile_completed',
  COMPLETED = 'completed',
}

export enum DriverOnboardingStatus {
  PENDING = 'PENDING',
  PHONE_VERIFIED = 'PHONE_VERIFIED',
  PROFILE_COMPLETED = 'PROFILE_COMPLETED',
  ADDRESS_COMPLETED = 'ADDRESS_COMPLETED',
  DOCS_SUBMITTED = 'DOCS_SUBMITTED',
  DOCUMENTS_APPROVED = 'DOCUMENTS_APPROVED',
  SUBSCRIPTION_ACTIVE = 'SUBSCRIPTION_ACTIVE',
  DOCS_REJECTED = 'DOCS_REJECTED',
  ACTIVE = 'ACTIVE',
}

export interface SessionPayload {
  id: string;
  deviceId: string;
  role: string;
}
