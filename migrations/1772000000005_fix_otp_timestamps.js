 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.alterColumn('otp', 'created_at', { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') });
  pgm.alterColumn('otp', 'expires_at', { type: 'timestamptz' });
};

exports.down = (pgm) => {
  pgm.alterColumn('otp', 'created_at', { type: 'timestamp', default: pgm.func('NOW()') });
  pgm.alterColumn('otp', 'expires_at', { type: 'timestamp' });
};
