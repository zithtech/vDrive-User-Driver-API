import { Router } from 'express';
import userRoutes from '../modules/users/user.routes';
import driverRoutes from '../modules/drivers/driver.routes';
import authRoutes from '../modules/auth/auth.routes';
import s3Routes from '../modules/s3/s3.routes';
import { isAuthenticatedOrService } from '../shared/serviceAuthentication';
import emailRoutes from '../modules/email/email.routes';
import isAuthenticated from '../shared/authentication';
import tripRoutes from '../modules/trip/trip.routes';
import paymentRoutes from '../modules/payments/payment.routes';
import simulationRoutes from '../modules/simulation/simulation.routes';
import tripTransactionRoutes from '../modules/triptransactions/triptransaction.routes';
import pricingRoutes from '../modules/pricing/pricing.routes';
import subscriptionRoutes from '../modules/subscriptions/subscription.routes';
import driverDocumentsRoutes from '../modules/drivers/driver-documents.routes';
import tripVerificationRoutes from '../modules/drivers/trip-verification.routes';
import adminRoutes from '../modules/admin/admin.routes';
import promoRoutes from '../modules/promos/promo.routes';
import notificationRoutes from '../modules/notifications/notification.routes';
import notificationManagementRoutes from '../modules/notification-management/notification-management.routes';
import sosRoutes from '../modules/sos/sos.routes';
import referralRoutes from '../modules/referrals/referral.routes';
import couponRoutes from '../modules/coupon-management/coupon.routes';
import driverReferralRoutes from '../modules/driver-referrals/driver-referral.routes';
import supportRoutes from '../modules/support/support.routes';
import { logger } from '../shared/logger';

const router = Router();

router.get('/health-check', (req, res) => {
  logger.info('Health check called');
  res.status(200).json({ status: 'OK', message: 'Server is healthy' });
});

router.get('/media/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send('URL is required');

    if (url.includes('s3.eu-north-1.amazonaws.com')) {
      let key = url.split('.amazonaws.com/')[1];
      if (!key) return res.status(400).send('Invalid S3 URL');

      // Strip any query parameters
      key = key.split('?')[0];

      const { s3Service } = require('../modules/s3/s3.service');
      const signedUrl = await s3Service.getReadUrl(decodeURIComponent(key));

      // Allow cross-origin loading for images to prevent browser blocking (CORP/CORS)
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      return res.redirect(signedUrl);
    }

    return res.status(400).send('Only S3 URLs are supported for proxying currently');
  } catch (error) {
    logger.error('Media proxy error:', error);
    res.status(500).send('Error proxying media');
  }
});

// ✅ PUBLIC ROUTES
router.use('/auth', authRoutes);
router.use('/referrals', referralRoutes);
router.use('/drivers/referral', driverReferralRoutes);
router.use(isAuthenticatedOrService);
router.use('/invoices', emailRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/admin', adminRoutes);
router.use('/promos', promoRoutes);
router.use('/notifications', notificationRoutes);
router.use('/notification-management', notificationManagementRoutes);
router.use('/sos', sosRoutes);
router.use('/support', supportRoutes);

router.use(isAuthenticated);
router.use('/trips', tripRoutes);
router.use('/users', userRoutes);
router.use('/drivers', driverRoutes);
router.use('/generate-presigned-url', s3Routes);
router.use('/payment', paymentRoutes);
router.use('/simulation', simulationRoutes);
router.use('/triptransactions', tripTransactionRoutes);
router.use('/pricing', pricingRoutes);
router.use('/drivers/documents', driverDocumentsRoutes);
router.use('/drivers/trip-verification', tripVerificationRoutes);
router.use('/s3', s3Routes);
router.use('/coupons', couponRoutes);

export default router;
