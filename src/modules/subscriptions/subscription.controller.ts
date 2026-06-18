import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { successResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';

export const SubscriptionController = {
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
};
