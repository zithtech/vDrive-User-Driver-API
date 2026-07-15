import { Joi } from 'celebrate';
import {
  RideType,
  ServiceType,
  BookingType,
  TripStatus,
  PaymentStatus,
  CancelReason,
  CancelBy,
  ChangeType,
  ChangeBy,
  VehicleType,
  TransmissionType,
} from '../../enums/trip.enums';
import { enumString } from '../../utilities/helper';

export const tripIdRule = Joi.string().guid({ version: 'uuidv4' }).optional().messages({
  'string.guid': 'trip_id must be a valid UUID v4',
  'string.base': 'trip_id must be a string',
});

export const userIdRule = Joi.string().guid({ version: 'uuidv4' }).required().messages({
  'string.guid': 'user_id must be a valid UUID v4',
  'any.required': 'user_id is required',
  'string.base': 'user_id must be a string',
});

export const driverIdRule = Joi.string()
  .guid({ version: 'uuidv4' })
  .allow(null)
  .optional()
  .messages({
    'string.guid': 'driver_id must be a valid UUID v4',
    'string.base': 'driver_id must be a string',
  });

export const vehicleIdRule = Joi.string()
  .guid({ version: 'uuidv4' })
  .allow(null)
  .optional()
  .messages({
    'string.guid': 'vehicle_id must be a valid UUID v4',
    'string.base': 'vehicle_id must be a string',
  });

export const reRouteIdRule = Joi.string().guid({ version: 'uuidv4' }).optional().messages({
  'string.guid': 're_route_id must be a valid UUID v4',
  'string.base': 're_route_id must be a string',
});

export const rideTypeRule = enumString(Object.values(RideType))
  .required()
  .messages({
    'any.only': `ride_type must be one of [${Object.values(RideType).join(', ')}]`,
    'any.required': 'ride_type is required',
    'string.base': 'ride_type must be a string',
  });

export const serviceTypeRule = enumString(Object.values(ServiceType))
  .required()
  .messages({
    'any.only': `service_type must be one of [${Object.values(ServiceType).join(', ')}]`,
    'any.required': 'service_type is required',
    'string.base': 'service_type must be a string',
  });

export const bookingTypeRule = enumString(Object.values(BookingType))
  .required()
  .messages({
    'any.only': `booking_type must be one of [${Object.values(BookingType).join(', ')}]`,
    'any.required': 'booking_type is required',
    'string.base': 'booking_type must be a string',
  });
export const tripStatusRule = enumString(Object.values(TripStatus))
  .required()
  .messages({
    'any.only': `trip_status must be one of [${Object.values(TripStatus).join(', ')}]`,
    'any.required': 'trip_status is required',
    'string.base': 'trip_status must be a string',
  });

export const paymentStatusRule = enumString(Object.values(PaymentStatus))
  .optional()
  .messages({
    'any.only': `payment_status must be one of [${Object.values(PaymentStatus).join(', ')}]`,
    'string.base': 'payment_status must be a string',
  });

export const cancelReasonRule = enumString([
  ...Object.values(CancelReason),
  'reason_vehicle_breakdown',
  'reason_heavy_traffic',
  'reason_customer_not_reachable',
  'reason_other',
])
  .optional()
  .messages({
    'any.only': `cancel_reason must be one of [${Object.values(CancelReason).join(', ')}] or common frontend reason strings`,
    'string.base': 'cancel_reason must be a string',
  });

export const cancelByRule = enumString(Object.values(CancelBy))
  .optional()
  .messages({
    'any.only': `cancel_by must be one of [${Object.values(CancelBy).join(', ')}]`,
    'string.base': 'cancel_by must be a string',
  });

export const originalScheduledStartTimeRule = Joi.date().required().messages({
  'date.base': 'original_scheduled_start_time must be a valid date',
  'any.required': 'original_scheduled_start_time is required',
});

export const scheduledStartTimeRule = Joi.date().optional().messages({
  'date.base': 'scheduled_start_time must be a valid date',
});

export const actualPickupTimeRule = Joi.date().optional().messages({
  'date.base': 'actual_pickup_time must be a valid date',
});

export const actualDropTimeRule = Joi.date().optional().messages({
  'date.base': 'actual_drop_time must be a valid date',
});

export const pickupLatRule = Joi.number().min(-90).max(90).required().messages({
  'number.base': 'pickup_lat must be a number',
  'number.min': 'pickup_lat cannot be less than -90',
  'number.max': 'pickup_lat cannot be greater than 90',
  'any.required': 'pickup_lat is required',
});

export const pickupLngRule = Joi.number().min(-180).max(180).required().messages({
  'number.base': 'pickup_lng must be a number',
  'number.min': 'pickup_lng cannot be less than -180',
  'number.max': 'pickup_lng cannot be greater than 180',
  'any.required': 'pickup_lng is required',
});

export const pickupAddressRule = Joi.string().trim().required().messages({
  'string.base': 'pickup_address must be a string',
  'string.empty': 'pickup_address cannot be empty',
  'any.required': 'pickup_address is required',
});

export const dropLatRule = Joi.number().min(-90).max(90).required().messages({
  'number.base': 'drop_lat must be a number',
  'number.min': 'drop_lat cannot be less than -90',
  'number.max': 'drop_lat cannot be greater than 90',
  'any.required': 'drop_lat is required',
});

export const dropLngRule = Joi.number().min(-180).max(180).required().messages({
  'number.base': 'drop_lng must be a number',
  'number.min': 'drop_lng cannot be less than -180',
  'number.max': 'drop_lng cannot be greater than 180',
  'any.required': 'drop_lng is required',
});

