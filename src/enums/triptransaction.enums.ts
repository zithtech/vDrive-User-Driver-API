export enum ActorType {
  User = 'user',
  Driver = 'driver',
  Admin = 'admin',
  System = 'system',
}

export enum TripEventType {
  // Lifecycle
  TripRequested = 'trip_requested',
  TripAccepted = 'trip_accepted',
  // TripRejected = "trip_rejected",
  TripCancelled = 'trip_cancelled',
  TripStarted = 'trip_started',
  TripCompleted = 'trip_completed',
  TripExpired = 'trip_expired',

  // Location & Route
  PickupLocationUpdated = 'pickup_location_updated',
  DropoffLocationUpdated = 'dropoff_location_updated',
  // RouteDeviated = "route_deviated",
  // WaypointAdded = "waypoint_added",
  // WaypointRemoved = "waypoint_removed",

  // Driver
  DriverAssigned = 'driver_assigned',
  DriverReassigned = 'driver_reassigned',
  DriverUnassigned = 'driver_unassigned',
  DriverArrivedPickup = 'driver_arrived_pickup',
  DriverArrivedDropoff = 'driver_arrived_dropoff',

  // Status & Payment
  StatusChanged = 'status_changed',
  PaymentStatusChanged = 'payment_status_changed',
  FareUpdated = 'fare_updated',
  PromoApplied = 'promo_applied',
  PromoRemoved = 'promo_removed',

  // Scheduling
  ScheduledTimeUpdated = 'scheduled_time_updated',
  TripRescheduled = 'trip_rescheduled',

  // Issues
  SosTriggered = 'sos_triggered',
  DisputeRaised = 'dispute_raised',
  DisputeResolved = 'dispute_resolved',
  TripFlagged = 'trip_flagged',

  // Misc
  NoteAdded = 'note_added',
  RatingSubmitted = 'rating_submitted',
  ReceiptGenerated = 'receipt_generated',
}

export enum TransactionStatus {
  Success = 'success',
  Failed = 'failed',
  Pending = 'pending',
  RolledBack = 'rolled_back',
}
