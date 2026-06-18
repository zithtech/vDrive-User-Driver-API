 

exports.shorthands = undefined;

exports.up = (pgm) => {
  // This migration is already in the DB but file was missing.
  // Restoring it as empty to satisfy node-pg-migrate.
};

exports.down = (pgm) => {
};
