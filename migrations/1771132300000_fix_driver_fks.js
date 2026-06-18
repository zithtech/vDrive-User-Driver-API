 

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Fix driver_documents FK
  pgm.dropConstraint('driver_documents', 'driver_documents_driver_id_fkey', { ifExists: true });
  pgm.addConstraint('driver_documents', 'driver_documents_driver_id_fkey', {
    foreignKeys: {
      columns: 'driver_id',
      references: 'drivers(id)',
      onDelete: 'CASCADE'
    }
  });

  // 2. Fix driver_activity_logs FK
  pgm.dropConstraint('driver_activity_logs', 'driver_activity_logs_driver_id_fkey', { ifExists: true });
  pgm.addConstraint('driver_activity_logs', 'driver_activity_logs_driver_id_fkey', {
    foreignKeys: {
      columns: 'driver_id',
      references: 'drivers(id)',
      onDelete: 'CASCADE'
    }
  });

  // 3. Fix driver_wallet FK
  pgm.dropConstraint('driver_wallet', 'driver_wallet_driver_id_fkey', { ifExists: true });
  pgm.addConstraint('driver_wallet', 'driver_wallet_driver_id_fkey', {
    foreignKeys: {
      columns: 'driver_id',
      references: 'drivers(id)',
      onDelete: 'CASCADE'
    }
  });

  // 4. Optionally drop driver_profiles if we are sure it is redundant
  // For safety, we just leave it for now or drop it if it's explicitly legacy
  // pgm.dropTable('driver_profiles', { ifExists: true });
};

exports.down = (pgm) => {
  // Restore legacy references if needed (not recommended but for completeness)
  pgm.dropConstraint('driver_wallet', 'driver_wallet_driver_id_fkey', { ifExists: true });
  pgm.dropConstraint('driver_activity_logs', 'driver_activity_logs_driver_id_fkey', { ifExists: true });
  pgm.dropConstraint('driver_documents', 'driver_documents_driver_id_fkey', { ifExists: true });
};
