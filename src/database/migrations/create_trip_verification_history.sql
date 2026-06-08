-- Migration: Create trip_verification_history table
-- Purpose: Persist all verification events (submissions, re-uploads, admin reviews)
--          so that photos and decisions are auditable in the admin history panel.

CREATE TABLE IF NOT EXISTS trip_verification_history (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID            NOT NULL,
    driver_id       UUID            NOT NULL,
    trip_id         UUID,
    selfie_url      TEXT,
    car_image_url   TEXT,
    car_images      JSONB,
    status          VARCHAR(50),
    selfie_status   VARCHAR(50),
    car_image_status VARCHAR(50),
    event_type      VARCHAR(50)     NOT NULL,
    admin_id        UUID,
    remarks         TEXT,
    selfie_remarks  TEXT,
    car_image_remarks TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tvh_verification_id ON trip_verification_history (verification_id);
CREATE INDEX IF NOT EXISTS idx_tvh_driver_id       ON trip_verification_history (driver_id);
CREATE INDEX IF NOT EXISTS idx_tvh_trip_id         ON trip_verification_history (trip_id);
CREATE INDEX IF NOT EXISTS idx_tvh_created_at      ON trip_verification_history (created_at DESC);
