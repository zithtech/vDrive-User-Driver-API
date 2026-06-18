import { connectDatabase } from '../shared/database';
import { SosService } from '../modules/sos/sos.service';
import 'dotenv/config';
import http from 'http';
import { initSocket } from '../shared/socket';
import { logger } from '../shared/logger';

// Use a valid driver from the database
const DRIVER_ID = '35300323-3d48-425c-8d9f-b73b3b1e509f';

async function testSosFlow() {
  logger.info('Starting SOS Flow Test...');

  // 1. Setup environment
  const pool = await connectDatabase();
  const server = http.createServer();
  initSocket(server); // Initialize socket to avoid null pointer in SosService

  try {
    // 2. Trigger SOS
    logger.info(`1. Triggering SOS for Driver: ${DRIVER_ID}`);
    const sosEvent = await SosService.triggerSos(DRIVER_ID, 'driver');
    logger.info('Triggered SOS Event ID: ' + sosEvent.id);
    logger.info('Enriched Driver Info: ' + JSON.stringify((sosEvent as any).driver || 'None'));
    logger.info('Enriched Trip Info: ' + JSON.stringify((sosEvent as any).trip || 'None'));

    if (!sosEvent || !sosEvent.id) {
      throw new Error('Failed to create SOS event');
    }

    // 3. Update Location
    logger.info(`\n2. Updating location for SOS ID: ${sosEvent.id}`);
    await SosService.updateLocation(sosEvent.id, 13.0827, 80.2707);
    logger.info('Location updated successfully.');

    // 4. Resolve SOS
    logger.info(`\n3. Resolving SOS ID: ${sosEvent.id}`);
    await SosService.resolveSos(sosEvent.id);
    logger.info('SOS resolved successfully.');

    logger.info('\n✅ SOS Flow Test completed successfully!');
  } catch (err) {
    logger.error('❌ SOS Flow Test failed:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testSosFlow();
