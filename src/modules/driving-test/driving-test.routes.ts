import { Router } from 'express';
import { DrivingTestController } from './driving-test.controller';

const router = Router();

/* ── Driver App Endpoints (/api/driving-test) ── */
router.get('/eligibility/:driverId', DrivingTestController.checkEligibility);
router.get('/routes/assigned/:driverId', DrivingTestController.getAssignedRoute);
router.post('/start', DrivingTestController.startSession);
router.post('/recordings/upload-url', DrivingTestController.getChunkUploadUrl);
router.post('/recordings/segment', DrivingTestController.registerRecordingSegment);
router.post('/telemetry', DrivingTestController.receiveTelemetryBatch);
router.post('/checkpoint', DrivingTestController.logCheckpointArrival);
router.post('/complete', DrivingTestController.completeSession);
router.get('/result/:sessionId', DrivingTestController.getSessionResult);
router.get('/onboarding-status/:driverId', DrivingTestController.getUnifiedOnboardingStatus);

/* ── Admin Dashboard Endpoints (/api/driving-test/admin or /api/admin/driving-tests) ── */
router.get('/sessions', DrivingTestController.adminListSessions);
router.get('/sessions/:id/report', DrivingTestController.adminGetSessionReport);
router.post('/sessions/:id/decision', DrivingTestController.adminSubmitDecision);

router.get('/admin/sessions', DrivingTestController.adminListSessions);
router.get('/admin/sessions/:id/report', DrivingTestController.adminGetSessionReport);
router.post('/admin/sessions/:id/decision', DrivingTestController.adminSubmitDecision);

export default router;
