import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import config from '../../config';
import { logger } from '../../shared/logger';
import { successResponse } from '../../shared/errorHandler';

export const PricingController = {
  async calculateAllTypes(req: Request, res: Response, next: NextFunction) {
    try {
      const adminBackendUrl = config.adminApiUrl;
      const endpoint = `${adminBackendUrl}/api/pricing/calculate-all-types`;

      logger.info(`Forwarding pricing calculation to: ${endpoint}`);

      const response = await axios.post(endpoint, req.body, {
        headers: {
          'Content-Type': 'application/json',
          // Forward authorization header if it exists
          ...(req.headers.authorization && { authorization: req.headers.authorization }),
          // Add internal secret if needed for service-to-service auth
          'x-internal-service-key': config.internalServiceApiKey,
        },
      });

      return successResponse(
        res,
        response.status,
        'Pricing calculated successfully',
        (response.data as any).data || response.data
      );
    } catch (err: any) {
      logger.error(`calculateAllTypes error: ${err.message}`);
      if (err.response) {
        return res.status(err.response.status).json(err.response.data);
      }
      next(err);
    }
  },
};
