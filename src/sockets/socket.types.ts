// shared/tripSocket.types.ts

export enum TripSocketEvent {
  //Trips
  NEW_TRIP_REQUEST = 'NEW_TRIP_REQUEST',
  TRIP_REQUESTED = 'TRIP_REQUESTED',
  TRIP_ACCEPTED = 'TRIP_ACCEPTED',
  TRIP_STARTED = 'TRIP_STARTED',
  TRIP_COMPLETED = 'TRIP_COMPLETED',
  TRIP_CANCELLED = 'TRIP_CANCELLED',
  TRIP_MID_CANCELLED = 'TRIP_MID_CANCELLED',
  TRIP_UPDATED = 'TRIP_UPDATED',
  TRIP_ASSIGNED = 'TRIP_ASSIGNED',
  TRIP_REMOVED = 'TRIP_REMOVED',
  TRIP_STATUS_CHANGED = 'TRIP_STATUS_CHANGED',
  DESTINATION_REACHED = 'DESTINATION_REACHED',
  WAIT_TIME_UPDATE = 'WAIT_TIME_UPDATE',

  //Driver
  DRIVER_LOCATION = 'DRIVER_LOCATION',
  DRIVER_AVAILABLE = 'DRIVER_AVAILABLE',
  DRIVER_UNAVAILABLE = 'DRIVER_UNAVAILABLE',
}

export interface TripEventPayload {
  tripId: string;
  status?: string;
  trip?: any;
  cancelledBy?: string;
  cancelReason?: string;
  notes?: string;
  driver?: {
    id?: string;
    name?: string;
    phone?: string;
    rating?: number;
    otp?: number;
    profilePic?: string;
    current_lat?: number;
    current_lng?: number;
    heading?: number;
  };
  message?: string;
  timestamp?: string;
}
