import { Request, Response, NextFunction } from 'express';
import { PromoService } from './promo.service';
import { successResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';

export const PromoController = {
  /**
   * Validate a promo code for a driver
   */
  async validatePromo(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const { code, amount } = req.body;

      if (!code || amount === undefined) {
        return res.status(400).json({ success: false, message: 'Code and amount are required' });
      }

      const result = await PromoService.validatePromo(code, driverId, Number(amount));
      return successResponse(res, 200, result.message || 'Validation complete', result);
    } catch (error: any) {
      logger.error(`Error in validatePromo: ${error.message}`);
      next(error);
    }
  },

  /**
   * List available promos for the logged-in driver
   */
  async listAvailablePromos(req: any, res: Response, next: NextFunction) {
    try {
      const driverId = req.user.id;
      const promos = await PromoService.getAvailablePromosForDriver(driverId);
      return successResponse(res, 200, 'Available promos fetched successfully', promos);
    } catch (error: any) {
      next(error);
    }
  },

  /**
   * Admin: List all promos
   */
  async getAllPromos(req: Request, res: Response, next: NextFunction) {
    try {
      const promos = await PromoService.getAllPromos();
      return successResponse(res, 200, 'All promos fetched successfully', promos);
    } catch (error: any) {
      next(error);
    }
  },

  /**
   * Admin: Create a new promo
   */
  async createPromo(req: Request, res: Response, next: NextFunction) {
    try {
      const promo = await PromoService.createPromo(req.body);
      return successResponse(res, 201, 'Promo created successfully', promo);
    } catch (error: any) {
      next(error);
    }
  },

  /**
   * Admin: Update a promo
   */
  async updatePromo(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const promo = await PromoService.updatePromo(Number(id), req.body);
      return successResponse(res, 200, 'Promo updated successfully', promo);
    } catch (error: any) {
      next(error);
    }
  },

  /**
   * Admin: Delete a promo
   */
  async deletePromo(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await PromoService.deletePromo(Number(id));
      return successResponse(res, 200, 'Promo deleted successfully', null);
    } catch (error: any) {
      next(error);
    }
  },
};
