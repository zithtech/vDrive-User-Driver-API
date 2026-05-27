/** Add category column to support_tickets */
exports.up = async (pgm) => {
  pgm.addColumn('support_tickets', {
    category: {
      type: 'varchar(50)',
      default: 'general',
      notNull: true,
    },
  });
};

exports.down = async (pgm) => {
  pgm.dropColumn('support_tickets', 'category');
};
