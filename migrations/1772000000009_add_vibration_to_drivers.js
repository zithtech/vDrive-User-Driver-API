 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('drivers', {
    is_vibration_enabled: { type: 'boolean', default: true },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumn('drivers', 'is_vibration_enabled', { ifExists: true });
};
