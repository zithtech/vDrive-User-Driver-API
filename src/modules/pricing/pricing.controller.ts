import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import config from '../../config';
import { logger } from '../../shared/logger';
import { successResponse } from '../../shared/errorHandler';
import { PricingValidation } from './pricing.validator';

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

// Call the admin backend's fare calculator with service-to-service auth
async function callAdminCalculator(body: unknown, authHeader?: string) {
  const endpoint = `${config.adminApiUrl}/api/pricing/calculate-all-types`;
  logger.info(`Forwarding pricing calculation to: ${endpoint}`);
  const response = await axios.post(endpoint, body, {
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader && { authorization: authHeader }),
      'x-internal-service-key': config.internalServiceApiKey,
    },
  });
  return (response.data as any)?.data ?? response.data;
}

export const PricingController = {
  // Raw passthrough — caller already shaped the calculator payload
  async calculateAllTypes(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await callAdminCalculator(req.body, req.headers.authorization);
      return successResponse(res, 200, 'Pricing calculated successfully', data);
    } catch (err: any) {
      logger.error(`calculateAllTypes error: ${err.message}`);
      if (err.response) {
        return res.status(err.response.status).json(err.response.data);
      }
      next(err);
    }
  },

  /**
   * Trip fare quote for the mobile/client app.
   * Accepts start/end zone, distance (+optional duration), trip + driver type and
   * now/scheduled timing, then asks the admin calculator for fares.
   */
  async quote(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = PricingValidation.quote.validate(req.body);
      if (error) {
        return res.status(422).json({
          error: 'Validation Error',
          message: error.details[0].message,
        });
      }

      // Reference time: scheduled_at if given, else now
      const when: Date = value.scheduled_at ? new Date(value.scheduled_at) : new Date();
      const day: string = value.day || DAY_NAMES[when.getDay()];
      const time: string =
        value.time ||
        `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;

      // Round trip never adds a return charge; everything else is treated as one-way
      const trip_type = value.ride_type === 'ROUND_TRIP' ? 'round_trip' : 'one_way';
      const is_outstation = value.ride_type === 'OUTSTATION';
      const days = value.days && value.days > 0 ? value.days : 1;

      // Estimate duration from distance if the app didn't send it
      const duration_min =
        value.duration_min != null
          ? value.duration_min
          : Math.round((value.distance_km * 1000) / (config.avgSpeedMetersPerMin || 500));

      const calcPayload = {
        distance_km: value.distance_km,
        duration_min,
        day,
        time,
        trip_type,
        is_outstation,
        days,
        ...(value.driver_type && { driver_type: value.driver_type }),
        from_district: value.from_district,
        from_area: value.from_area || null,
        to_district: value.to_district || null,
        to_area: value.to_area || null,
      };

      const data = await callAdminCalculator(calcPayload, req.headers.authorization);

      return successResponse(res, 200, 'Fare quote generated successfully', {
        request: {
          ride_type: value.ride_type,
          trip_type,
          is_outstation,
          days,
          scheduled_at: value.scheduled_at || null,
          day,
          time,
          distance_km: value.distance_km,
          duration_min,
        },
        ...data,
      });
    } catch (err: any) {
      logger.error(`quote error: ${err.message}`);
      if (err.response) {
        return res.status(err.response.status).json(err.response.data);
      }
      next(err);
    }
  },
};
