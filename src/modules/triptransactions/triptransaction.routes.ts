import { Router } from 'express';
import { TripTransactionController } from './triptransaction.controller';
import { validateBody, validateParams } from '../../utilities/helper';
import { TripTransactionValidation } from './triptransaction.validator';

const router = Router();

// Trip-scoped
router.get(
  '/bytripid/:id',
  validateParams(TripTransactionValidation.idValidation),
  TripTransactionController.getTripHistory
);
router.get(
  '/bytripid/:id/event-type/:eventType',
  validateParams(TripTransactionValidation.tripEventTypeValidation),
  TripTransactionController.getEventsByType
);
router.get(
  '/transaction/:id',
  validateParams(TripTransactionValidation.idValidation),
  TripTransactionController.getTransactionById
);

// Actor-scoped
router.get(
  '/actor/:actorType/:actorId',
  validateParams(TripTransactionValidation.actorValidation),
  TripTransactionController.getActivityByActor
);

// Create
router.post(
  '/create',
  validateBody(TripTransactionValidation.createTransactionValidation),
  TripTransactionController.logEvent
);

export default router;
