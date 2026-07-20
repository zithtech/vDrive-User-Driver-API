import { Server } from 'socket.io';
import { Trip } from './trip.model';
import { TripRepository } from './trip.repository';
import { TripChanges } from './tripChanges.model';
import { query } from '../../shared/database';
import { UserRepository } from '../users/user.repository';
import { TripTransactionService } from '../triptransactions/triptransaction.service';
import { ActorType, TripEventType } from '../../enums/triptransaction.enums';
import { tripTransactionLogger } from '../triptransactions/triptransactionlogger';
import { DriverNotifications, UserNotifications } from '../notifications';
import { CancelBy, CancelReason, TripStatus } from '../../enums/trip.enums';
import {
  broadcastTripUpdate,
  emitToRoom,
  emitTripRemoved,
  emitTripUpdate,
} from '../../sockets/socket';
import { DriverRepository } from '../drivers/driver.repository';
import { DriverAvailabilityStatus } from '../drivers/driver.model';
import { TripSocketEvent } from '../../sockets/socket.types';
import { logger } from '../../shared/logger';
import { notifyAdmin } from '../../shared/eventBus';
import { getRedisClient } from '../../shared/redis';
import { ReferralService } from '../referrals/referral.service';
import { ReferralRepository } from '../referrals/referral.repository';
import { DriverReferralService } from '../driver-referrals/driver-referral.service';
import { CouponService } from '../coupon-management/coupon.service';
import { UserStatus } from '../../enums/user.enums';
// Keep global map
const tripBroadcastTimers = new Map<string, NodeJS.Timeout>();

async function publishAdminTripUpdate(tripId: string, status: string, driverId?: string) {
  try {
    const redis = getRedisClient();

    if (status === 'ACCEPTED' && driverId) {
      await redis.set(`trip_driver:${tripId}`, driverId);
    } else if (['COMPLETED', 'CANCELLED', 'MID_CANCELLED'].includes(status)) {
      await redis.del(`trip_driver:${tripId}`);
    }

    // Forward to the admin UI via Redis pub/sub bus
    notifyAdmin('TRIP_STATUS_UPDATE', { tripId, status, driverId, timestamp: Date.now() });
  } catch (err) {
    logger.error('Redis admin trip update error:', err);
  }
}

