 

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Add missing TripStatus values
  pgm.sql("ALTER TYPE trip_status_enum ADD VALUE IF NOT EXISTS 'ARRIVED' AFTER 'ARRIVING'");

  // Add missing CancelReason values
  pgm.sql("ALTER TYPE cancel_reason_enum ADD VALUE IF NOT EXISTS 'PERSONAL_EMERGENCY'");
  pgm.sql("ALTER TYPE cancel_reason_enum ADD VALUE IF NOT EXISTS 'VEHICLE_PROBLEM'");
  pgm.sql("ALTER TYPE cancel_reason_enum ADD VALUE IF NOT EXISTS 'PICKUP_TOO_FAR'");
  pgm.sql("ALTER TYPE cancel_reason_enum ADD VALUE IF NOT EXISTS 'RIDER_NOT_RESPONDING'");
  pgm.sql("ALTER TYPE cancel_reason_enum ADD VALUE IF NOT EXISTS 'RIDER_ASKED_TO_CANCEL'");
  pgm.sql("ALTER TYPE cancel_reason_enum ADD VALUE IF NOT EXISTS 'TECHNICAL_ISSUE'");
};

exports.down = (pgm) => {
  // Enum value removal is not straightforward in PG
};
