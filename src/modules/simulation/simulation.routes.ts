import { Router } from 'express';
import { simulationController } from './simulation.controller';

const router = Router();

router.post('/update-location', simulationController.updateLocation);

// Note: You can add a route here to start the full backend interval simulation
router.post('/start', simulationController.startIntervalSimulation);

export default router;
