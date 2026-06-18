  

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('drivers', {
    is_trip_verified: { type: 'boolean', default: false, notNull: true }
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('drivers', ['is_trip_verified'], { ifExists: true });
};
