import { Joi } from 'celebrate';
import * as tripSchema from '../../validations/schema/trip.schema';
import { idRule } from '../../validations/schema/common.schema';

export const TripValidation = {
  idValidation: Joi.object().keys({
    id: idRule,
  }),

  createTripValidation: Joi.object().keys({
    user_id: tripSchema.userIdRule,
    driver_id: tripSchema.driverIdRule.optional(),
    ride_type: tripSchema.rideTypeRule,
    service_type: tripSchema.serviceTypeRule,
    booking_type: tripSchema.bookingTypeRule,
    is_for_self: tripSchema.is_for_self,
    passenger_details: tripSchema.passenger_details,
    trip_status: tripSchema.tripStatusRule,
    original_scheduled_start_time: tripSchema.originalScheduledStartTimeRule,
    scheduled_start_time: tripSchema.scheduledStartTimeRule,
    pickup_lat: tripSchema.pickupLatRule,
    pickup_lng: tripSchema.pickupLngRule,
    pickup_address: tripSchema.pickupAddressRule,
    drop_lat: tripSchema.dropLatRule,
    drop_lng: tripSchema.dropLngRule,
    drop_address: tripSchema.dropAddressRule,
    distance_km: tripSchema.distanceKmRule,
    base_fare: tripSchema.baseFareRule,
    platform_fee: tripSchema.platformFeeRule,
    driver_allowance: tripSchema.driverAllowanceRule.optional(),
    total_fare: tripSchema.totalFareRule,
    payment_status: tripSchema.paymentStatusRule.optional(),
    vehicle_model: tripSchema.vehicleModelRule.optional(),
    vehicle_type: tripSchema.vehicleTypeRule.optional(),
    transmission_type: tripSchema.transmissionTypeRule.optional(),
    coupon_code: tripSchema.couponCodeRule.optional(),
    discount: tripSchema.discountRule.optional(),
    applied_coupon_id: tripSchema.appliedCouponIdRule.optional(),
  }),

  updateTripValidation: Joi.object()
    .keys({
      driver_id: tripSchema.driverIdRule.optional(),
      ride_type: tripSchema.rideTypeRule.optional(),
      vehicle_id: tripSchema.vehicleIdRule.optional(),
      trip_status: tripSchema.tripStatusRule.optional(),
      scheduled_start_time: tripSchema.scheduledStartTimeRule.optional(),
      pickup_address: tripSchema.pickupAddressRule.optional(),
      drop_address: tripSchema.dropAddressRule.optional(),
      actual_pickup_time: tripSchema.actualPickupTimeRule.optional(),
      actual_drop_time: tripSchema.actualDropTimeRule.optional(),
      trip_duration_minutes: tripSchema.tripDurationMinutesRule.optional(),
      waiting_time_minutes: tripSchema.waitingTimeMinutesRule.optional(),
      waiting_charges: tripSchema.waitingChargesRule.optional(),
      driver_allowance: tripSchema.driverAllowanceRule.optional(),
      total_fare: tripSchema.totalFareRule.optional(),
      paid_amount: tripSchema.paidAmountRule.optional(),
      payment_status: tripSchema.paymentStatusRule.optional(),
      cancel_reason: tripSchema.cancelReasonRule.optional(),
      cancel_by: tripSchema.cancelByRule.optional(),
      notes: tripSchema.notesRule.optional(),
      rating: tripSchema.ratingRule.optional(),
      feedback: tripSchema.feedbackRule.optional(),
      re_route_id: tripSchema.reRouteIdRule.optional(),
      trip_code: tripSchema.tripCodeRule.optional(),
      vehicle_model: tripSchema.vehicleModelRule.optional(),
      vehicle_type: tripSchema.vehicleTypeRule.optional(),
      transmission_type: tripSchema.transmissionTypeRule.optional(),
    })
    .min(1)
    .messages({
      'object.min': 'At least one field must be provided to update',
    }),

  createTripChangesValidation: Joi.object().keys({
    trip_id: tripSchema.tripIdRule,
    change_type: tripSchema.changeTypeRule,
    old_value: tripSchema.oldValueRule,
    new_value: tripSchema.newValueRule,
    changed_by: tripSchema.changeByRule,
    notes: tripSchema.notesRule,
  }),

  acceptTripValidation: Joi.object().keys({
    trip_id: tripSchema.tripIdRule,
    driver_id: tripSchema.driverIdRule.optional(),
  }),

  updateTripStatusValidation: Joi.object().keys({
    trip_id: tripSchema.tripIdRule,
    trip_status: tripSchema.tripStatusRule.optional(),
  }),

  cancelTripValidation: Joi.object().keys({
    trip_id: tripSchema.tripIdRule,
    trip_status: tripSchema.tripStatusRule.optional(),
    cancel_reason: tripSchema.cancelReasonRule.optional(),
    cancel_by: tripSchema.cancelByRule.optional(),
    notes: tripSchema.notesRule.optional(),
  }),
};
