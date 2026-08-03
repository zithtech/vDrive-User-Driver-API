import { Joi, celebrate, Segments } from 'celebrate';

// Existing: One-time payment order
export const createOrderValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    plan_id: Joi.number().required(),
    billing_cycle: Joi.string().valid('day', 'week', 'month').required(),
    promo_code: Joi.string().optional(),
    use_reward_balance: Joi.boolean().optional(),
    pin: Joi.string().optional(),
  }),
});

// Existing: One-time payment verification
export const verifyPaymentValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
  }),
});

// New: Auto-subscription creation
export const createAutoSubscriptionValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    plan_id: Joi.number().required(),
    billing_cycle: Joi.string().valid('day', 'week', 'month').required(),
    auto_renew: Joi.boolean().optional().default(true),
  }),
});

// New: Subscription payment verification
export const verifySubscriptionPaymentValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    razorpay_subscription_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
  }),
});

// New: Preview plan change
export const previewPlanChangeValidator = celebrate({
  [Segments.QUERY]: Joi.object().keys({
    plan_id: Joi.number().required(),
    billing_cycle: Joi.string().valid('day', 'week', 'month').required(),
  }),
});

// New: Toggle auto-renew
export const toggleAutoRenewValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    auto_renew: Joi.boolean().required(),
  }),
});
