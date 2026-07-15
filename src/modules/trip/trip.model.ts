import {
  BookingType,
  CancelBy,
  CancelReason,
  PaymentStatus,
  RideType,
  ServiceType,
  TripStatus,
  VehicleType,
  TransmissionType,
} from '../../enums/trip.enums';

//user-driver
export interface Trip {
  trip_id?: string;
  user_id: string;
  driver_id?: string;
  vehicle_id?: string;
  vehicle_model?: string;
  vehicle_type?: VehicleType;
  transmission_type?: TransmissionType;
  ride_type: RideType;
  service_type: ServiceType;
  booking_type: BookingType;
  is_for_self: boolean;
  passenger_details?: {
    name: string;
    phone: string;
  };
  trip_status: TripStatus;
  original_scheduled_start_time: Date;
  scheduled_start_time?: Date;
  actual_pickup_time?: Date;
  actual_drop_time?: Date;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  drop_lat: number;
  drop_lng: number;
  drop_address: string;
  distance_km: number;
  trip_duration_minutes?: number;
  waiting_time_minutes?: number;
  base_fare: number;
  waiting_charges?: number;
  additional_charges?: number;
  driver_allowance?: number;
  platform_fee: number;
  total_fare: number;
  paid_amount?: number;
  payment_status: PaymentStatus;
  cancel_reason?: CancelReason;
  cancel_by?: CancelBy;
  notes?: string;
  rating?: number;
  re_route_id?: string;
  feedback?: string;
  otp?: string;
  assigned_at?: Date;
  started_at?: Date;
  ended_at?: Date;
  wait_started_at?: Date;
  day_halt_started_at?: Date;
  return_started_at?: Date;
  day_halt_charges?: number;
  created_by?: string;
  updated_by?: string;
  applied_coupon_id?: string;
  coupon_code?: string;
  discount?: number;
  package_hours?: number;
  outstation_trip_type?: string;
  created_at?: Date;
  updated_at?: Date;
  rejected_drivers?: string[];
  [key: string]: unknown;
}

//Admin
export interface TripDetailsType {
  trip_id: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_id: string | null;
  car_number: string | null;
  car_type: string | null;

  ride_type: 'ONE_WAY' | 'ROUND_TRIP' | 'OUTSTATION_ONE_WAY'|'OUTSTATION_ROUND_TRIP';
  service_type: 'DRIVER_ONLY' | 'CAB+DRIVER';

  trip_status: 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'UPCOMING' | 'REQUESTED' | 'MID-CANCELLED';

  original_scheduled_start_time: string;
  scheduled_start_time: string;

  actual_pickup_time: string | null;
  actual_drop_time: string | null;

  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;

  drop_lat: number;
  drop_lng: number;
  drop_address: string;

  distance_km: number;
  trip_duration_minutes: number;
  waiting_time_minutes: number;

  Estimate_km: number;
  distance_fare_per_km: number;
  distance_fare: number;

  base_fare: number;
  time_fare_per_minute: number;
  time_fare: number;
  waiting_charges: number;
  additional_charges: number;
  driver_allowance: number;
  return_compensation: number;
  platform_fee: number;
  total_fare: number;
  surge_multiplier: number;
  surge_pricing: number;

  tip: number;
  toll_charges: number;
  night_charges: number;
  discount: number;
  gst_percentage: number;
  gst_amount: number;

  subtotal: number;
  paid_amount: number;
  payment_status: 'PAID' | 'PENDING' | 'FAILED';
  payment_method: 'UPI' | 'CASH' | 'CARD' | 'WALLET';

  cancel_reason: string | null;
  cancel_by: 'USER' | 'DRIVER' | 'ADMIN' | null;

  notes: string | null;

  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  wait_started_at: string | null;
  day_halt_started_at: string | null;
  return_started_at: string | null;
  day_halt_charges: number | null;

  package_hours: number | null;
  outstation_trip_type: string | null;
  trip_code: string;
  trip_transactions: any[];
}
