import { Router } from 'express';
import { TripVerificationController } from './trip-verification.controller';
// import { authenticate, authorize } from '../../shared/middlewares/auth'; // Hypothetical middlewares

const router = Router();

// Driver endpoints
router.post('/submit/:driverId', TripVerificationController.submitPhotos);
router.put('/reupload/:id', TripVerificationController.reuploadImages);
router.get('/status/:driverId', TripVerificationController.getLatestStatus);
router.get('/trip/:tripId', TripVerificationController.getByTripId);

// Admin endpoints
router.get('/pending', TripVerificationController.getPendingVerifications);
router.get('/details/:id', TripVerificationController.getVerificationDetails);
router.get('/comparison/:driverId', TripVerificationController.getComparisonData);
router.put('/verify/:id', TripVerificationController.verifyTrip);
router.put('/verify-granular/:id', TripVerificationController.verifyTripGranular);

// TEST ONLY
router.post('/test-verify/:driverId', TripVerificationController.testVerifyDriver);

export default router;
