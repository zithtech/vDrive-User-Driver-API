 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('drivers', {
    language: { type: 'varchar(10)', default: 'en' },
  }, { ifNotExists: true });
  
  pgm.addColumn('users', {
    language: { type: 'varchar(10)', default: 'en' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumn('drivers', 'language', { ifExists: true });
  pgm.dropColumn('users', 'language', { ifExists: true });
};
