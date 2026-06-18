import { Joi, celebrate, Segments } from 'celebrate';

export const createOrderValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    plan_id: Joi.number().required(),
    billing_cycle: Joi.string().valid('day', 'week', 'month').required(),
    promo_code: Joi.string().optional(),
    use_reward_balance: Joi.boolean().optional(),
  }),
});

export const verifyPaymentValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
  }),
});
