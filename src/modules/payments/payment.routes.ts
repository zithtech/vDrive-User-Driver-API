import { Router } from 'express';
import { PaymentController } from '../payments/payment.controller';
import { SubscriptionController } from '../subscriptions/subscription.controller';
import {
  createOrderValidator,
  verifyPaymentValidator,
} from '../subscriptions/subscription.validator';

const router = Router();

// Alias subscription routes under /payment for frontend compatibility
router.post('/create-order', createOrderValidator, SubscriptionController.createOrder);
router.post('/verify-payment', verifyPaymentValidator, SubscriptionController.verifyPayment);
router.get('/my-subscription', SubscriptionController.getMySubscription);

// General payment routes (if amount is passed directly)
router.post('/generic-order', PaymentController.createOrder);

//user
router.post('/create-ride-order', PaymentController.createRideOrder);
router.post('/verify-ride-payment', PaymentController.verifyPayment);

export default router;
