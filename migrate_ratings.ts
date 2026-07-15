import { query, connectDatabase } from './src/shared/database';
import "dotenv/config";

async function runMigration() {
  const pool = await connectDatabase();
  try {
    console.log('Adding new columns...');
    await query(`
      ALTER TABLE trips 
      ADD COLUMN IF NOT EXISTS user_rating NUMERIC,
      ADD COLUMN IF NOT EXISTS driver_rating NUMERIC,
      ADD COLUMN IF NOT EXISTS user_feedback TEXT,
      ADD COLUMN IF NOT EXISTS driver_feedback TEXT;
    `);

    console.log('Migrating ratings...');
    await query(`
      UPDATE trips SET user_rating = rating WHERE rating IS NOT NULL AND user_rating IS NULL;
    `);
    
    await query(`
      UPDATE trips SET user_feedback = feedback WHERE feedback IS NOT NULL AND user_feedback IS NULL;
    `);

    console.log('Dropping columns rating, feedback from trips...');
    await query(`
      ALTER TABLE trips DROP COLUMN IF EXISTS rating;
    `);
    
    await query(`
      ALTER TABLE trips DROP COLUMN IF EXISTS feedback;
    `);
    
    console.log('Migration complete.');
  } catch(err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
