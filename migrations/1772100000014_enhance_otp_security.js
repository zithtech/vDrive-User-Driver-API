 

exports.up = (pgm) => {
  pgm.addColumn('otp', {
    blocked_until: { type: 'timestamptz', default: null },
    request_count: { type: 'integer', notNull: true, default: 0 },
    last_requested_at: { type: 'timestamptz', default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('otp', ['blocked_until', 'request_count', 'last_requested_at']);
};
