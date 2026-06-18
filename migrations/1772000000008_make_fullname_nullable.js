 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.alterColumn('drivers', 'full_name', { notNull: false });
  pgm.alterColumn('users', 'full_name', { notNull: false });
};

exports.down = (pgm) => {
  pgm.alterColumn('drivers', 'full_name', { notNull: true });
  pgm.alterColumn('users', 'full_name', { notNull: true });
};