export const TripService = {
  async getTrips(bookingType?: string, driverId?: string, onboardingStatus?: string) {
    // If it's a driver and they are requesting scheduled rides
    if (bookingType === 'SCHEDULED' && onboardingStatus !== 'SUBSCRIPTION_ACTIVE') {
      // 🛡️ Return empty list if no active subscription
      return [];
    }

    return await TripRepository.findActiveRequests(bookingType, driverId);
  },

  async getAllTripsWithChanges() {
    return await TripRepository.getAllTripsWithChanges();
  },

  async getTripByUserId(id: string, role: string, limit?: number, tab?: string) {
    const result = await TripRepository.findByUserId(id, role, limit, tab);
    if (!result || !result.data) {
      throw { statusCode: 404, message: 'Trip not found' };
    }
    return result;
  },

  async getTripById(id: string) {
    const trip = await TripRepository.findById(id);
    if (!trip) {
      throw { statusCode: 404, message: 'Trip not found' };
    }
    return trip;
  },
  async createTrip(data: Partial<Trip>, couponCode?: string) {
    // Generate a 4-digit OTP
    // data.otp = Math.floor(1000 + Math.random() * 9000).toString();

    // First calculate full fare BEFORE discount
    const baseFare = data.base_fare!;
    const allowance = data.driver_allowance ?? 0;
    const waitingCharge = data.waiting_charges ?? 0;

    const fullFare = baseFare + allowance + waitingCharge;

    data.total_fare = fullFare;
    // 🏷️ Handle Coupon Application
    if (couponCode) {
      try {
        const coupon = await CouponService.validateCoupon(
          couponCode,
          data.user_id!,
          data.base_fare!
        );
        const discountAmount = CouponService.calculateDiscount(coupon, data.base_fare!);

        data.applied_coupon_id = coupon.id;
        data.coupon_code = couponCode;
        data.discount = discountAmount;
        data.total_fare = fullFare! - discountAmount;

        logger.info(`Coupon ${couponCode} applied to new trip. Discount: ${discountAmount}`);
      } catch (error: any) {
        logger.warn(`Failed to apply coupon ${couponCode}: ${error.message}`);
        data.discount = 0;
        data.total_fare = fullFare;
        // We continue trip creation but without the coupon
      }
    }
    let user: any = null;
    if (data.user_id) {
      user = await UserRepository.findById(data.user_id, UserStatus.ACTIVE);
      if (user) {
        data.otp = user.otp;
      }
    }

    const trip = await TripRepository.createTrip(data);
    if (!trip) {
      throw { statusCode: 500, message: 'Trip creation failed' };
    }

    // ✅ Attach user full_name so that it can be used during broadcast for self-booked rides
    if (user && (trip.is_for_self || trip.is_for_self === null)) {
      (trip as any).passenger_name = user.full_name;
    }

    if (trip) {
      await TripTransactionService.logEvent({
        trip_id: trip.trip_id,
        event_type: TripEventType.TripRequested,
        actor_type: ActorType.User,
        actor_id: trip.user_id,
        // actor_name: tripData.user_name ?? null,
        currentSnapshot: trip,
        previousSnapshot: null,
        notes: 'Trip created by user',
        metadata: {
          pickup_address: trip.pickup_address,
          drop_address: trip.drop_address,
          ride_type: trip.ride_type,
        },
      });
    }

    return trip;
  },

  async updateTrip(id: string, data: Partial<Trip>) {
    const previousSnapshot = await TripRepository.findById(id);

    if (data.scheduled_start_time) {
      data.user_reminders_sent = null;
    }

    const fields = Object.keys(data);
    if (fields.length === 0) return null;
    const setQuery = fields.map((field, index) => `"${field}" = $${index + 1}`).join(', ');
    const values = Object.values(data);

    const trip = await TripRepository.updateTrip(id, setQuery, values);

    if (!trip) {
      throw { statusCode: 500, message: 'Update trip failed' };
    }

    // --- RECALCULATE RATINGS IF APPLICABLE ---
    if (data.user_rating !== undefined && trip.user_id) {
      const userTripsObj = await TripRepository.findByUserId(trip.user_id, 'customer');
      const userTrips = userTripsObj.data;
      const ratedTrips = userTrips.filter((t: any) => t.user_rating && Number(t.user_rating) > 0);

      if (ratedTrips.length > 0) {
        const totalRating = ratedTrips.reduce((sum: number, t: any) => sum + Number(t.user_rating), 0);
        const averageRating = parseFloat((totalRating / ratedTrips.length).toFixed(2));
        await UserRepository.updateUser(trip.user_id, '"rating" = $1', [averageRating]);
      }
    }

    // if (data.driver_rating !== undefined && trip.driver_id) {
    //   const driverTrips = await TripRepository.findByDriverId(trip.driver_id);
    //   const ratedTrips = driverTrips.filter((t: any) => t.driver_rating && t.driver_rating > 0);

    //   if (ratedTrips.length > 0) {
    //     const totalRating = ratedTrips.reduce((sum: number, t: any) => sum + t.driver_rating, 0);
    //     const averageRating = parseFloat((totalRating / ratedTrips.length).toFixed(2));
    //     await DriverRepository.update(trip.driver_id, { rating: averageRating });
    //   }
    // }

    // ── 3. Resolve actor from context ─────────────────────────────────────────
    const actor_type =
      data.cancel_by === 'USER'
        ? ActorType.User
        : data.cancel_by === 'DRIVER'
          ? ActorType.Driver
          : ActorType.Admin;

    // ── 5. Log — state machine handles everything ─────────────────────────────
    await tripTransactionLogger.logAll({
      trip,
      previousSnapshot,
      changedData: data,
      actor_type,
      actor_id: trip.updated_by ?? null,
      metadata: { changed_keys: fields },
    });

    return trip;
  },

  async createTripChanges(data: TripChanges) {
    const tripChanges = await TripRepository.createTripChanges(data);
    if (!tripChanges) {
      throw { statusCode: 400, message: 'Trip Changes not created' };
    }
    return tripChanges;
  },

  async getActiveTripByUserId(id: string) {
    const trips = await TripRepository.findActiveTripByUserId(id);
    if (!trips) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return {
      activeTrips: trips.activeTrips,
      scheduledTrips: trips.scheduledTrips,
    };
  },

  async requestRide(io: Server, tripData: any, driverId: string) {
    // Find driver's private room
    const driverRoom = `driver_${driverId}`;

    // Notify Driver via Socket
    io.to(driverRoom).emit(TripSocketEvent.NEW_TRIP_REQUEST, {
      ...tripData,
      id: tripData.id,
      trip_id: tripData.id,
      tripId: tripData.id,
      pickup: tripData.pickup_address,
      drop: tripData.drop_address,
      fare: tripData.fare,
      passengerName: tripData.user_name,
    });

    // ✅ Also send Push Notification
    try {
      const driverToken = await DriverRepository.getFcmTokenById(driverId);
      if (driverToken) {
        await DriverNotifications.newRideRequest(
          driverToken,
          String(tripData.id),
          tripData.pickup_address || 'Pickup Location',
          tripData.drop_address || 'Drop Location',
          {
            fare: String(tripData.total_fare || tripData.fare || '0'),
            passengerName: String(tripData.passenger_name || tripData.user_name || 'Passenger'),
            ride_type: String(tripData.ride_type || ''),
            booking_type: String(tripData.booking_type || ''),
            scheduled_start_time: String(tripData.scheduled_start_time || ''),
            otp: String(tripData.otp || ''),
            createdAt: new Date().toISOString(),
            pickup_lat: String(tripData.pickup_lat || ''),
            pickup_lng: String(tripData.pickup_lng || ''),
            drop_lat: String(tripData.drop_lat || ''),
            drop_lng: String(tripData.drop_lng || ''),
            distanceToUser: String(tripData.distanceToUser || '0'),
            eta: String(tripData.eta || '1'),
            remaining: '20',
            tripId: String(tripData.id)
          }
        );
      }
    } catch (err: any) {
      logger.error(`Failed to send push notification in requestRide: ${err.message}`);
    }
  },

  async acceptTrip(tripId: string, driverId: string) {
    const trip = await TripRepository.findById(tripId);
    const previousSnapshot = { ...trip };
    if (!trip) {
      throw { statusCode: 404, message: 'Trip not found' };
    }
    // Updated to allow both REQUESTED (broadcast) and ASSIGNED (manual targeting)
    if (![TripStatus.REQUESTED, TripStatus.ASSIGNED].includes(trip.trip_status)) {
      throw { statusCode: 400, message: 'Trip is no longer available' };
    }

    const driver = await DriverRepository.findById(driverId);
    if (!driver) {
      throw { statusCode: 404, message: 'Driver not found' };
    }

    // Conflict Check 1: Must not be already on a trip
    if (driver?.availability?.status === DriverAvailabilityStatus.ON_TRIP) {
      throw { statusCode: 400, message: 'You are already on an active trip' };
    }

    const now = new Date();

    if (trip.booking_type === 'SCHEDULED') {
      // Conflict Check 2: Only one scheduled ride at a time
      const existingScheduled = await query(
        "SELECT trip_id FROM trips WHERE driver_id = $1 AND booking_type = 'SCHEDULED' AND trip_status = 'ACCEPTED'",
        [driverId]
      );
      if (existingScheduled.rows.length > 0) {
        throw { statusCode: 400, message: 'You already have an upcoming scheduled ride' };
      }

      // Update Trip — the repository UPDATE is guarded by trip_status, so a null
      // return means another driver won the race. Bail out before touching driver state.
      const acceptedTrip = await TripRepository.acceptTrip(tripId, driverId);
      if (!acceptedTrip) {
        throw { statusCode: 409, message: 'Trip is no longer available' };
      }

      // Update Driver
      await DriverRepository.update(driverId, {
        availability: {
          ...driver.availability,
          status: DriverAvailabilityStatus.HAS_UPCOMING_SCHEDULED,
        },
      });
    } else {
      // LIVE RIDE
      // Conflict Check 3: 30-minute buffer for scheduled rides
      const nearbyScheduled = await query(
        "SELECT trip_id, scheduled_start_time FROM trips WHERE driver_id = $1 AND booking_type = 'SCHEDULED' AND trip_status = 'ACCEPTED' AND (scheduled_start_time - NOW()) < INTERVAL '30 minutes'",
        [driverId]
      );
      if (nearbyScheduled.rows.length > 0) {
        throw { statusCode: 400, message: 'You have a scheduled ride starting soon' };
      }

      // Update Trip — the repository UPDATE is guarded by trip_status, so a null
      // return means another driver won the race. Bail out before touching driver state.
      const acceptedTrip = await TripRepository.acceptTrip(tripId, driverId);
      if (!acceptedTrip) {
        throw { statusCode: 409, message: 'Trip is no longer available' };
      }

      // Update Driver
      await DriverRepository.update(driverId, {
        availability: {
          ...driver.availability,
          status: DriverAvailabilityStatus.ON_TRIP,
        },
      });
    }

    const updatedTrip = await TripRepository.findById(tripId);

    // Broadcast update via Socket.IO
    // broadcastTripUpdate(tripId, { status: TripStatus.ACCEPTED, type: 'trip_updated', trip: updatedTrip });

    try {
      emitTripUpdate(tripId, TripSocketEvent.TRIP_ACCEPTED, {
        tripId,
        status: TripStatus.ACCEPTED,
        trip: updatedTrip,
        driver: {
          id: driver.driverId,
          name: driver.full_name ?? 'Captain',
          phone: driver.phone_number,
          rating: driver.rating,
          // otp: user?.otp || driver?.otp || '1234',
          otp: 1234,
          current_lat: driver.current_lat || 0,
          current_lng: driver.current_lng || 0,
          heading: driver.current_heading || 0,
        },
      });

      logger.info(`🗑️ Broadcating TRIP_REMOVED for trip: ${tripId}`);

      emitTripRemoved(tripId);

      await TripTransactionService.logEvent({
        trip_id: trip.trip_id,
        event_type: TripEventType.TripAccepted,
        actor_type: ActorType.Driver,
        actor_id: driverId,
        currentSnapshot: trip,
        previousSnapshot: previousSnapshot ?? null,
        notes: 'Trip accepted by driver',
        metadata: { driver_id: driverId },
      });

      const customerToken = await UserRepository.getFcmTokenById(trip.user_id);
      if (!customerToken) {
        logger.warn(`Cannot send notification: User ${trip.user_id} has no FCM token.`);
        return;
      }
      await UserNotifications.driverAssigned(
        customerToken,
        driver?.full_name ?? 'Captain', // ✅ fallback if name is undefined
        String(trip.trip_id ?? '')
      );
      if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
      return updatedTrip;
    } catch (error) {
      logger.error('Acceptance Error in Service:', error);
      throw error;
    }
  },

  async requestRideToMultipleDrivers(io: Server, tripData: any, drivers: any[]) {
    const tripId = tripData[0].trip_id;

    const RETRY_INTERVAL = 20000; // 20 seconds
    const MAX_RETRIES = 5;
    let retries = 0;

    // Cancel existing loop if already running
    if (tripBroadcastTimers.has(tripId)) {
      clearInterval(tripBroadcastTimers.get(tripId)!);
      tripBroadcastTimers.delete(tripId);
    }

    const broadcast = () => {
      logger.info(`📡 Broadcasting Trip ${tripId} to ${drivers.length} drivers`);

      drivers.forEach((driver) => {
        // Robust parsing of passenger details if it's a string
        let passengerDetails = tripData[0].passenger_details;
        if (typeof passengerDetails === 'string') {
          try {
            passengerDetails = JSON.parse(passengerDetails);
          } catch (e) {
            logger.error(`Error parsing passenger_details for trip ${tripId}: ${e}`);
          }
        }

        const payload = {
          tripId,
          pickup: tripData[0].pickup_address,
          drop: tripData[0].drop_address,
          fare: tripData[0].total_fare,
          passengerName: passengerDetails?.name || tripData[0].passenger_name || 'Passenger',
          ride_type: tripData[0].ride_type,
          booking_type: tripData[0].booking_type,
          scheduled_start_time: tripData[0].scheduled_start_time,
          otp: tripData[0].otp,
          pickup_lat: tripData[0].pickup_lat,
          pickup_lng: tripData[0].pickup_lng,
          drop_lat: tripData[0].drop_lat,
          drop_lng: tripData[0].drop_lng,

          // Driver-specific data
          distanceToUser: driver.distance_meters,
          eta: driver.eta || null,

          remaining: 20, // UI Timer reset
          createdAt: new Date().toISOString(), // 🕒 Time sync for background/cold-start
        };

        logger.info(
          `📤 Sending NEW_TRIP_REQUEST to driver_${driver.id}: ${JSON.stringify(payload)}`
        );
        emitToRoom(`driver_${driver.id}`, TripSocketEvent.NEW_TRIP_REQUEST, payload);

        // ✅ Also send Push Notification (Only on first broadcast to avoid spamming)
        if (retries === 0 && driver.fcm_token) {
          DriverNotifications.newRideRequest(
            driver.fcm_token,
            String(tripId),
            tripData[0].pickup_address || 'Pickup Location',
            tripData[0].drop_address || 'Drop Location',
            {
              fare: String(tripData[0].total_fare),
              passengerName: passengerDetails?.name || tripData[0].passenger_name || 'Passenger',
              ride_type: String(tripData[0].ride_type || ''),
              booking_type: String(tripData[0].booking_type || ''),
              scheduled_start_time: String(tripData[0].scheduled_start_time || ''),
              otp: String(tripData[0].otp || ''),
              createdAt: payload.createdAt,
              pickup_lat: String(tripData[0].pickup_lat),
              pickup_lng: String(tripData[0].pickup_lng),
              drop_lat: String(tripData[0].drop_lat),
              drop_lng: String(tripData[0].drop_lng),
              distanceToUser: String(driver.distance_meters || '0'),
              eta: String(driver.eta || '1'),
              remaining: '20',
              tripId: String(tripId)
            }
          ).catch((err) =>
            logger.error(`FCM Broadcast Error for driver ${driver.id}: ${err.message}`)
          );
        }
      });
    };

    // First Broadcast
    broadcast();

    // Interval
    const timer = setInterval(async () => {
      retries++;

      try {
        // Stop if too many retries
        if (retries >= MAX_RETRIES) {
          logger.info(`🛑 Max retries reached. Stopping trip broadcast ${tripId}`);
          clearInterval(timer);
          tripBroadcastTimers.delete(tripId);
          return;
        }

        // Check DB
        const result = await query('SELECT trip_status FROM trips WHERE trip_id = $1 LIMIT 1', [
          tripId,
        ]);

        const status = result.rows[0]?.trip_status;

        // Stop conditions
        if (!result.rows.length || ![TripStatus.REQUESTED].includes(status)) {
          logger.info(`🛑 Stopping broadcast for ${tripId}. Current Status: ${status}`);
          clearInterval(timer);
          tripBroadcastTimers.delete(tripId);
          return;
        }

        // Re-broadcast
        logger.info(`🔄 Trip ${tripId} still pending. Re-sending... Retry ${retries}`);
        broadcast();
      } catch (error) {
        logger.error('Postgres Error:', error);
      }
    }, RETRY_INTERVAL);

    // Store timer
    tripBroadcastTimers.set(tripId, timer);

    return { success: true };
  },

  async updateTripStatus(io: Server, tripId: string, tripStatus: string) {
    const previousSnapshot = await TripRepository.findById(tripId);
    const trip = await TripRepository.updateTripStatus(tripId, tripStatus);
    if (!trip) {
      throw new Error('Trip not found');
    }
    await TripTransactionService.logEvent({
      trip_id: trip.trip_id,
      event_type: TripEventType.TripAccepted,
      actor_type: ActorType.Driver,
      actor_id: trip.driver_id,
      currentSnapshot: trip,
      previousSnapshot: previousSnapshot ?? null,
      notes: 'Trip accepted by driver',
      metadata: { driver_id: trip.driver_id },
    });
    // emitTripUpdate(tripId, TripSocketEvent.TRIP_STATUS_CHANGED, { tripId, status: trip.trip_status })
    broadcastTripUpdate(tripId, { status: trip.trip_status, type: 'trip_updated', trip: trip });
    return trip;
  },

  async cancelTrip(
    tripId: string,
    tripStatus: string,
    cancelReason: CancelReason,
    cancelBy: CancelBy,
    notes: string
  ) {
    // ─── 1. FETCH TRIP ───────────────────────────────────────────────
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    const previousSnapshot = { ...trip }; // ✅ clone before mutation

    // ─── 2. VALIDATE CANCELLABLE STATUS ─────────────────────────────
    const nonCancellableStatuses = [
      TripStatus.COMPLETED,
      TripStatus.CANCELLED,
      TripStatus.MID_CANCELLED,
    ];
    if (nonCancellableStatuses.includes(trip.trip_status)) {
      throw {
        statusCode: 400,
        message: `Trip cannot be cancelled. Current status: ${trip.trip_status}`,
      };
    }

    // ─── 3. ACTOR-SPECIFIC RULES ────────────────────────────────────
    const midTripReasons = [
      CancelReason.VEHICLE_PROBLEM,
      CancelReason.PERSONAL_EMERGENCY,
      CancelReason.TECHNICAL_ISSUE,
      CancelReason.OTHER,
    ];

    const userMidTripReasons = [
      CancelReason.CHANGED_MY_MIND,
      CancelReason.UNSAFE_DRIVING,
      CancelReason.DRIVER_BEHAVIOR,
      CancelReason.VEHICLE_CONDITION,
      CancelReason.WRONG_ROUTE,
      CancelReason.FEELING_UNWELL,
      CancelReason.CHANGE_PLANS,
      CancelReason.TAKING_TOO_LONG,
      CancelReason.VEHICLE_MISMATCH,
      CancelReason.FARE_CONCERN,
      CancelReason.FOUND_ALTERNATIVE,
      CancelReason.OTHER,
    ];

    if (cancelBy === CancelBy.DRIVER) {
      // Driver CANNOT cancel a LIVE trip unless it's an emergency
      if (trip.trip_status === TripStatus.LIVE && !midTripReasons.includes(cancelReason)) {
        throw {
          statusCode: 400,
          message: 'Driver can only cancel a live trip for emergencies or vehicle problems.',
        };
      }
    } else if (cancelBy === CancelBy.USER) {
      // User CANNOT cancel a LIVE trip unless valid mid-trip reason
      if (trip.trip_status === TripStatus.LIVE && !userMidTripReasons.includes(cancelReason)) {
        throw {
          statusCode: 400,
          message:
            'User can only cancel a live trip for valid reasons (e.g. driver too far, long wait).',
        };
      }
    }
    // ADMIN: no restrictions — can cancel at any status

    // ─── 4. MAP CANCEL REASON ────────────────────────────────────────
    const CANCELLATION_REASON_MAP: Record<string, CancelReason> = {
      PERSONAL_EMERGENCY: CancelReason.PERSONAL_EMERGENCY,
      VEHICLE_PROBLEM: CancelReason.VEHICLE_PROBLEM,
      PICKUP_TOO_FAR: CancelReason.PICKUP_TOO_FAR,
      RIDER_NOT_RESPONDING: CancelReason.RIDER_NOT_RESPONDING,
      RIDER_ASKED_TO_CANCEL: CancelReason.RIDER_ASKED_TO_CANCEL,
      TECHNICAL_ISSUE: CancelReason.TECHNICAL_ISSUE,
      DRIVER_TOO_FAR: CancelReason.DRIVER_TOO_FAR,
      CHANGED_MY_MIND: CancelReason.CHANGED_MY_MIND,
      WAIT_TIME_TOO_LONG: CancelReason.WAIT_TIME_TOO_LONG,
      MISTAKE_IN_ADDRESS: CancelReason.MISTAKE_IN_ADDRESS,
      FOUND_ANOTHER_RIDE: CancelReason.FOUND_ANOTHER_RIDE,
      OTHER: CancelReason.OTHER,
    };

    const mappedReason =
      CANCELLATION_REASON_MAP[cancelReason] ??
      (Object.values(CancelReason).includes(cancelReason) ? cancelReason : CancelReason.OTHER);

    // ─── 5. AUTO-REASSIGN CHECK ─────────────────────────────────────
    // If the DRIVER cancels a pre-trip ride (ACCEPTED/ARRIVING/ASSIGNED),
    // attempt to re-dispatch to other drivers instead of permanently cancelling.
    const MAX_REDISPATCH = 3;
    const isPreTrip = [TripStatus.ACCEPTED, 'ARRIVING', 'ARRIVED', 'ASSIGNED'].includes(trip.trip_status);

    if (cancelBy === CancelBy.DRIVER && isPreTrip) {
      const { count: currentRedispatchCount } = await TripRepository.getRedispatchCount(tripId);

      if (currentRedispatchCount < MAX_REDISPATCH) {
        logger.info(`🔄 Auto-reassigning trip ${tripId}. Re-dispatch #${currentRedispatchCount + 1}/${MAX_REDISPATCH}`);

        // 5a. Reset driver availability
        if (trip.driver_id) {
          try {
            const driver = await DriverRepository.findById(trip.driver_id);
            if (driver) {
              await DriverRepository.update(trip.driver_id, {
                availability: {
                  ...driver.availability,
                  status: DriverAvailabilityStatus.ONLINE,
                },
              });
            }
          } catch (err: any) {
            logger.error(`Failed to reset driver availability during re-dispatch: ${err.message}`);
          }
        }

        // 5b. Reset trip to REQUESTED and record rejected driver
        const resetTrip = await TripRepository.resetForRedispatch(tripId, trip.driver_id!);
        if (!resetTrip) throw { statusCode: 500, message: 'Failed to reset trip for re-dispatch' };

        // 5c. Log the cancellation event
        await TripTransactionService.logEvent({
          trip_id: trip.trip_id!,
          event_type: TripEventType.TripCancelled,
          actor_type: ActorType.Driver,
          actor_id: trip.driver_id,
          currentSnapshot: resetTrip,
          previousSnapshot: previousSnapshot ?? null,
          notes: `Driver cancelled. Auto-reassigning (attempt ${currentRedispatchCount + 1}/${MAX_REDISPATCH})`,
          metadata: { cancel_reason: cancelReason, re_dispatch_count: currentRedispatchCount + 1 },
        });

        // 5d. Emit TRIP_REMOVED to the cancelling driver
        try {
          emitToRoom(`driver_${trip.driver_id}`, 'TRIP_REMOVED', { tripId });
        } catch (e) {
          logger.error('Failed to emit TRIP_REMOVED to cancelling driver:', e);
        }

        // 5e. Notify the USER that we're finding another driver (not a full cancellation)
        try {
          emitToRoom(`user_${trip.user_id}`, 'RIDE_REASSIGNING', {
            tripId,
            message: 'Your previous driver cancelled. Finding you another driver...',
            reDispatchCount: currentRedispatchCount + 1,
            maxReDispatch: MAX_REDISPATCH,
            timestamp: new Date().toISOString(),
          });

          const userfcmtoken = trip.user_id ? await UserRepository.getFcmTokenById(trip.user_id) : null;
          if (userfcmtoken) {
            await UserNotifications.rideCancelled(
              userfcmtoken,
              tripId,
              CancelReason.OTHER,
              cancelBy
            );
          }
        } catch (err: any) {
          logger.error(`Failed to notify user about re-dispatch: ${err.message}`);
        }

        // 5f. Confirm cancellation to the driver
        try {
          const driverfcmtoken = trip.driver_id
            ? await DriverRepository.getFcmTokenById(trip.driver_id)
            : null;
          if (driverfcmtoken) {
            await DriverNotifications.bookingCancelled(driverfcmtoken, tripId, mappedReason, cancelBy);
          }
        } catch (err: any) {
          logger.error(`Failed to send cancellation confirmation to driver: ${err.message}`);
        }

        // 5g. Re-broadcast to nearby drivers (excluding rejected ones)
        try {
          const { getIO } = require('../../sockets/socket');
          const io = getIO();
          const { DriverService } = require('../drivers/driver.service');

          const rejectedDriverIds: string[] = resetTrip.rejected_drivers || [];
          const drivers = await DriverService.getAvailableDrivers(
            Number(resetTrip.pickup_lng),
            Number(resetTrip.pickup_lat),
            500 // radius in meters
          );

          // Filter out rejected drivers
          const eligibleDrivers = drivers.filter(
            (d: any) => !rejectedDriverIds.includes(d.id)
          );

          if (eligibleDrivers.length > 0) {
            logger.info(`📡 Re-broadcasting trip ${tripId} to ${eligibleDrivers.length} drivers (excluded ${rejectedDriverIds.length} rejected)`);
            await this.requestRideToMultipleDrivers(io, [resetTrip], eligibleDrivers);
          } else {
            logger.warn(`⚠️ No eligible drivers found for re-dispatch of trip ${tripId}. Trip stays as REQUESTED.`);
          }
        } catch (err: any) {
          logger.error(`Failed to re-broadcast trip ${tripId}: ${err.message}`);
        }

        // Notify admin
        await publishAdminTripUpdate(tripId, 'REQUESTED', undefined);

        return resetTrip;
      } else {
        logger.info(`🛑 Trip ${tripId} has reached max re-dispatch limit (${MAX_REDISPATCH}). Permanently cancelling.`);
        // Fall through to permanent cancellation below
      }
    }

    // ─── 6. PERMANENT CANCELLATION (user/admin cancel, or max re-dispatch exceeded) ──
    const newStatus =
      trip.trip_status === TripStatus.LIVE
        ? TripStatus.MID_CANCELLED
        : TripStatus.CANCELLED;

    const updatedTrip = await TripRepository.cancelTrip(
      tripId,
      newStatus,
      mappedReason,
      cancelBy,
      notes
    );

    if (!updatedTrip) throw { statusCode: 500, message: 'Failed to cancel trip' };

    // ─── 7. RESET DRIVER AVAILABILITY ───────────────────────────────
    if (trip.driver_id) {
      try {
        const driver = await DriverRepository.findById(trip.driver_id);
        if (driver) {
          await DriverRepository.update(trip.driver_id, {
            availability: {
              ...driver.availability,
              status: DriverAvailabilityStatus.ONLINE,
            },
          });
        }
      } catch (err: any) {
        logger.error(`Failed to reset driver availability: ${err.message}`);
      }
    }

    // ─── 8. SEND NOTIFICATIONS ──────────────────────────────────────
    try {
      const userfcmtoken = trip.user_id ? await UserRepository.getFcmTokenById(trip.user_id) : null;
      const driverfcmtoken = trip.driver_id
        ? await DriverRepository.getFcmTokenById(trip.driver_id)
        : null;

      if (cancelBy === CancelBy.DRIVER) {
        if (userfcmtoken) {
          await UserNotifications.rideCancelled(userfcmtoken, tripId, mappedReason, cancelBy);
        }
        if (driverfcmtoken) {
          await DriverNotifications.bookingCancelled(
            driverfcmtoken,
            tripId,
            mappedReason,
            cancelBy
          );
        }
      } else if (cancelBy === CancelBy.USER) {
        if (driverfcmtoken) {
          await DriverNotifications.rideCancelled(driverfcmtoken, tripId, mappedReason, cancelBy);
        }
        if (userfcmtoken) {
          await UserNotifications.bookingCancelled(userfcmtoken, tripId, mappedReason, cancelBy);
        }
      } else if (cancelBy === CancelBy.ADMIN) {
        if (userfcmtoken) {
          await UserNotifications.rideCancelled(userfcmtoken, tripId, mappedReason, cancelBy);
        }
        if (driverfcmtoken) {
          await DriverNotifications.rideCancelled(driverfcmtoken, tripId, mappedReason, cancelBy);
        }
      }
    } catch (err: any) {
      logger.error(`Failed to send cancellation notifications: ${err.message}`);
    }

    await TripTransactionService.logEvent({
      trip_id: updatedTrip.trip_id!,
      event_type: TripEventType.TripCancelled,
      actor_type: cancelBy === CancelBy.USER ? ActorType.User : ActorType.Driver,
      actor_id: cancelBy === CancelBy.USER ? trip?.user_id : trip?.driver_id,
      currentSnapshot: updatedTrip,
      previousSnapshot: previousSnapshot ?? null,
      notes: cancelReason,
      metadata: { cancel_reason: cancelReason },
    });

    emitTripUpdate(tripId, TripSocketEvent.TRIP_CANCELLED, {
      tripId: tripId,
      status: updatedTrip.trip_status,
      cancelledBy: cancelBy,
      cancelReason: cancelReason,
      notes: notes,
      timestamp: new Date().toISOString(),
    });

    // 🛡️ PRODUCTION: Also emit TRIP_REMOVED so the driver screen clears immediately
    try {
      if (trip?.driver_id) {
        emitToRoom(`driver_${trip.driver_id}`, 'TRIP_REMOVED', { tripId: tripId });
      }
    } catch (e) {
      logger.error('Failed to emit TRIP_REMOVED on cancellation:', e);
    }

    broadcastTripUpdate(tripId, { status: newStatus, type: 'trip_updated', trip: updatedTrip });

    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },

  async startTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    // If trip is in VERIFICATION_PENDING, only the verification approval flow should start it
    // This check allows startTrip to be called from verifyTripGranular (status is VERIFICATION_PENDING)
    // but blocks manual startTrip calls from the driver app
    if (trip.trip_status === TripStatus.VERIFICATION_PENDING) {
      // Allow - this is called from the verification approval flow
      logger.info(`Starting trip ${tripId} after verification approval`);
    } else if (
      trip.trip_status !== TripStatus.ARRIVED &&
      trip.trip_status !== TripStatus.ACCEPTED
    ) {
      // Block if status is not a valid pre-start status
      if (trip.trip_status === TripStatus.LIVE) {
        // Already started, return current state
        return trip;
      }
      throw { statusCode: 400, message: `Cannot start trip. Current status: ${trip.trip_status}` };
    }

    await this.updateTrip(tripId, {
      trip_status: TripStatus.LIVE,
      started_at: new Date(),
    });

    const driverId = trip.driver_id;
    if (driverId) {
      const driver = await DriverRepository.findById(driverId);

      // Enforce ONLINE status to start pickup/trip
      if (driver?.availability?.status === 'OFFLINE') {
        throw { statusCode: 400, message: 'You must be ONLINE to start this trip.' };
      }

      await DriverRepository.update(driverId, {
        availability: {
          ...driver?.availability,
          status: DriverAvailabilityStatus.ON_TRIP,
        },
      });
    }

    try {
      const fcmToken = trip.user_id ? await UserRepository.getFcmTokenById(trip.user_id) : null;
      const driverfcmtoken = trip.driver_id
        ? await DriverRepository.getFcmTokenById(trip.driver_id)
        : null;
      if (fcmToken) {
        await UserNotifications.rideStarted(fcmToken, trip.trip_id || '');
      }
      if (driverfcmtoken) {
        await DriverNotifications.rideStarted(driverfcmtoken, trip.trip_id || '');
      }
    } catch (err: any) {
      logger.error(`Failed to notify user about ride start: ${err.message}`);
    }

    const updatedTrip = await TripRepository.findById(tripId);

    // Broadcast update via Socket.IO
    // broadcastTripUpdate(tripId, { status: TripStatus.LIVE, type: 'trip_updated', trip: updatedTrip });

    try {
      emitTripUpdate(tripId, TripSocketEvent.TRIP_STARTED, {
        tripId,
        status: TripStatus.LIVE,
        trip: updatedTrip,
      });
    } catch (err: any) {
      logger.error(`Failed to emit trip update: ${err.message}`);
    }

    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },

  async rateDriver(tripId: string, driver_rating: number, driver_feedback?: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    const updatedTrip = await this.updateTrip(tripId, {
      driver_rating,
      ...(driver_feedback && { driver_feedback }),
    });

    if (trip.driver_id) {
      // Recalculate average rating for the driver
      const driverTrips = await TripRepository.findByDriverId(trip.driver_id);
      const ratedTrips = driverTrips.filter((t: any) => t.driver_rating && Number(t.driver_rating) > 0);
      if (ratedTrips.length > 0) {
        const totalRating = ratedTrips.reduce((sum: number, t: any) => sum + Number(t.driver_rating), 0);
        const averageRating = parseFloat((totalRating / ratedTrips.length).toFixed(2));

        await DriverRepository.update(trip.driver_id, {
          rating: averageRating,
        });
      }
    }

    return updatedTrip;
  },

  async completeTrip(tripId: string, distance_km?: number, trip_duration_minutes?: number, user_rating?: number, user_feedback?: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    await this.updateTrip(tripId, {
      trip_status: TripStatus.COMPLETED,
      ended_at: new Date(),
      distance_km: distance_km ?? trip.distance_km,
      trip_duration_minutes: trip_duration_minutes !== undefined ? Math.round(trip_duration_minutes) : trip.trip_duration_minutes,
      payment_status: 'PAID' as any, // Simplified
      ...(user_rating !== undefined && { user_rating }),
      ...(user_feedback !== undefined && { user_feedback }),
    });

    const driverId = trip.driver_id;
    const userId = trip.user_id;

    if (userId) {
      // 📈 Update persistent statistics in the users table
      await UserRepository.incrementStats(userId);

      // Recalculate average user rating
      const userTripsObj = await TripRepository.findByUserId(userId, 'customer');
      const userTrips = userTripsObj.data;
      const ratedTrips = userTrips.filter((t: any) => t.user_rating && Number(t.user_rating) > 0);

      if (ratedTrips.length > 0) {
        const totalRating = ratedTrips.reduce((sum: number, t: any) => sum + Number(t.user_rating), 0);
        const averageRating = parseFloat((totalRating / ratedTrips.length).toFixed(2));

        await UserRepository.updateUser(userId, '"rating" = $1', [averageRating]);
      }
    }

    if (driverId) {
      // 📈 Update persistent statistics in the drivers table
      await DriverRepository.incrementStats(driverId, trip.total_fare || 0);

      const driver = await DriverRepository.findById(driverId);

      // Check if driver has ANY remaining upcoming scheduled rides
      const upcoming = await query(
        "SELECT trip_id FROM trips WHERE driver_id = $1 AND trip_status = 'ACCEPTED' AND booking_type = 'SCHEDULED'",
        [driverId]
      );

      await DriverRepository.update(driverId, {
        availability: {
          ...driver?.availability,
          status:
            upcoming.rows.length > 0
              ? DriverAvailabilityStatus.HAS_UPCOMING_SCHEDULED
              : DriverAvailabilityStatus.ONLINE,
        },
      });

      // 🏆 Referral Reward Trigger
      // Check if this was the driver's first trip and process referral if applicable
      DriverReferralService.processReferralReward(driverId).catch((err) => {
        logger.error('Error processing referral reward:', err);
      });
    }
    try {
      const fcmToken = trip.user_id ? await UserRepository.getFcmTokenById(trip.user_id) : null;
      const driverfcmtoken = trip.driver_id
        ? await DriverRepository.getFcmTokenById(trip.driver_id)
        : null;
      if (fcmToken) {
        await UserNotifications.rideCompleted(
          fcmToken,
          trip.trip_id || '',
          String(trip.total_fare || 0)
        );
      }
      if (driverfcmtoken) {
        await DriverNotifications.rideCompleted(
          driverfcmtoken,
          trip.trip_id || '',
          String(trip.total_fare || 0)
        );
      }
    } catch (err: any) {
      logger.error(`Failed to notify user about ride completion: ${err.message}`);
    }

    // Referral Rewards Trigger
    try {
      if (trip.user_id) {
        const rideCount = await TripRepository.getCompletedRideCount(trip.user_id);
        if (rideCount === 1) {
          // First completed ride
          const relationship = await ReferralRepository.getReferralRelationshipByReferred(
            trip.user_id
          );
          if (relationship && relationship.status === 'PENDING') {
            await ReferralService.completeReferral(
              relationship.id,
              trip.user_id,
              trip.total_fare || 0
            );
            logger.info(`Referral reward processed for user ${trip.user_id} on their first ride.`);
          }
        }
      }
    } catch (refError) {
      logger.error('Error processing referral reward on completion:', refError);
    }

    // 🎫 Mark Coupon as Used
    try {
      if (trip.user_id && trip.applied_coupon_id) {
        await CouponService.markAsUsed(
          trip.applied_coupon_id,
          trip.user_id,
          trip.trip_id!,
          trip.discount || 0
        );
      }
    } catch (couponError) {
      logger.error('Error marking coupon as used on completion:', couponError);
    }

    const updatedTrip = await TripRepository.findById(tripId);

    // broadcastTripUpdate(tripId, { status: TripStatus.COMPLETED, type: 'trip_updated', trip: updatedTrip });

    try {
      emitTripUpdate(tripId, TripSocketEvent.TRIP_COMPLETED, {
        tripId,
        status: TripStatus.COMPLETED,
        trip: updatedTrip,
      });
    } catch (err: any) {
      logger.error(`Failed to emit trip completion: ${err.message}`);
    }

    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },

  async arrivingTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    await this.updateTrip(tripId, {
      trip_status: TripStatus.ARRIVING,
    });

    const driver = trip.driver_id ? await DriverRepository.findById(trip.driver_id) : null;
    // Notify User
    try {
      const fcmToken = await UserRepository.getFcmTokenById(trip.user_id);
      if (fcmToken) {
        await UserNotifications.driverArriving(fcmToken, driver?.full_name || 'Driver', tripId);
      }
    } catch (err: any) {
      logger.error(`Failed to notify user about driver arriving: ${err.message}`);
    }

    const updatedTrip = await TripRepository.findById(tripId);

    try {
      emitTripUpdate(tripId, TripSocketEvent.TRIP_UPDATED, {
        tripId,
        status: TripStatus.ARRIVING,
        trip: updatedTrip,
      });
    } catch (err: any) {
      logger.error(`Failed to emit trip arriving update: ${err.message}`);
    }

    return updatedTrip;
  },

  async arrivedTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    await this.updateTrip(tripId, {
      trip_status: TripStatus.ARRIVED,
    });

    const driver = trip.driver_id ? await DriverRepository.findById(trip.driver_id) : null;
    // Notify User
    try {
      const fcmToken = await UserRepository.getFcmTokenById(trip.user_id);
      if (fcmToken) {
        await UserNotifications.driverArrived(fcmToken, driver?.full_name || 'Driver', tripId);
      }
    } catch (err: any) {
      logger.error(`Failed to notify user about driver arrival: ${err.message}`);
    }

    const updatedTrip = await TripRepository.findById(tripId);

    // broadcastTripUpdate(tripId, { status: TripStatus.ARRIVED, type: 'trip_updated', trip: updatedTrip });

    try {
      emitTripUpdate(tripId, TripSocketEvent.TRIP_UPDATED, {
        tripId,
        status: TripStatus.ARRIVED,
        trip: updatedTrip,
      });
    } catch (err: any) {
      logger.error(`Failed to emit trip arrival: ${err.message}`);
    }

    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },

  async destinationReachedTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    const isRoundOrOutstation = trip.ride_type === 'ROUND_TRIP' || trip.ride_type === 'OUTSTATION_ROUND_TRIP' || trip.ride_type === 'OUTSTATION_ONE_WAY';
    const newStatus = isRoundOrOutstation ? TripStatus.WAITING : TripStatus.DESTINATION_REACHED;

    const updateData: Partial<Trip> = {
      trip_status: newStatus,
    };
    if (isRoundOrOutstation) {
      updateData.wait_started_at = new Date();
    }

    await this.updateTrip(tripId, updateData);

    const driver = trip.driver_id ? await DriverRepository.findById(trip.driver_id) : null;
    // Notify User
    try {
      const fcmToken = await UserRepository.getFcmTokenById(trip.user_id);
      if (fcmToken) {
        // Notification message differentiates via frontend parsing, but here we just send standard destinationReached
        await UserNotifications.destinationReached(fcmToken, driver?.full_name || 'Driver', tripId);
      }
    } catch (err: any) {
      logger.error(`Failed to notify user about driver arrival: ${err.message}`);
    }

    const updatedTrip = await TripRepository.findById(tripId);

    try {
      emitTripUpdate(tripId, isRoundOrOutstation ? TripSocketEvent.TRIP_UPDATED : TripSocketEvent.DESTINATION_REACHED, {
        tripId,
        status: newStatus,
        trip: updatedTrip,
      });
    } catch (err: any) {
      logger.error(`Failed to emit trip arrival: ${err.message}`);
    }

    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },


  async haltDayTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    if (trip.ride_type !== 'OUTSTATION_ONE_WAY' && trip.ride_type !== 'OUTSTATION_ROUND_TRIP') {
      throw { statusCode: 400, message: 'Day halt is only available for outstation trips.' };
    }
    if (trip.trip_status === TripStatus.DAY_HALT) {
      return trip; // Already halted
    }
    if (trip.trip_status !== TripStatus.WAITING) {
      throw { statusCode: 400, message: 'Can only halt day from WAITING status.' };
    }

    await this.updateTrip(tripId, {
      trip_status: TripStatus.DAY_HALT,
      day_halt_started_at: new Date(),
    });

    const updatedTrip = await TripRepository.findById(tripId);
    try {
      emitTripUpdate(tripId, TripSocketEvent.TRIP_UPDATED, {
        tripId,
        status: TripStatus.DAY_HALT,
        trip: updatedTrip,
      });
    } catch (err) { }
    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },

  async resumeDayTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    if (trip.ride_type !== 'OUTSTATION_ONE_WAY' && trip.ride_type !== 'OUTSTATION_ROUND_TRIP') {
      throw { statusCode: 400, message: 'Resume is only available for outstation trips.' };
    }
    if (trip.trip_status === TripStatus.WAITING) {
      return trip; // Already resumed
    }
    if (trip.trip_status !== TripStatus.DAY_HALT) {
      throw { statusCode: 400, message: 'Can only resume from DAY_HALT status.' };
    }

    await this.updateTrip(tripId, {
      trip_status: TripStatus.WAITING,
    });

    const updatedTrip = await TripRepository.findById(tripId);
    try {
      emitTripUpdate(tripId, TripSocketEvent.TRIP_UPDATED, {
        tripId,
        status: TripStatus.WAITING,
        trip: updatedTrip,
      });
    } catch (err) { }
    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },

  async waitingTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    await this.updateTrip(tripId, {
      trip_status: TripStatus.WAITING,
    });

    const updatedTrip = await TripRepository.findById(tripId);

    try {
      emitTripUpdate(tripId, TripSocketEvent.WAITING, {
        tripId,
        status: TripStatus.WAITING,
        trip: updatedTrip,
      });
    } catch (err: any) {
      logger.error(`Failed to emit waiting: ${err.message}`);
    }

    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },

  async returnStartTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    await this.updateTrip(tripId, {
      trip_status: TripStatus.RETURN_STARTED,
    });

    const updatedTrip = await TripRepository.findById(tripId);

    try {
      emitTripUpdate(tripId, TripSocketEvent.RETURN_STARTED, {
        tripId,
        status: TripStatus.RETURN_STARTED,
        trip: updatedTrip,
      });
    } catch (err: any) {
      logger.error(`Failed to emit return started: ${err.message}`);
    }

    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },

  async returnReachedTrip(tripId: string) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    await this.updateTrip(tripId, {
      trip_status: TripStatus.RETURN_REACHED,
    });

    const updatedTrip = await TripRepository.findById(tripId);

    try {
      emitTripUpdate(tripId, TripSocketEvent.RETURN_REACHED, {
        tripId,
        status: TripStatus.RETURN_REACHED,
        trip: updatedTrip,
      });
    } catch (err: any) {
      logger.error(`Failed to emit return reached: ${err.message}`);
    }

    if (updatedTrip) await publishAdminTripUpdate(tripId, updatedTrip.trip_status, updatedTrip.driver_id);
    return updatedTrip;
  },


  async getActiveTrip(driverId: string) {
    return await TripRepository.findActiveByDriverId(driverId);
  },

  async skipTrip(tripId: string, driverId: string) {
    return await TripRepository.skipTrip(tripId, driverId);
  },

  async assignToDriver(tripId: string, driverId: string) {
    const { acquireLock, releaseLock } = require('../../shared/redis');
    // acquireLock() already prefixes keys with "lock:" — don't double it here.
    const lockKey = `assign:${tripId}`;
    let lockAcquired = false;

    try {
      // 🛡️ 1. Acquire Global Lock to prevent duplicate assignments
      lockAcquired = await acquireLock(lockKey, 10); // seconds — assignment is quick
      if (!lockAcquired) {
        throw { statusCode: 429, message: 'Assignment in progress for this trip' };
      }

      // 🔍 2. Verify Trip Availability
      const trip = await TripRepository.findById(tripId);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      if (trip.trip_status !== TripStatus.REQUESTED && trip.trip_status !== TripStatus.ASSIGNED) {
        // If it's already assigned to this driver, that's fine (idempotent)
        if (trip.driver_id === driverId) return trip;
        throw {
          statusCode: 400,
          message: `Trip is no longer available (Status: ${trip.trip_status})`,
        };
      }

      // 🔍 3. Verify Driver Availability
      const driver = await DriverRepository.findById(driverId);
      if (!driver) throw { statusCode: 404, message: 'Driver not found' };
      if (driver.availability?.status === DriverAvailabilityStatus.ON_TRIP) {
        throw { statusCode: 400, message: 'Driver is already on an active trip' };
      }

      // 📝 4. Update Trip status to ASSIGNED
      await this.updateTrip(tripId, {
        driver_id: driverId,
        trip_status: TripStatus.ASSIGNED,
      });

      // 📝 4b. Update Driver status to prevent double-assignment
      await DriverRepository.update(driverId, {
        availability: {
          ...driver.availability,
          status:
            trip.booking_type === 'SCHEDULED'
              ? DriverAvailabilityStatus.HAS_UPCOMING_SCHEDULED
              : DriverAvailabilityStatus.ON_TRIP,
        },
      });

      // 🔄 5. RE-FETCH full details (including passenger names)
      const updatedTrip = await TripRepository.findById(tripId);
      if (!updatedTrip) throw { statusCode: 500, message: 'Failed to retrieve trip after update' };

      // 📡 6. Notify Driver (Consolidated Socket + FCM)
      try {
        const { emitToRoom } = require('../../sockets/socket');
        const { TripSocketEvent } = require('../../sockets/socket.types');

        const roomName = `driver_${String(driverId)}`;
        logger.info(`[SOCKET] Emitting TRIP_ASSIGNED to ${roomName} for trip ${tripId}`);

        emitToRoom(roomName, TripSocketEvent.TRIP_ASSIGNED, {
          ...updatedTrip,
          type: 'TRIP_ASSIGNED',
          status: TripStatus.ASSIGNED,
          trip_id: tripId,
        });

        // 7. FCM for Push Notification/Background wake
        const { NotificationService } = require('../notifications/notification.service');
        const passenger: any = updatedTrip?.user_details || {};

        await NotificationService.sendNotificationToDriver(
          driverId,
          'Ride Assigned to You',
          `Pickup: ${updatedTrip?.pickup_address || 'N/A'} → Drop: ${updatedTrip?.drop_address || 'N/A'}`,
          {
            type: 'ASSIGNED_RIDE',
            trip_id: tripId,
            pickup_address: updatedTrip?.pickup_address || '',
            drop_address: updatedTrip?.drop_address || '',
            total_fare: updatedTrip?.total_fare?.toString() || '₹--',
            ride_type: updatedTrip?.ride_type || '',
            booking_type: updatedTrip?.booking_type || '',
            pickup_lat: updatedTrip?.pickup_lat?.toString() || '',
            pickup_lng: updatedTrip?.pickup_lng?.toString() || '',
            drop_lat: updatedTrip?.drop_lat?.toString() || '',
            drop_lng: updatedTrip?.drop_lng?.toString() || '',
            distance_km: updatedTrip?.distance_km?.toString() || '',
            passenger_name: passenger?.full_name || passenger?.name || 'Passenger',
            passenger_phone: passenger?.phone_number || passenger?.phone || '',
            passenger_rating: passenger?.rating?.toString() || '',
            createdAt: new Date().toISOString(),
          }
        );
      } catch (notifyErr: any) {
        logger.error(`Notification Error in assignToDriver: ${notifyErr.message}`);
      }

      return updatedTrip;
    } finally {
      if (lockAcquired) await releaseLock(lockKey);
    }
  },

  async triggerBroadcast(tripId: string, radius: number, io: Server) {
    const trip = await TripRepository.findById(tripId);
    if (!trip) throw { statusCode: 404, message: 'Trip not found' };

    const { DriverService } = require('../drivers/driver.service');
    const drivers = await DriverService.getAvailableDrivers(
      Number(trip.pickup_lng),
      Number(trip.pickup_lat),
      Number(radius) || 500
    );

    if (!drivers || drivers.length === 0) {
      return { notifiedCount: 0, drivers: [] };
    }

    // requestRideToMultipleDrivers expects tripData as an array of trip objects
    await this.requestRideToMultipleDrivers(io, [trip], drivers);

    return { notifiedCount: drivers.length, drivers };
  },
};
