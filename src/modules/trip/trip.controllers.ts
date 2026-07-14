import { Request, Response, NextFunction } from 'express';
import { TripService } from './trip.service';
import { successResponse } from '../../shared/errorHandler';
import { Trip } from './trip.model';
import { logger } from '../../shared/logger';
import { cleanUndefined } from '../../utilities/helper';
import { notifyAdmin } from '../../shared/eventBus';
import { DriverNotifications, UserNotifications } from '../notifications';
import { UserRepository } from '../users/user.repository';
import { DriverRepository } from '../drivers/driver.repository';

import { v4 as uuidv4 } from 'uuid';
import { RideType, ServiceType, BookingType, TripStatus, CancelBy } from '../../enums/trip.enums';
import { emitTripUpdate } from '../../sockets/socket';

export const TripController = {
  //user-driver
  async getTrips(req: Request, res: Response, next: NextFunction) {
    try {
      const { booking_type } = req.query;
      const driverId = (req as any).user?.id;
      let onboardingStatus = (req as any).user?.onboarding_status;

      if (!onboardingStatus && driverId) {
        const driver = await DriverRepository.findById(driverId);
        onboardingStatus = driver?.onboarding_status;
      }

      const trips = await TripService.getTrips(booking_type as string, driverId, onboardingStatus);
      if (!trips) {
        throw { statusCode: 204, message: 'Trip data are Empty' };
      }
      return successResponse(res, 200, 'Trips fetched successfully', trips);
    } catch (err: any) {
      logger.error(`getTrips error: ${err.message}`);
      next(err);
    }
  },

  async getTripById(req: Request, res: Response, next: NextFunction) {
    try {
      const trip = await TripService.getTripById(req?.params?.id as string);
      return successResponse(res, 200, 'Trip fetched successfully', trip);
    } catch (err: any) {
      logger.error(`getTripById error: ${err.message}`);
      next(err);
    }
  },

  async getTripByUserId(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req?.params?.id as string;
      const role = req.body.role as string;
      const limit = req.body.limit ? parseInt(req.body.limit, 10) : undefined;
      const tab = req.body.tab as string | undefined;
      const tripData = await TripService.getTripByUserId(id, role, limit, tab);
      return successResponse(res, 200, 'Trip fetched successfully', tripData);
    } catch (err: any) {
      logger.error(`getTripById error: ${err.message}`);
      next(err);
    }
  },

  async createTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { coupon_code, ...tripDataRaw } = req.body;
      const tripData = {
        ...tripDataRaw,
        created_by: (req as any).adminId,
      };
      const trip = await TripService.createTrip(tripData, coupon_code);
      notifyAdmin('NEW_TRIP', {
        id: trip.trip_id,
        userId: trip.user_id,
        pickupLocation: trip.pickup_address,
        dropoffLocation: trip.drop_address,
        status: trip.trip_status,
        createdAt: trip.created_at,
      });
      const userfcmtoken = await UserRepository.getFcmTokenById(trip.user_id);
      if (userfcmtoken && trip.trip_id) {
        await UserNotifications.bookingConfirmed(userfcmtoken, trip.trip_id);
      }

      // If live ride, broadcast to nearby drivers (Expanding search)
      if (trip.booking_type === BookingType.LIVE) {
        const { DriverService } = require('../drivers/driver.service');
        const io = req.app.get('io');
        DriverService.findNearbyDrivers(
          io,
          Number(trip.pickup_lng),
          Number(trip.pickup_lat),
          trip
        ).catch((err: any) =>
          logger.error(`Automatic broadcast failed for trip ${trip.trip_id}: ${err.message}`)
        );
      }

      // If scheduled ride, broadcast to all eligible drivers (Online & Offline)
      if (trip.booking_type === BookingType.SCHEDULED) {
        const { TripSchedulerService } = require('./trip-scheduler.service');
        const io = req.app.get('io');
        await TripSchedulerService.broadcastNewScheduledRide(trip, io);
      }

      return successResponse(res, 201, 'Trip created successfully', trip);
    } catch (err: any) {
      logger.error(`createTrip error: ${err.message}`);
      next(err);
    }
  },

  async updateTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const updateTripData: Partial<Trip> = {
        driver_id: req.body.driver_id,
        ride_type: req.body?.ride_type,
        vehicle_id: req.body.vehicle_id,
        trip_status: req.body.trip_status,
        scheduled_start_time: req.body?.scheduled_start_time,
        pickup_address: req.body?.pickup_address,
        drop_address: req.body?.drop_address,
        actual_pickup_time: req.body.actual_pickup_time,
        actual_drop_time: req.body.actual_drop_time,
        trip_duration_minutes: req.body.trip_duration_minutes,
        waiting_time_minutes: req.body.waiting_time_minutes,
        waiting_charges: req.body.waiting_charges,
        driver_allowance: req.body.driver_allowance,
        total_fare: req.body.total_fare,
        paid_amount: req.body.paid_amount,
        payment_status: req.body.payment_status,
        cancel_reason: req.body.cancel_reason,
        cancel_by: req.body.cancel_by,
        notes: req.body.notes,
        rating: req.body.rating,
        feedback: req.body.feedback,
        re_route_id: req.body.re_route_id,
        updated_by: (req as any).adminId,
        vehicle_model: req.body.vehicle_model,
        vehicle_type: req.body.vehicle_type,
        transmission_type: req.body.transmission_type,
      };

      const updateData = cleanUndefined(updateTripData);

      if (!Object.keys(updateData).length) {
        throw { statusCode: 400, message: 'At least one field must be provided to update' };
      }

      const updatedTrip = await TripService.updateTrip(id as string, updateData);

      if (!updatedTrip) {
        throw { statusCode: 400, message: 'Trip not found' };
      }

      return successResponse(res, 200, 'Trip updated successfully', updatedTrip);
    } catch (err: any) {
      logger.error(`updateTrip error: ${err.message}`);
      next(err);
    }
  },

  async getActiveTripByUserId(req: Request, res: Response, next: NextFunction) {
    try {
      const trip = await TripService.getActiveTripByUserId(req?.params?.id as string);
      return successResponse(res, 200, 'Trip fetched successfully', trip);
    } catch (err: any) {
      logger.error(`getTripById error: ${err.message}`);
      next(err);
    }
  },

  async cancelTrip(req: Request, res: Response) {
    const { id } = req.params;
    const { trip_status, cancel_reason, cancel_by, notes } = req.body;
    const io = req.app.get('io');

    try {
      const trip = await TripService.cancelTrip(
        id as string,
        trip_status,
        cancel_reason,
        cancel_by,
        notes
      );
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
        cancelReason: trip.cancel_reason,
        cancelledBy: trip.cancel_by,
      });
      const userfcmtoken = trip.user_id ? await UserRepository.getFcmTokenById(trip.user_id) : null;

      const driverfcmtoken = trip.driver_id
        ? await DriverRepository.getFcmTokenById(trip.driver_id)
        : null;

      if (cancel_by === CancelBy.USER) {
        if (userfcmtoken && trip.trip_id) {
          await UserNotifications.bookingCancelled(userfcmtoken, trip.trip_id, notes || '');
        }
        // ✅ guard driverfcmtoken before passing
        if (driverfcmtoken && trip.trip_id) {
          await DriverNotifications.rideCancelled(driverfcmtoken, trip.trip_id);
        }
      } else if (cancel_by === CancelBy.DRIVER) {
        if (driverfcmtoken && trip.trip_id) {
          await DriverNotifications.bookingCancelled(driverfcmtoken, trip.trip_id, notes || '');
        }
        // ✅ guard userfcmtoken before passing
        if (userfcmtoken && trip.trip_id) {
          await UserNotifications.rideCancelled(userfcmtoken, trip.trip_id);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Trip cancelled successfully',
        data: trip,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Could not cancel trip' });
    }
  },

  async assignDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { driver_id, vehicle_id } = req.body;

      if (!driver_id) throw { statusCode: 400, message: 'driver_id is required' };

      const trip = await TripService.updateTrip(id as string, {
        driver_id,
        vehicle_id,
        trip_status: TripStatus.ASSIGNED,
      });

      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
      });

      return successResponse(res, 200, 'Driver assigned successfully', trip);
    } catch (err: any) {
      logger.error(`assignDriver error: ${err.message}`);
      next(err);
    }
  },

  async acceptTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const driverId = req.body.driver_id || (req as any).user?.id;
      if (!driverId) throw { statusCode: 400, message: 'driver_id is required' };

      const trip = await TripService.acceptTrip(id as string, driverId);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_ACCEPTED', {
        id: trip.trip_id,
        driverId: trip.driver_id,
        status: trip.trip_status,
      });
      return successResponse(res, 200, 'Trip accepted successfully', trip);
    } catch (err: any) {
      logger.error(`acceptTrip error: ${err.message}`);
      next(err);
    }
  },

  async startTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const trip = await TripService.startTrip(id as string);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
      });
      return successResponse(res, 200, 'Trip started successfully', trip);
    } catch (err: any) {
      logger.error(`startTrip error: ${err.message}`);
      next(err);
    }
  },

  async completeTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { distance_km, trip_duration_minutes } = req.body;
      const trip = await TripService.completeTrip(id as string, distance_km, trip_duration_minutes);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
        totalFare: trip.total_fare,
      });
      return successResponse(res, 200, 'Trip completed successfully', trip);
    } catch (err: any) {
      logger.error(`completeTrip error: ${err.message}`);
      next(err);
    }
  },

  async arrivedTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const trip = await TripService.arrivedTrip(id as string);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
      });
      return successResponse(res, 200, 'Driver arrived at pickup successfully', trip);
    } catch (err: any) {
      logger.error(`arrivedTrip error: ${err.message}`);
      next(err);
    }
  },

  async arrivingTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const trip = await TripService.arrivingTrip(id as string);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
      });
      return successResponse(res, 200, 'Driver is arriving at pickup', trip);
    } catch (err: any) {
      logger.error(`arrivingTrip error: ${err.message}`);
      next(err);
    }
  },

  async destinationReachedTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const trip = await TripService.destinationReachedTrip(id as string);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
      });
      return successResponse(res, 200, 'Driver reached destination successfully', trip);
    } catch (err: any) {
      logger.error(`destinationReachedTrip error: ${err.message}`);
      next(err);
    }
  },

  async startReturnTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const trip = await TripService.startReturnTrip(id as string);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
      });
      return successResponse(res, 200, 'Return trip started successfully', trip);
    } catch (err: any) {
      logger.error(`startReturnTrip error: ${err.message}`);
      next(err);
    }
  },

  async returnReachedTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const trip = await TripService.returnReachedTrip(id as string);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
      });
      return successResponse(res, 200, 'Return destination reached successfully', trip);
    } catch (err: any) {
      logger.error(`returnReachedTrip error: ${err.message}`);
      next(err);
    }
  },

  //Admin
  async getAllTripsWithChanges(req: Request, res: Response, next: NextFunction) {
    try {
      const trips = await TripService.getAllTripsWithChanges();
      if (!trips) {
        throw { statusCode: 204, message: 'Trip data are Empty' };
      }
      return successResponse(res, 200, 'Trips fetched successfully', trips);
    } catch (err: any) {
      logger.error(`getTrips error: ${err.message}`);
      next(err);
    }
  },

  //TripChanges
  async createTripChanges(req: Request, res: Response, next: NextFunction) {
    try {
      const tripChanges = await TripService.createTripChanges(req.body);
      return successResponse(res, 201, 'Trip Changes created successfully', tripChanges);
    } catch (err: any) {
      logger.error(`createTripChanges error: ${err.message}`);
      next(err);
    }
  },

  async testSimulateScheduled(req: Request, res: Response, next: NextFunction) {
    try {
      const { driver_id, vehicle_id } = req.body;
      if (!driver_id) throw { statusCode: 400, message: 'driver_id is required for simulation' };

      const { DriverRepository } = require('../drivers/driver.repository');
      const driver = await DriverRepository.findById(driver_id);

      if (!driver || !driver.fcm_token) {
        throw { statusCode: 400, message: 'Driver not found or has no FCM token' };
      }

      // 0. Force Verify for testing if requested
      if (req.body.forceVerify) {
        const { TripVerificationService } = require('../drivers/trip-verification.service');
        await TripVerificationService.testForceVerifyDriver(driver_id);
        logger.info(`Driver ${driver_id} force verified for scheduled simulation`);
      }

      // 1. Create a dummy trip in DB
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tripData: Partial<Trip> = {
        trip_id: uuidv4(),
        user_id: 'a5010ad7-c629-4db9-841c-6fd29c8e14a4', // Demo user
        vehicle_id: vehicle_id || null,
        ride_type: RideType.OUTSTATION,
        service_type: ServiceType.DRIVER_ONLY,
        trip_status: TripStatus.REQUESTED,
        scheduled_start_time: tomorrow,
        original_scheduled_start_time: tomorrow,
        pickup_lat: 13.0732,
        pickup_lng: 80.2609,
        pickup_address: 'Egmore, Chennai, Tamil Nadu, India',
        drop_lat: 12.983,
        drop_lng: 80.2594,
        drop_address: 'Thiruvanmiyur, Chennai, Tamil Nadu, India',
        distance_km: 13.9,
        base_fare: 300.0,
        driver_allowance: 99.95,
        platform_fee: 1.0,
        total_fare: 399.95,
        booking_type: BookingType.SCHEDULED,
      };

      const trip = await TripService.createTrip(tripData);

      // 2. Dispatch FCM specifically to this driver
      const { NotificationService } = require('../notifications/notification.service');

      await NotificationService.sendNotification(
        driver.fcm_token,
        'Scheduled Ride Request',
        `A new scheduled outstation trip is available.`,
        {
          type: 'ride_request',
          trip_id: trip.trip_id,
          pickup_address: trip.pickup_address,
          drop_address: trip.drop_address,
          pickup_lat: trip.pickup_lat.toString(),
          pickup_lng: trip.pickup_lng.toString(),
          drop_lat: trip.drop_lat.toString(),
          drop_lng: trip.drop_lng.toString(),
          total_fare: trip.total_fare?.toString() || '₹--',
          distance_km: trip.distance_km?.toString() + ' km',
          trip_duration_minutes: trip.trip_duration_minutes?.toString() + ' min',
          ride_type: trip.ride_type,
          booking_type: trip.booking_type,
          service_type: trip.service_type,
          otp: trip.otp || '',
          scheduled_start_time: trip.scheduled_start_time?.toISOString() || '',
        }
      );

      return successResponse(
        res,
        200,
        'Simulated scheduled trip created and dispatched to driver',
        trip
      );
    } catch (err: any) {
      logger.error(`testSimulateScheduled error: ${err.message}`);
      next(err);
    }
  },

  async testSimulateLive(req: Request, res: Response, next: NextFunction) {
    try {
      const { driver_id, vehicle_id } = req.body;
      if (!driver_id) throw { statusCode: 400, message: 'driver_id is required for simulation' };

      const { DriverRepository } = require('../drivers/driver.repository');
      const driver = await DriverRepository.findById(driver_id);

      if (!driver || !driver.fcm_token) {
        throw { statusCode: 400, message: 'Driver not found or has no FCM token' };
      }

      // 0. Force Verify for testing if requested
      if (req.body.forceVerify) {
        const { TripVerificationService } = require('../drivers/trip-verification.service');
        await TripVerificationService.testForceVerifyDriver(driver_id);
        logger.info(`Driver ${driver_id} force verified for live simulation`);
      }

      // 1. Create a dummy trip in DB
      const tripData: Partial<Trip> = {
        trip_id: uuidv4(),
        user_id: 'a5010ad7-c629-4db9-841c-6fd29c8e14a4',
        vehicle_id: vehicle_id || null,
        ride_type: RideType.ONE_WAY,
        service_type: ServiceType.DRIVER_ONLY,
        trip_status: TripStatus.REQUESTED,
        scheduled_start_time: new Date(),
        original_scheduled_start_time: new Date(),
        pickup_lat: 13.0732,
        pickup_lng: 80.2609,
        pickup_address: 'Egmore, Chennai, Tamil Nadu, India',
        drop_lat: 12.983,
        drop_lng: 80.2594,
        drop_address: 'Thiruvanmiyur, Chennai, Tamil Nadu, India',
        distance_km: 13.9,
        base_fare: 300.0,
        driver_allowance: 99.95,
        platform_fee: 1.0,
        total_fare: 399.95,
        booking_type: BookingType.LIVE,
      };

      const trip = await TripService.createTrip(tripData);

      // 2. Dispatch FCM specifically to this driver
      const { NotificationService } = require('../notifications/notification.service');

      await NotificationService.sendNotification(
        driver.fcm_token,
        'New Ride Request',
        `A passenger requested a ride near you.`,
        {
          type: 'ride_request',
          trip_id: trip.trip_id,
          pickup_address: trip.pickup_address,
          drop_address: trip.drop_address,
          pickup_lat: trip.pickup_lat.toString(),
          pickup_lng: trip.pickup_lng.toString(),
          drop_lat: trip.drop_lat.toString(),
          drop_lng: trip.drop_lng.toString(),
          total_fare: trip.total_fare?.toString() || '₹--',
          distance_km: trip.distance_km?.toString() + ' km',
          trip_duration_minutes: trip.trip_duration_minutes?.toString() + ' min',
          ride_type: trip.ride_type,
          booking_type: trip.booking_type,
          service_type: trip.service_type,
          otp: trip.otp || '',
        }
      );

      return successResponse(
        res,
        200,
        'Simulated live trip created and dispatched to driver',
        trip
      );
    } catch (err: any) {
      logger.error(`testSimulateLive error: ${err.message}`);
      next(err);
    }
  },

  async getActiveTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) throw { statusCode: 401, message: 'Unauthorized' };

      let tripData: any = null;

      if (user.role === 'DRIVER') {
        const driverId = req.query.driver_id || user.id;
        tripData = await TripService.getActiveTrip(driverId as string);
      } else if (user.role === 'USER') {
        const userId = req.query.user_id || user.id;
        const trips = await TripService.getActiveTripByUserId(userId as string);
        if (trips?.activeTrips?.length > 0) {
          tripData = trips.activeTrips[0];
        }
      }

      return successResponse(res, 200, 'Active trip fetched successfully', tripData);
    } catch (err: any) {
      logger.error(`getActiveTrip error: ${err.message}`);
      next(err);
    }
  },

  async getTripLocationHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { LocationHistoryRepository } = require('../drivers/locationHistory.repository');

      const [points, summary] = await Promise.all([
        LocationHistoryRepository.getByTripId(id as string),
        LocationHistoryRepository.getTripRouteSummary(id as string),
      ]);

      return successResponse(res, 200, 'Trip location history fetched', {
        trip_id: id,
        total_points: points.length,
        summary,
        points,
      });
    } catch (err: any) {
      logger.error(`getTripLocationHistory error: ${err.message}`);
      next(err);
    }
  },

  async skipTrip(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: tripId } = req.params;
      const driverId = (req as any).user?.id;

      if (!driverId) throw { statusCode: 401, message: 'Driver authentication failed' };

      await TripService.skipTrip(tripId as string, driverId);
      return successResponse(res, 200, 'Trip skipped successfully');
    } catch (err: any) {
      logger.error(`skipTrip error: ${err.message}`);
      next(err);
    }
  },

  async updateTripStatusController(req: Request, res: Response) {
    const { trip_id, trip_status } = req.body;
    const io = req.app.get('io');

    try {
      const trip = await TripService.updateTripStatus(io, trip_id, trip_status);
      if (!trip) throw { statusCode: 404, message: 'Trip not found' };

      notifyAdmin('TRIP_STATUS_UPDATE', {
        id: trip.trip_id,
        status: trip.trip_status,
      });

      return res.status(200).json({
        success: true,
        message: 'Trip status updated successfully',
        trip,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Could not update trip' });
    }
  },

  async assignToDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { driver_id } = req.body;
      if (!driver_id) throw { statusCode: 400, message: 'driver_id is required' };

      const trip = await TripService.assignToDriver(id as string, driver_id);
      return successResponse(
        res,
        200,
        'Trip assigned to driver successfully. Waiting for acceptance.',
        trip
      );
    } catch (err: any) {
      logger.error(`assignToDriver error: ${err.message}`);
      next(err);
    }
  },

  async triggerBroadcast(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { radius } = req.body;
      const io = req.app.get('io');

      const result = await TripService.triggerBroadcast(id as string, Number(radius), io);

      return successResponse(res, 200, `Broadcasted to ${result.notifiedCount} drivers`, result);
    } catch (err: any) {
      logger.error(`triggerBroadcast error: ${err.message}`);
      next(err);
    }
  },
};
