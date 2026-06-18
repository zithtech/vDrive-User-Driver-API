 

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Create booking_type_enum
  pgm.sql(`DO $$ BEGIN
    CREATE TYPE booking_type_enum AS ENUM ('LIVE', 'SCHEDULED');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;`);

  // 2. Add booking_type to trips
  pgm.addColumns('trips', {
    booking_type: { type: 'booking_type_enum', notNull: true, default: 'LIVE' },
  }, { ifNotExists: true });

  // 3. Update trip_status_enum
  // Note: ALTER TYPE ADD VALUE cannot be executed inside a transaction block in some PG versions,
  // but node-pg-migrate usually handles this or we can use pgm.sql with a guard.
  pgm.sql("ALTER TYPE trip_status_enum ADD VALUE IF NOT EXISTS 'ACCEPTED' AFTER 'REQUESTED'");
  pgm.sql("ALTER TYPE trip_status_enum ADD VALUE IF NOT EXISTS 'ARRIVING' AFTER 'ACCEPTED'");

  // 4. Ensure drivers.availability is jsonb
  // The initial schema had it as boolean. Let's check and alter if needed.
  pgm.sql(`
    DO $$ 
    BEGIN 
      IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'availability') = 'boolean' THEN
        -- Drop the incompatible default first
        ALTER TABLE drivers ALTER COLUMN availability DROP DEFAULT;
        
        -- Alter the type
        ALTER TABLE drivers ALTER COLUMN availability TYPE jsonb USING 
          CASE WHEN availability THEN '{"online": true, "status": "ONLINE", "lastActive": null}'::jsonb 
          ELSE '{"online": false, "status": "OFFLINE", "lastActive": null}'::jsonb END;
          
        -- Set the new jsonb default
        ALTER TABLE drivers ALTER COLUMN availability SET DEFAULT '{"online": false, "status": "OFFLINE", "lastActive": null}'::jsonb;
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns('trips', ['booking_type'], { ifExists: true });
  pgm.dropType('booking_type_enum', { ifExists: true });
  // Note: Removing values from ENUM is not directly supported in PG without recreating the type.
  // We usually leave them as it's safe.
};
