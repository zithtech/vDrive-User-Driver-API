 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('trip_verifications', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    driver_id: {
      type: 'uuid',
      notNull: true,
      references: 'drivers(id)',
      onDelete: 'CASCADE',
    },
    ride_id: {
      type: 'uuid',
      notNull: false,
      references: 'trips(trip_id)',
      onDelete: 'SET NULL',
    },
    selfie_url: {
      type: 'text',
      notNull: true,
    },
    car_image_url: {
      type: 'text',
      notNull: false,
    },
    car_images: {
      type: 'jsonb',
      notNull: false,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending', 'approved', 'rejected')",
    },
    remarks: {
      type: 'text',
      notNull: false,
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('trip_verifications', 'driver_id');
  pgm.createIndex('trip_verifications', 'ride_id');
  pgm.createIndex('trip_verifications', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('trip_verifications');
};
