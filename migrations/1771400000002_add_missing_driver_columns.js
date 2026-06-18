 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('drivers', {
    role: { type: 'varchar(50)', default: 'driver' },
    onboarding_status: { type: 'varchar(50)', default: 'PHONE_VERIFIED' },
    documents_submitted: { type: 'boolean', default: false },
  }, { ifNotExists: true });
  
  // Also ensuring performance and payments columns exist as jsonb if they were missed
  // The repository uses them.
  pgm.addColumns('drivers', {
      kyc: { type: 'jsonb' },
      credit: { type: 'jsonb' },
      performance: { type: 'jsonb' },
      payments: { type: 'jsonb' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('drivers', ['role', 'onboarding_status', 'documents_submitted', 'kyc', 'credit', 'performance', 'payments'], { ifExists: true });
};
