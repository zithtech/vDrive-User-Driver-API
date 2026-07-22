import { DriverStatus, Address, CreateDriverInput } from './driver.model';
// src/modules/drivers/driver.controller.ts
import { Request, Response, NextFunction } from 'express';
import { DriverService } from './driver.service';
import { successResponse } from '../../shared/errorHandler';
import { Server } from 'socket.io';
import { logger } from '../../shared/logger';
import { TripRepository } from '../trip/trip.repository';
import { formFullName } from '../../utilities/helper';
import { OnboardingStatus, DriverOnboardingStatus, UserStatus } from '../../enums/user.enums';
import { Driver } from './driver.model';
import config from '../../config';

export const DriverController = {
  async addDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const body: CreateDriverInput = {
        first_name: req.body.first_name ?? '',
        last_name: req.body.last_name ?? '',
        full_name: formFullName(req.body.first_name, req.body.last_name) || '',
        phone_number: req.body.phone_number ?? '',
        alternate_contact: req.body.alternate_contact || '',
        date_of_birth: req.body.date_of_birth || null,
        role: req.body.role,
        status: req.body.status || UserStatus.ACTIVE,
        gender: req.body.gender || '',
        email: req.body.email || '',
        device_id: req.body.device_id || '',
        address: req.body.address || '',
        is_vibration_enabled: req.body.is_vibration_enabled ?? true,
      };
      const driver = await DriverService.createDriver(body);
      logger.info(`Driver created: ${driver.driverId}`);
      return successResponse(res, 201, 'Driver created successfully', driver);
    } catch (err: any) {
      logger.error(`Error adding driver: ${err.message}`);
      next(err);
    }
  },

  async updateDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const driver = await DriverService.updateDriver(req.params.id as string, req.body);
      logger.info(`Driver updated: ${req.params.id}`);
      return successResponse(res, 200, 'Driver updated successfully', driver);
    } catch (err: any) {
      logger.error(`Error updating driver ${req.params.id}: ${err.message}`);
      next(err);
    }
  },

  async getDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const driver = await DriverService.getDriverById(req.params.id as string);
      return successResponse(res, 200, 'Driver fetched successfully', driver);
    } catch (err) {
      next(err);
    }
  },

  async getDrivers(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;
      const onboardingStatus = req.query.onboardingStatus as string;

      const drivers = await DriverService.getAllDrivers(limit, offset, status, onboardingStatus);
      return successResponse(res, 200, 'Drivers fetched successfully', drivers);
    } catch (err) {
      next(err);
    }
  },

  async getMe(req: any, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw { statusCode: 401, message: 'Unauthorized' };
      }
      const driver = await DriverService.getDriverById(userId);
      return successResponse(res, 200, 'Driver profile fetched successfully', driver);
    } catch (err) {
      next(err);
    }
  },

  async resetProfile(req: any, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      logger.info(`resetProfile request for user: ${userId}`);
      if (!userId) {
        throw { statusCode: 401, message: 'Unauthorized' };
      }
      await DriverService.resetDriverProfile(userId);
      return successResponse(res, 200, 'Driver profile reset successfully', { success: true });
    } catch (err: any) {
      logger.error(`resetProfile error for user ${req.user?.id}: ${err.message || err}`);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to reset profile data',
        error: err,
      });
    }
  },

  async adminVerifyDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const id = (req.params.id as string).trim();
      logger.info(`Admin manual verification request for driver: ${id}`);

      if (!id) {
        throw { statusCode: 400, message: 'Driver ID is required' };
      }

      await DriverService.verifyDriverDocuments(id);

      return successResponse(
        res,
        200,
        'Driver documents verified and account activated successfully',
        {
          id,
          status: 'active',
          onboarding_status: DriverOnboardingStatus.ACTIVE,
        }
      );
    } catch (err: any) {
      logger.error(`adminVerifyDriver error: ${err.message || err}`);
      next(err);
    }
  },

  async deleteMyAccount(req: Request, res: Response, next: NextFunction) {
    try {
      /**
       * REDESIGN: ACCOUNT DELETION (DANGER ZONE)
       * Triggered from Settings UI.
       * Performs a hard delete of the driver record and all cascaded data.
       */
      const id = (req as any).user?.id;
      if (!id) throw { statusCode: 401, message: 'Unauthorized' };

      await DriverService.deleteDriver(id);
      return successResponse(res, 200, 'Account deleted successfully', { success: true });
    } catch (err) {
      next(err);
    }
  },

  async updateFcmToken(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const userId = (req as any).user?.id;

      // Security: only allow drivers to update their own FCM token
      if (!userId || userId !== driverId) {
        throw { statusCode: 403, message: "Forbidden: cannot update another driver's token" };
      }

      const { fcm_token } = req.body;

      if (!fcm_token) {
        throw { statusCode: 400, message: 'fcm_token is required' };
      }

      await DriverService.updateFcmToken(driverId, fcm_token);
      return successResponse(res, 200, 'FCM token updated successfully', { success: true });
    } catch (err: any) {
      logger.error(`Error updating FCM token for driver ${req.params.id}: ${err.message}`);
      next(err);
    }
  },

  async goOnline(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const result = await DriverService.goOnline(driverId);
      logger.info(`Driver ${driverId} went online`);
      return successResponse(res, 200, 'Driver is now online', result);
    } catch (err: any) {
      logger.error(`Error goOnline for driver ${req.params.id}: ${err.message}`);
      next(err);
    }
  },

  async goOffline(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      await DriverService.goOffline(driverId);
      logger.info(`Driver ${driverId} went offline`);
      return successResponse(res, 200, 'Driver is now offline', { success: true });
    } catch (err: any) {
      logger.error(`Error goOffline for driver ${req.params.id}: ${err.message}`);
      next(err);
    }
  },

  async getRideActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const { from, to, status, limit, offset } = req.query;
      const activity = await TripRepository.findActivityByDriverId(
        driverId,
        from as string,
        to as string,
        status as string,
        limit ? parseInt(limit as string, 10) : undefined,
        offset ? parseInt(offset as string, 10) : undefined
      );
      // Map to frontend expected format
      const mappedActivity = activity.map((trip: any) => {
        let passenger = { name: 'Customer', phone: undefined };
        try {
          if (trip.passenger_details) {
            passenger =
              typeof trip.passenger_details === 'string'
                ? JSON.parse(trip.passenger_details)
                : trip.passenger_details;
          }
        } catch (e) {
          logger.error(`Error parsing passenger_details: ${e}`);
        }

        return {
          id: trip.trip_id || trip.id,
          trip_id: trip.trip_id || trip.id,
          trip_code: trip.trip_code || trip.booking_code,
          date: new Date(trip.created_at).toLocaleDateString(),
          time: new Date(trip.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          pickup: trip.pickup_address,
          drop: trip.drop_address,
          amount: parseFloat(trip.total_fare || '0'),
          distance_km: trip.distance_km,
          distance: trip.distance_km + ' km',
          duration: trip.trip_duration_minutes ? trip.trip_duration_minutes + ' min' : '20 min',
          status:
            trip.trip_status === 'COMPLETED'
              ? 'Completed'
              : trip.trip_status === 'CANCELLED'
                ? 'Cancelled'
                : trip.trip_status,
          payment_method: trip.payment_method,
          payment_status: trip.payment_status,
          rating: trip.rating,
          feedback: trip.feedback,
          customer: {
            name: trip.passenger_name || passenger.name || 'Customer',
            phone: passenger.phone,
          },
        };
      });

      return successResponse(res, 200, 'Ride activity fetched successfully', mappedActivity);
    } catch (err) {
      next(err);
    }
  },

  async getPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const driver = await DriverService.getDriverById(driverId);
      const stats = await TripRepository.getStatsByDriverId(driverId);
      const onlineHours = await DriverService.getOnlineHours(driverId);

      const performance = {
        rating: driver.performance?.averageRating ?? (driver.rating !== undefined && driver.rating !== null ? driver.rating : 4.8),
        acceptanceRate: 98,
        cancellationRate:
          stats.cancelled_trips > 0 ? (stats.cancelled_trips / stats.total_trips) * 100 : 2,
        totalTrips: stats.total_trips || 0,
        onlineHours,
      };

      return successResponse(res, 200, 'Performance metrics fetched successfully', performance);
    } catch (err) {
      next(err);
    }
  },

  async getEarningsSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const stats = await TripRepository.getStatsByDriverId(driverId);

      const summary = {
        totalEarnings: parseFloat(stats.total_earnings || 0),
        tripsCompleted: parseInt(stats.completed_trips || 0),
        totalTrips: parseInt(stats.total_trips || 0),
        cancelledTrips: parseInt(stats.cancelled_trips || 0),
        avgPerTrip: stats.completed_trips > 0 ? stats.total_earnings / stats.completed_trips : 0,
        tips: 450,
      };

      return successResponse(res, 200, 'Earnings summary fetched successfully', summary);
    } catch (err) {
      next(err);
    }
  },

  async getWalletBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const driver = await DriverService.getDriverById(driverId);
      return successResponse(res, 200, 'Wallet balance fetched successfully', {
        balance: driver.credit?.balance || 0,
        currency: 'INR',
      });
    } catch (err) {
      next(err);
    }
  },

  async getEarningsTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const activity = await TripRepository.findActivityByDriverId(driverId);

      const transactions = activity
        .filter((t: any) => t.trip_status === 'COMPLETED' || t.trip_status === 'MID_CANCELLED')
        .map((t: any) => ({
          id: t.trip_id || t.id,
          trip_id: t.trip_id || t.id,
          trip_code: t.trip_code || t.booking_code,
          title: t.trip_status === 'COMPLETED' ? 'Ride Earnings' : 'Cancellation Fee',
          amount: parseFloat(t.total_fare || '0'),
          date: new Date(t.created_at).toLocaleDateString(),
          time: new Date(t.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          pickup: t.pickup_address,
          drop: t.drop_address,
          distance: t.distance_km ? `${t.distance_km} km` : undefined,
          status: t.trip_status === 'COMPLETED' ? 'Completed' : 'Cancelled',
          payment_method: t.payment_method,
        }));

      return successResponse(res, 200, 'Earnings transactions fetched successfully', transactions);
    } catch (err) {
      next(err);
    }
  },

  async getWalletTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const driver = await DriverService.getDriverById(driverId);
      return successResponse(res, 200, 'Wallet transactions fetched successfully', {
        data: driver.creditUsage || [],
      });
    } catch (err) {
      next(err);
    }
  },

  async findNearbyDrivers(req: Request, res: Response) {
    try {
      const io = req.app.get('io');
      const { lng, lat, newTrip, radius } = req.body;
      const drivers = await DriverService.findNearbyDrivers(
        io,
        Number(lng),
        Number(lat),
        newTrip,
        radius ? Number(radius) : 1000
      );

      return res.status(200).json({ success: true, data: drivers });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async getAvailableDriversForAssignment(req: Request, res: Response) {
    try {
      const { lng, lat, radius } = req.body;
      if (!lng || !lat) {
        return res.status(400).json({ success: false, message: 'Missing coordinates' });
      }

      const drivers = await DriverService.getAvailableDrivers(
        Number(lng),
        Number(lat),
        Number(radius) || config.defaultSearchRadius
      );

      return res.status(200).json({ success: true, data: drivers });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateLocation(req: Request, res: Response) {
    try {
      const { driverId, lat, lng, address } = req.body;
      await DriverService.syncLocation(driverId, lat, lng, address);
      return res.status(200).json({ success: true, message: 'Location updated' });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },
  async getTodayOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const overview = await DriverService.getTodayOverview(driverId);
      return successResponse(res, 200, "Today's overview fetched successfully", overview);
    } catch (err) {
      next(err);
    }
  },
};
