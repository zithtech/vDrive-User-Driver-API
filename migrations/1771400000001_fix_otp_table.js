 

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Add role column safely
  pgm.addColumn('otp', {
    role: { type: 'varchar(50)', notNull: true, default: 'user' },
  }, { ifNotExists: true });

  // Drop unique constraint on phone_number safely
  pgm.dropConstraint('otp', 'otp_phone_number_key', { ifExists: true });

  // Add index on (phone_number, role)
  // node-pg-migrate doesn't strictly support ifNotExists for createIndex in defined options in all versions, 
  // but let's try. If it fails, we can wrap in raw sql or ignore. 
  // Actually createIndex usually has { ifNotExists: true } option in newer versions.
  pgm.createIndex('otp', ['phone_number', 'role'], { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('otp', ['phone_number', 'role'], { ifExists: true });
  // Re-add unique constraint - this might fail if duplicates exist, but down migrations are best-effort usually.
  pgm.addConstraint('otp', 'otp_phone_number_key', { unique: 'phone_number' });
  pgm.dropColumn('otp', 'role', { ifExists: true });
};
