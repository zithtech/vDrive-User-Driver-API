import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { connectDatabase, query } from './src/shared/database';

async function fixSchema() {
  try {
    console.log('Connecting to database...');
    await connectDatabase();
    
    console.log('Adding last_broadcast_at column to trips table...');
    await query(`
      ALTER TABLE trips 
      ADD COLUMN IF NOT EXISTS last_broadcast_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
    `);
    console.log('Successfully added last_broadcast_at column.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to update schema:', err);
    process.exit(1);
  }
}

fixSchema();
