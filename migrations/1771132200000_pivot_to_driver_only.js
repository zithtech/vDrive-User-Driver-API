 

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Drop vehicles table
  pgm.dropTable('vehicles', { ifExists: true });

  // 3. Update document_type ENUM to remove vehicle types
  // Note: Postgres doesn't easily allow removing values from ENUMs within a transaction.
  // We will instead just ensure the application logic only uses the identity ones.
  // If we really want to clean it up, we'd need a multi-step process.
  // For now, these documents only exist in the application logic.

  // 4. Remove legacy columns from drivers if any (e.g. vehicle_id was mentioned in some models)
  // Based on initial_schema, there were no direct vehicle columns in 'drivers', 
  // they were in 'vehicles' table with driver_id.
};

exports.down = (pgm) => {
  // Re-creating tables is complex without the full definitions, 
  // but this is a pivot so down migration might not be fully reversible 
  // without re-running initial schema parts.
};
