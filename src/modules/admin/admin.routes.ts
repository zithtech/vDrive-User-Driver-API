import { Router } from 'express';
import { AdminController } from './admin.controller';
// import { isAuthenticatedOrService } from '../../shared/serviceAuthentication';
// Assuming admin routes are protected. For now, I'll use standard protection or leave open for testing if requested,
// but plan says "Add approveDocument...". I'll add basic structure.
// Since no specific admin auth middleware is mentioned, I'll reuse isAuthenticatedOrService or similar if applicable,
// or just exposing them for now as per "Admin Simulation" in plan.

const router = Router();

// Retrieve pending drivers
router.get('/drivers/pending', AdminController.getPendingDrivers);

// Approve/Reject documents
router.patch('/documents/:documentId/approve', AdminController.approveDocument);
router.patch('/documents/:documentId/reject', AdminController.rejectDocument);

export default router;
