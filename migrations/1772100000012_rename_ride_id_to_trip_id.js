 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.renameColumn('trip_verifications', 'ride_id', 'trip_id');
  // renaming indexes if they were explicitly named or just rely on pg-migrate default behavior if not sure
  // From previous migration, ride_id index was created: pgm.createIndex('trip_verifications', 'ride_id');
  // pg-migrate typically names it trip_verifications_ride_id_index
  // Let's try to rename it for consistency
  pgm.sql('ALTER INDEX trip_verifications_ride_id_index RENAME TO trip_verifications_trip_id_index');
};

exports.down = (pgm) => {
  pgm.renameColumn('trip_verifications', 'trip_id', 'ride_id');
  pgm.sql('ALTER INDEX trip_verifications_trip_id_index RENAME TO trip_verifications_ride_id_index');
};
