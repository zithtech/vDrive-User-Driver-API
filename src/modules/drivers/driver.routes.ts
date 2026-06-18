import { Router } from 'express';
import { DriverController } from './driver.controller';
import {
  createDriverValidator,
  findNearbyDriversValidator,
  getDriverValidator,
  getDriversValidator,
  updateDriverValidator,
  availableDriversForAssignmentValidator,
} from './driver.validator';
import { isAuthenticatedOrService } from '../../shared/serviceAuthentication';

const router = Router();

// ✅ PUBLIC — NEW DRIVER SIGNUP
router.post('/', createDriverValidator, DriverController.addDriver);
router.post('/admin-verify/:id', DriverController.adminVerifyDriver);

// 🔒 PROTECTED — TOKEN REQUIRED
router.use(isAuthenticatedOrService);

router.get('/me', DriverController.getMe);
router.delete('/me', DriverController.deleteMyAccount);
router.post('/me/reset', DriverController.resetProfile);
router.get('/', getDriversValidator, DriverController.getDrivers);
router.get('/:id', getDriverValidator, DriverController.getDriver);
router.post('/:id/go-online', DriverController.goOnline);
router.post('/:id/go-offline', DriverController.goOffline);
router.put('/:id', updateDriverValidator, DriverController.updateDriver);
router.patch('/:id', updateDriverValidator, DriverController.updateDriver);
router.patch('/:id/fcm-token', DriverController.updateFcmToken);

// Stats & Activity
router.get('/activity/:id', DriverController.getRideActivity);
router.get('/performance/:id', DriverController.getPerformance);
router.get('/earnings/:id/summary', DriverController.getEarningsSummary);
router.get('/earnings/:id/transactions', DriverController.getEarningsTransactions);
router.get('/wallet/:id/balance', DriverController.getWalletBalance);
router.get('/wallet/:id/transactions', DriverController.getWalletTransactions);
router.get('/today-overview/:id', DriverController.getTodayOverview);
router.post('/search', findNearbyDriversValidator, DriverController.findNearbyDrivers);
router.post(
  '/available-for-assignment',
  availableDriversForAssignmentValidator,
  DriverController.getAvailableDriversForAssignment
);

export default router;
