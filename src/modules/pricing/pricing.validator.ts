import { Joi } from 'celebrate';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const PricingValidation = {
  // Trip fare quote: app sends distance (+ optional duration) + when + trip/driver type + zone
  quote: Joi.object().keys({
    distance_km: Joi.number().min(0).required().messages({
      'any.required': 'distance_km is required',
    }),
    duration_min: Joi.number().min(0).optional(), // estimated from distance if omitted
    ride_type: Joi.string()
      .valid('ONE_WAY', 'ROUND_TRIP', 'OUTSTATION', 'SCHEDULED')
      .default('ONE_WAY'),
    days: Joi.number().integer().min(1).default(1), // outstation: number of days
    driver_type: Joi.string().valid('normal', 'elite', 'premium').optional(),
    // When the trip happens — omit for "now"; ISO datetime for a scheduled trip
    scheduled_at: Joi.date().iso().optional(),
    // Zone (the app supplies these from the picked address)
    from_district: Joi.string().required().messages({
      'any.required': 'from_district is required',
    }),
    from_area: Joi.string().allow('', null).optional(),
    to_district: Joi.string().allow('', null).optional(),
    to_area: Joi.string().allow('', null).optional(),
    // Optional explicit overrides (app's local day/time); otherwise derived from scheduled_at/now
    day: Joi.string().valid(...DAYS).optional(),
    time: Joi.string()
      .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/)
      .optional(),
  }),
};
