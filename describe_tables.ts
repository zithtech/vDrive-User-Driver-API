import { query, connectDatabase } from './src/shared/database';
import "dotenv/config";

async function describeTables() {
  const pool = await connectDatabase();
  try {
    const res = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('drivers', 'trips');
    `);
    console.log(res.rows);
  } catch(err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
describeTables();