export const dropAddressRule = Joi.string().trim().required().messages({
  'string.base': 'drop_address must be a string',
  'string.empty': 'drop_address cannot be empty',
  'any.required': 'drop_address is required',
});

export const distanceKmRule = Joi.number().min(0).required().messages({
  'number.base': 'distance_km must be a number',
  'number.min': 'distance_km cannot be negative',
  'any.required': 'distance_km is required',
});

export const tripDurationMinutesRule = Joi.number().integer().min(0).optional().messages({
  'number.base': 'trip_duration_minutes must be a number',
  'number.integer': 'trip_duration_minutes must be an integer',
  'number.positive': 'trip_duration_minutes must be positive',
});

export const waitingTimeMinutesRule = Joi.number().integer().min(0).optional().messages({
  'number.base': 'waiting_time_minutes must be a number',
  'number.integer': 'waiting_time_minutes must be an integer',
  'number.min': 'waiting_time_minutes cannot be negative',
});

export const baseFareRule = Joi.number().min(0).required().messages({
  'number.base': 'base_fare must be a number',
  'number.min': 'base_fare cannot be negative',
  'any.required': 'base_fare is required',
});

export const waitingChargesRule = Joi.number().min(0).optional().messages({
  'number.base': 'waiting_charges must be a number',
  'number.min': 'waiting_charges cannot be negative',
});

export const driverAllowanceRule = Joi.number().min(0).optional().messages({
  'number.base': 'driver_allowance must be a number',
  'number.min': 'driver_allowance cannot be negative',
});

export const platformFeeRule = Joi.number().min(0).required().messages({
  'number.base': 'platform_fee must be a number',
  'number.min': 'platform_fee cannot be negative',
  'any.required': 'platform_fee is required',
});

export const totalFareRule = Joi.number().min(0).required().messages({
  'number.base': 'total_fare must be a number',
  'number.min': 'total_fare cannot be negative',
  'any.required': 'total_fare is required',
});

export const paidAmountRule = Joi.number().min(0).optional().messages({
  'number.base': 'paid_amount must be a number',
  'number.min': 'paid_amount cannot be negative',
});

export const driverRatingRule = Joi.number().min(1).max(5).optional().messages({
  'number.base': 'driver_rating must be a number',
  'number.min': 'driver_rating cannot be less than 1',
  'number.max': 'driver_rating cannot be greater than 5',
});

export const userRatingRule = Joi.number().min(1).max(5).optional().messages({
  'number.base': 'user_rating must be a number',
  'number.min': 'user_rating cannot be less than 1',
  'number.max': 'user_rating cannot be greater than 5',
});
export const notesRule = Joi.string().optional().messages({
  'string.base': 'notes must be a string',
});

export const driverFeedbackRule = Joi.string().allow('').optional().messages({
  'string.base': 'driver_feedback must be a string',
});

export const userFeedbackRule = Joi.string().allow('').optional().messages({
  'string.base': 'user_feedback must be a string',
});

export const changeTypeRule = enumString(Object.values(ChangeType))
  .optional()
  .messages({
    'any.only': `cancel_by must be one of [${Object.values(ChangeType).join(', ')}]`,
    'string.base': 'cancel_by must be a string',
  });

export const changeByRule = enumString(Object.values(ChangeBy))
  .optional()
  .messages({
    'any.only': `cancel_by must be one of [${Object.values(ChangeBy).join(', ')}]`,
    'string.base': 'cancel_by must be a string',
  });

export const oldValueRule = Joi.alternatives()
  .try(Joi.object().unknown(true), Joi.allow(null))
  .optional()
  .messages({
    'object.base': 'old_value must be a valid JSON object',
    'any.only': 'old_value must be null or a JSON object',
  });

export const newValueRule = Joi.object().unknown(true).required().messages({
  'any.required': 'new_value is required',
  'object.base': 'new_value must be a valid JSON object',
});
export const is_for_self = Joi.boolean().required().messages({
  'any.required': 'is_for_self is required',
  'boolean.base': 'is_for_self must be a true or false value',
});

export const passenger_details = Joi.object({
  name: Joi.string().required(),
  phone: Joi.string().min(10).max(15).required(),
})
  .allow(null)
  .when('is_for_self', {
    is: false,
    then: Joi.object().required().messages({
      'any.required': 'Passenger details are required when booking for someone else',
    }),
    otherwise: Joi.optional(),
  });

export const tripCodeRule = Joi.string().optional().messages({
  'string.base': 'trip_code must be a string',
});

export const vehicleModelRule = Joi.string().optional().messages({
  'string.base': 'vehicle_model must be a string',
});

export const vehicleTypeRule = enumString(Object.values(VehicleType))
  .optional()
  .messages({
    'any.only': `vehicle_type must be one of [${Object.values(VehicleType).join(', ')}]`,
    'string.base': 'vehicle_type must be a string',
  });

export const transmissionTypeRule = enumString(Object.values(TransmissionType))
  .optional()
  .messages({
    'any.only': `transmission_type must be one of [${Object.values(TransmissionType).join(', ')}]`,
    'string.base': 'transmission_type must be a string',
  });

export const couponCodeRule = Joi.string().allow('', null).optional().messages({
  'string.base': 'coupon_code must be a string',
});

export const discountRule = Joi.number().allow('', null).optional().messages({
  'number.base': 'discount must be a number',
});

export const appliedCouponIdRule = Joi.string().allow('', null).optional().messages({
  'string.base': 'applied_coupon_id must be a string',
});

export const packageHoursRule = Joi.number().optional().messages({
  'number.base': 'package_hours must be a number',
});

export const outstationTripTypeRule = Joi.string().optional().messages({
  'string.base': 'outstation_trip_type must be a string',
});
