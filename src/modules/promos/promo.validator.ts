import { Joi, celebrate, Segments } from 'celebrate';

export const validatePromoValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    code: Joi.string().required(),
    amount: Joi.number().required(),
  }),
});

export const createPromoValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    code: Joi.string().required(),
    description: Joi.string().allow('', null),
    discount_type: Joi.string().valid('percentage', 'fixed').required(),
    discount_value: Joi.number().required(),
    target_type: Joi.string().valid('global', 'specific_driver', 'ride_count_based').required(),
    target_driver_id: Joi.string().uuid().allow(null),
    min_rides_required: Joi.number().integer().min(0).default(0),
    max_uses: Joi.number().integer().min(1).allow(null),
    max_uses_per_driver: Joi.number().integer().min(1).default(1),
    start_date: Joi.date().allow(null),
    expiry_date: Joi.date().allow(null),
    is_active: Joi.boolean().default(true),
  }),
});

export const updatePromoValidator = celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    id: Joi.number().required(),
  }),
  [Segments.BODY]: Joi.object().keys({
    code: Joi.string(),
    description: Joi.string().allow('', null),
    discount_type: Joi.string().valid('percentage', 'fixed'),
    discount_value: Joi.number(),
    target_type: Joi.string().valid('global', 'specific_driver', 'ride_count_based'),
    target_driver_id: Joi.string().uuid().allow(null),
    min_rides_required: Joi.number().integer().min(0),
    max_uses: Joi.number().integer().min(1).allow(null),
    max_uses_per_driver: Joi.number().integer().min(1),
    start_date: Joi.date().allow(null),
    expiry_date: Joi.date().allow(null),
    is_active: Joi.boolean(),
  }),
});
