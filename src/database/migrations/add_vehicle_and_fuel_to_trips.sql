-- Migration: Add vehicle_number, fuel_type, vehicle_brand, vehicle_name to trips table
ALTER TABLE trips ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(50);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(50);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS vehicle_brand VARCHAR(100);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS vehicle_name VARCHAR(100);
