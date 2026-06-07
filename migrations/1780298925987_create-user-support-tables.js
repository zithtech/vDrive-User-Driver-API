/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.createTable('user_support_tickets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: '"users"(id)', onDelete: 'CASCADE' },
    subject: { type: 'varchar(255)', notNull: true },
    description: { type: 'text', notNull: true },
    category: { type: 'varchar(50)', notNull: true, default: 'general' },
    status: { type: 'varchar(20)', notNull: true, default: 'open' },
    priority: { type: 'varchar(10)', notNull: true, default: 'medium' },
    admin_notes: { type: 'text' },
    resolved_at: { type: 'timestamp with time zone' },
    created_at: { type: 'timestamp with time zone', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp with time zone', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('user_support_tickets', 'user_id');
  pgm.createIndex('user_support_tickets', 'status');

  pgm.createTable('user_support_messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    ticket_id: { type: 'uuid', notNull: true, references: '"user_support_tickets"(id)', onDelete: 'CASCADE' },
    sender_id: { type: 'uuid', notNull: true },
    sender_type: { type: 'varchar(10)', notNull: true }, // 'user' or 'admin'
    message: { type: 'text', notNull: true },
    is_read: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamp with time zone', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('user_support_messages', 'ticket_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('user_support_messages');
  pgm.dropTable('user_support_tickets');
};
