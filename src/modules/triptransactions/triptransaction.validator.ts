// tripTransaction.validator.ts
import Joi from 'joi';
import { ActorType, TripEventType, TransactionStatus } from '../../enums/triptransaction.enums';

export const TripTransactionValidation = {
  idValidation: Joi.object({
    id: Joi.string().uuid().required(),
  }),

  tripEventTypeValidation: Joi.object({
    id: Joi.string().uuid().required(),
    eventType: Joi.string()
      .valid(...Object.values(TripEventType))
      .required(),
  }),

  actorValidation: Joi.object({
    actorType: Joi.string()
      .valid(...Object.values(ActorType))
      .required(),
    actorId: Joi.string().uuid().required(),
  }),

  createTransactionValidation: Joi.object({
    trip_id: Joi.string().uuid().required(),
    event_type: Joi.string()
      .valid(...Object.values(TripEventType))
      .required(),
    actor_type: Joi.string()
      .valid(...Object.values(ActorType))
      .required(),
    status: Joi.string()
      .valid(...Object.values(TransactionStatus))
      .default(TransactionStatus.Success),
    actor_id: Joi.string().uuid().allow(null).optional(),
    actor_name: Joi.string().allow(null).optional(),
    previousSnapshot: Joi.object().allow(null).optional(),
    currentSnapshot: Joi.object().required(),
    notes: Joi.string().allow(null).optional(),
    metadata: Joi.object().allow(null).optional(),
    failure_reason: Joi.string().allow(null).optional(),
    parent_transaction_id: Joi.string().uuid().allow(null).optional(),
    event_at: Joi.date().iso().allow(null).optional(),
  }),
};
