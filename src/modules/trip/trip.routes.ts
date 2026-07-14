import { Router } from 'express';
import { TripController } from './trip.controllers';
import { validateBody, validateParams } from '../../utilities/helper';
import { TripValidation } from './trip.validator';
import { authMiddleware } from '../auth/auth.middleware';

const router = Router();

// Admin & Active unified route
router.get('/', TripController.getAllTripsWithChanges);
router.get('/active', authMiddleware, TripController.getActiveTrip);

//user-driver
router.get(
  '/bytripid/:id',
  validateParams(TripValidation.idValidation),
  TripController.getTripById
);
router.get('/all', authMiddleware, TripController.getTrips);
router.post(
  '/:id/skip',
  authMiddleware,
  validateParams(TripValidation.idValidation),
  TripController.skipTrip
);
router.get(
  '/activetrip/:id',
  validateParams(TripValidation.idValidation),
  TripController.getActiveTripByUserId
);

//Trip
router.post(
  '/create',
  validateBody(TripValidation.createTripValidation),
  TripController.createTrip
);

router.post('/:id', validateParams(TripValidation.idValidation), TripController.getTripByUserId);
router.patch(
  '/update/:id',
  validateParams(TripValidation.idValidation),
  validateBody(TripValidation.updateTripValidation),
  TripController.updateTrip
);
router.post(
  '/cancel/:id',
  validateParams(TripValidation.idValidation),
  validateBody(TripValidation.cancelTripValidation),
  TripController.cancelTrip
);

//Tripchanges
router.post(
  '/change/create',
  validateBody(TripValidation.createTripChangesValidation),
  TripController.createTripChanges
);

router.post(
  '/status/:id',
  validateParams(TripValidation.idValidation),
  validateBody(TripValidation.updateTripStatusValidation),
  TripController.updateTripStatusController
);

router.post(
  '/:id/assign',
  validateParams(TripValidation.idValidation),
  TripController.assignToDriver
);

router.post(
  '/:id/trigger',
  validateParams(TripValidation.idValidation),
  TripController.triggerBroadcast
);

router.post('/:id/accept', validateParams(TripValidation.idValidation), TripController.acceptTrip);
router.post('/:id/start', validateParams(TripValidation.idValidation), TripController.startTrip);
router.post(
  '/:id/arriving',
  validateParams(TripValidation.idValidation),
  TripController.arrivingTrip
);
router.post(
  '/:id/arrived',
  validateParams(TripValidation.idValidation),
  TripController.arrivedTrip
);
router.post(
  '/:id/destination-reached',
  validateParams(TripValidation.idValidation),
  TripController.destinationReachedTrip
);
router.post(
  '/:id/start-return',
  validateParams(TripValidation.idValidation),
  TripController.startReturnTrip
);
router.post(
  '/:id/return-reached',
  validateParams(TripValidation.idValidation),
  TripController.returnReachedTrip
);
router.post(
  '/:id/complete',
  validateParams(TripValidation.idValidation),
  TripController.completeTrip
);

// Location History (trip replay)
router.get(
  '/:id/location-history',
  validateParams(TripValidation.idValidation),
  TripController.getTripLocationHistory
);

// Test Simulation
router.post('/test-simulate-scheduled', TripController.testSimulateScheduled);
router.post('/test-simulate-live', TripController.testSimulateLive);

export default router;
