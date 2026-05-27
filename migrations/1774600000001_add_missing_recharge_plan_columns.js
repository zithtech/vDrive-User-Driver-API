/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.addColumn('recharge_plans', {
    tag: { type: 'varchar(100)' },
  });

  pgm.createTable('recharge_plan_history', {
    id: { type: 'serial', primaryKey: true },
    plan_id: { type: 'integer', notNull: true, references: 'recharge_plans(id)', onDelete: 'CASCADE' },
    admin_id: { type: 'uuid', notNull: true, references: 'admin_users(id)', onDelete: 'CASCADE' },
    action: { type: 'varchar(100)', notNull: true },
    previous_data: { type: 'jsonb' },
    new_data: { type: 'jsonb' },
    created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('recharge_plan_history');
  pgm.dropColumn('recharge_plans', 'tag');
};
