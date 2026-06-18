 

exports.up = (pgm) => {
  pgm.createTable('driver_online_sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    driver_id: {
      type: 'uuid',
      notNull: true,
      references: '"drivers"',
      onDelete: 'CASCADE',
    },
    went_online_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    went_offline_at: {
      type: 'timestamptz',
      default: null,
    },
    duration_minutes: {
      type: 'numeric(10,2)',
      default: 0,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('driver_online_sessions', 'driver_id');
  pgm.createIndex('driver_online_sessions', 'went_online_at');
};

exports.down = (pgm) => {
  pgm.dropTable('driver_online_sessions');
};
