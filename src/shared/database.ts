import { Pool } from 'pg';
import { logger } from './logger';

let pool: Pool;

export const connectDatabase = async () => {
  logger.info(`${process.env.DB_HOST} process.env.DB_HOST`);
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'mydb',
      max: 10, // max connections
      idleTimeoutMillis: 30000, // close idle clients after 30s
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      ...(process.env.PGCHANNELBINDING === 'require' && { application_name: 'myapp' }),
    });
  }

  try {
    await pool.query('SELECT NOW()'); // test connection
    logger.info('✅ Connected to PostgreSQL');
  } catch (error) {
    logger.error('❌ PostgreSQL connection error:', error);
    throw error;
  }

  return pool;
};

// Export a helper to run queries
export const query = async (text: string, params?: any[]) => {
  if (!pool) {
    throw new Error('Database not connected. Call connectDatabase first.');
  }
  return pool.query(text, params);
};


export const getClient = async () => {
  if (!pool) {
    throw new Error('Database not connected. Call connectDatabase first.');
  }
  return pool.connect();
};