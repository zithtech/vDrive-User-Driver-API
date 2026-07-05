export interface TrustedContact {
  id?: string;
  user_id: string;
  user_type: 'driver' | 'customer';
  name: string;
  phone: string;
  relationship?: string;
  created_at?: Date;
}

export interface SosEvent {
  id: string;
  user_id: string;
  user_type: 'driver' | 'customer';
  trip_id?: string;
  status: 'ACTIVE' | 'RESOLVED';
  created_at: Date;
  resolved_at?: Date;
}

export interface SosLocation {
  id?: number;
  sos_id: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
}
