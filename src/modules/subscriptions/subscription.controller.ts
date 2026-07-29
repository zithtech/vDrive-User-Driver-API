import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { successResponse, errorResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';

export const SubscriptionController = {
  // ─── Existing: One-Time Payment Flow ─────────────────────────────────
  async createOrder(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const order = await SubscriptionService.createOrder(driverId, req.body);
      return successResponse(res, 201, 'Order created successfully', order);
    } catch (error: any) {
      logger.error(`Error in createOrder: ${error.message}`);
      next(error);
    }
  },

  async verifyPayment(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const result = await SubscriptionService.verifyPayment(driverId, req.body);
      return successResponse(res, 200, 'Payment verified and subscription activated', result);
    } catch (error: any) {
      next(error);
    }
  },

  // ─── New: Auto-Subscription (Razorpay Subscriptions API) ────────────
  async createAutoSubscription(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const result = await SubscriptionService.createAutoSubscription(driverId, req.body);
      return successResponse(res, 201, 'Auto-subscription created successfully', result);
    } catch (error: any) {
      logger.error(`Error in createAutoSubscription: ${error.message}`);
      next(error);
    }
  },

  async verifySubscriptionPayment(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const result = await SubscriptionService.verifySubscriptionPayment(driverId, req.body);
      return successResponse(res, 200, 'Subscription payment verified and activated', result);
    } catch (error: any) {
      logger.error(`Error in verifySubscriptionPayment: ${error.message}`);
      next(error);
    }
  },

  // ─── New: Preview Plan Change (Proration Math) ──────────────────────
  async previewPlanChange(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const { plan_id, billing_cycle } = req.query;
      const preview = await SubscriptionService.previewPlanChange(
        driverId,
        Number(plan_id),
        billing_cycle as string
      );
      return successResponse(res, 200, 'Plan change preview generated', preview);
    } catch (error: any) {
      logger.error(`Error in previewPlanChange: ${error.message}`);
      next(error);
    }
  },

  // ─── New: Toggle Auto-Renew ─────────────────────────────────────────
  async toggleAutoRenew(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const { auto_renew } = req.body;
      const result = await SubscriptionService.toggleAutoRenew(driverId, auto_renew);
      return successResponse(res, 200, `Auto-renew ${auto_renew ? 'enabled' : 'disabled'} successfully`, result);
    } catch (error: any) {
      logger.error(`Error in toggleAutoRenew: ${error.message}`);
      next(error);
    }
  },

  // ─── Existing: Queries ──────────────────────────────────────────────
  async getMySubscription(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const subscription = await SubscriptionService.getMySubscription(driverId);
      return successResponse(res, 200, 'My subscription fetched successfully', subscription);
    } catch (error: any) {
      next(error);
    }
  },

  async getAllPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await SubscriptionRepository.getAllPlans();
      return successResponse(res, 200, 'Plans fetched successfully', plans);
    } catch (error: any) {
      next(error);
    }
  },

  async getAllActiveSubscriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const subscriptions = await SubscriptionService.getAllActiveSubscriptions();
      return successResponse(
        res,
        200,
        'All active subscriptions fetched successfully',
        subscriptions
      );
    } catch (error: any) {
      next(error);
    }
  },

  // ─── New: Razorpay Webhook (Public, No Auth) ────────────────────────
  async handleRazorpayWebhook(req: Request, res: Response) {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      // Verify webhook signature if secret is configured
      if (webhookSecret) {
        const receivedSignature = req.headers['x-razorpay-signature'] as string;
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(JSON.stringify(req.body))
          .digest('hex');

        if (receivedSignature !== expectedSignature) {
          logger.warn('Razorpay webhook signature verification failed');
          return res.status(400).json({ error: 'Invalid signature' });
        }
      }

      const { event, payload } = req.body;
      const eventId = req.headers['x-razorpay-event-id'] as string || `evt_${Date.now()}`;

      logger.info(`Received Razorpay webhook: ${event} (${eventId})`);

      const result = await SubscriptionService.handleWebhook(eventId, event, payload);

      // Always return 200 to Razorpay to prevent retries
      return res.status(200).json(result);
    } catch (error: any) {
      logger.error(`Razorpay webhook processing error: ${error.message}`);
      // Still return 200 to prevent Razorpay from retrying (we've logged the error)
      return res.status(200).json({ success: false, error: error.message });
    }
  },
};
