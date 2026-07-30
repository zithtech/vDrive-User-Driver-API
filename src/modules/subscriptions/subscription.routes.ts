import { Router } from 'express';
import { SubscriptionController } from './subscription.controller';
import {
  createOrderValidator,
  verifyPaymentValidator,
  createAutoSubscriptionValidator,
  verifySubscriptionPaymentValidator,
  previewPlanChangeValidator,
  toggleAutoRenewValidator,
} from './subscription.validator';

const router = Router();

// ─── Existing: One-Time Payment Routes ───────────────────────────────
router.post('/create-order', createOrderValidator, SubscriptionController.createOrder);
router.post('/verify-payment', verifyPaymentValidator, SubscriptionController.verifyPayment);

// ─── New: Auto-Subscription Routes ──────────────────────────────────
router.post('/auto-subscribe', createAutoSubscriptionValidator, SubscriptionController.createAutoSubscription);
router.post('/verify-subscription', verifySubscriptionPaymentValidator, SubscriptionController.verifySubscriptionPayment);

// ─── New: Plan Change Preview (Proration) ───────────────────────────
router.get('/preview-plan-change', previewPlanChangeValidator, SubscriptionController.previewPlanChange);

// ─── New: Toggle Auto-Renew ─────────────────────────────────────────
router.patch('/auto-renew', toggleAutoRenewValidator, SubscriptionController.toggleAutoRenew);

// ─── Existing: Queries ──────────────────────────────────────────────
router.get('/my-subscription', SubscriptionController.getMySubscription);
router.get('/all-active', SubscriptionController.getAllActiveSubscriptions);
router.get('/', SubscriptionController.getAllPlans);

export default router;
