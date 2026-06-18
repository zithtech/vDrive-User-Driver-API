 

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('drivers', {
    profile_pic_url: { type: 'text' },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumn('drivers', 'profile_pic_url', { ifExists: true });
};
