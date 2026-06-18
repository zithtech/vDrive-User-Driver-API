 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('drivers', {
    subscription_active: { type: 'boolean', default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('drivers', ['subscription_active']);
};
