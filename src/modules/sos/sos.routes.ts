import { Router } from 'express';
import { SosController } from './sos.controller';
import { isAuthenticatedOrService } from '../../shared/serviceAuthentication';

const router = Router();

// Allow either driver authentication or Admin Backend service authentication
router.use(isAuthenticatedOrService);

router.use((req, res, next) => { require('fs').appendFileSync('/tmp/vdrive-sos-path.log', 'sosRoutes hit! path: ' + req.path + ' method: ' + req.method + '\n'); next(); });
// SOS triggering and tracking
router.get('/active', SosController.getActiveSos);
router.get('/history', SosController.getSosHistory);
router.post('/trigger', SosController.triggerSos);
router.post('/location', SosController.updateLocation);
router.post('/resolve', SosController.resolveSos);

// Trusted Contacts management
router.get('/contacts', SosController.getTrustedContacts);
router.post('/contacts', SosController.addTrustedContact);
router.delete('/contacts/:id', SosController.removeTrustedContact);

export default router;
