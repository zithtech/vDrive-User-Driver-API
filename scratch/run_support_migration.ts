import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const client = new Client({
    connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=require`,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const sqlPath = path.join(__dirname, 'src/database/migrations/create_support_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL...');
    await client.query(sql);
    console.log('✅ Support tables created successfully');

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await client.end();
  }
}

runMigration();
