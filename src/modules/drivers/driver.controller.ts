import { DriverStatus, Address, CreateDriverInput } from './driver.model';
// src/modules/drivers/driver.controller.ts
import { Request, Response, NextFunction } from 'express';
import { DriverService } from './driver.service';
import { DriverRepository } from './driver.repository';
import { successResponse, errorResponse } from '../../shared/errorHandler';
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

      const acceptedTrips = parseInt(stats.accepted_trips || '0');
      const rejectedTrips = parseInt(stats.rejected_trips || '0');
      const cancelledTrips = parseInt(stats.cancelled_trips || '0');
      const completedTrips = parseInt(stats.completed_trips || '0');
      
      const totalOfferedTrips = acceptedTrips + rejectedTrips;
      const acceptanceRate = totalOfferedTrips > 0 ? (acceptedTrips / totalOfferedTrips) * 100 : 0;
      
      const totalTrips = acceptedTrips;

      const performance = {
        rating: driver.performance?.averageRating ?? (driver.rating !== undefined && driver.rating !== null ? driver.rating : 4.8),
        acceptanceRate: Math.round(acceptanceRate),
        cancellationRate: totalTrips > 0 ? (cancelledTrips / totalTrips) * 100 : 0,
        totalTrips: totalTrips,
        onlineHours,
        performance_score_monthly: driver.performance?.performance_score_monthly ?? null,
        performance_score_weekly: driver.performance?.performance_score_weekly ?? null,
        overall_score: driver.performance?.overall_score ?? null,
      };

      return successResponse(res, 200, 'Performance metrics fetched successfully', performance);
    } catch (err) {
      next(err);
    }
  },

  async updatePerformancePercentile(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const { score, timeframe } = req.body;

      if (typeof score !== 'number' || score < 0 || score > 100) {
        return errorResponse(res, 400, 'Invalid score provided');
      }

      const validTimeframe = timeframe === 'week' ? 'week' : 'month';

      await DriverRepository.updatePerformanceScore(driverId, score, validTimeframe);
      const percentile = await DriverRepository.calculatePercentile(score, validTimeframe);

      return successResponse(res, 200, 'Percentile calculated successfully', { percentile });
    } catch (err) {
      next(err);
    }
  },

  async getEarningsSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      const stats = await TripRepository.getStatsByDriverId(driverId, from, to);

      const completedTrips = parseInt(stats.completed_trips || '0');
      const totalEarnings = parseFloat(stats.total_earnings || '0');
      const totalHours = parseFloat(stats.total_hours || '0');
      const avgPerTrip = completedTrips > 0 ? Math.round((totalEarnings / completedTrips) * 100) / 100 : 0;

      // Calculate growth % by comparing against the equivalent previous period
      let growth: { earnings?: number; trips?: number; hours?: number; avgPerTrip?: number } = {};

      if (from && to) {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const durationMs = toDate.getTime() - fromDate.getTime();
        const prevFrom = new Date(fromDate.getTime() - durationMs).toISOString();
        const prevTo = fromDate.toISOString();

        const prevStats = await TripRepository.getStatsByDriverId(driverId, prevFrom, prevTo);
        const prevEarnings = parseFloat(prevStats.total_earnings || '0');
        const prevTrips = parseInt(prevStats.completed_trips || '0');
        const prevHours = parseFloat(prevStats.total_hours || '0');
        const prevAvg = prevTrips > 0 ? prevEarnings / prevTrips : 0;

        const calcGrowth = (curr: number, prev: number): number | null => {
          if (prev === 0) return curr > 0 ? 100 : 0;
          return Math.round(((curr - prev) / prev) * 10000) / 100;
        };

        growth = {
          earnings: calcGrowth(totalEarnings, prevEarnings) ?? undefined,
          trips: calcGrowth(completedTrips, prevTrips) ?? undefined,
          hours: calcGrowth(totalHours, prevHours) ?? undefined,
          avgPerTrip: calcGrowth(avgPerTrip, prevAvg) ?? undefined,
        };
      }

      // Aggregate chart data
      const rawChartData = await TripRepository.getEarningsChartData(driverId, from, to);
      const chartMap = new Map<string, number>();

      const getFilterType = () => {
        if (!from || !to) return 'lifetime';
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays <= 2) return 'today'; // usually 1 day
        if (diffDays <= 8) return 'week';  // usually 7 days
        return 'month';
      };

      const filterType = getFilterType();

      // Pre-fill chartMap to ensure X-axis is always stable even if there are no trips for a specific block
      if (filterType === 'today') {
        const blocks = ['12am', '4am', '8am', '12pm', '4pm', '8pm'];
        blocks.forEach(b => chartMap.set(b, 0));
      } else if (filterType === 'week') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // Align to current day ordering if needed, but standard Sun-Sat is fine
        days.forEach(d => chartMap.set(d, 0));
      } else if (filterType === 'month') {
        const dates = ['1', '5', '10', '15', '20', '25', '30'];
        dates.forEach(d => chartMap.set(d, 0));
      } else {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        months.forEach(m => chartMap.set(m, 0));
      }

      rawChartData.forEach(trip => {
        const d = new Date(trip.ended_at);
        let key = '';
        if (filterType === 'today') {
          const hour = d.getHours();
          const block = Math.floor(hour / 4) * 4;
          key = `${block === 0 ? 12 : block > 12 ? block - 12 : block}${block >= 12 ? 'pm' : 'am'}`;
        } else if (filterType === 'week') {
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          key = days[d.getDay()];
        } else if (filterType === 'month') {
          // Snap the actual date to one of our intervals: 1, 5, 10, 15, 20, 25, 30
          const date = d.getDate();
          if (date < 5) key = '1';
          else if (date < 10) key = '5';
          else if (date < 15) key = '10';
          else if (date < 20) key = '15';
          else if (date < 25) key = '20';
          else if (date < 30) key = '25';
          else key = '30';
        } else {
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          key = months[d.getMonth()];
        }
        
        if (chartMap.has(key)) {
          const current = chartMap.get(key) || 0;
          chartMap.set(key, current + parseFloat(trip.total_fare || '0'));
        }
      });

      // Format for UI (Map guarantees insertion order which we established in the pre-fill)
      const chartData: { value: number, label: string }[] = [];
      chartMap.forEach((value, key) => {
        chartData.push({ value, label: key });
      });

      const summary = {
        totalEarnings,
        tripsCompleted: completedTrips,
        totalTrips: parseInt(stats.accepted_trips || '0'),
        cancelledTrips: parseInt(stats.cancelled_trips || '0'),
        avgPerTrip,
        onlineHours: Math.round(totalHours * 100) / 100,
        tips: 0,
        growth,
        chartData,
        earningsBreakdown: {
          baseFare: parseFloat(stats.total_base_fare || '0'),
          extraTiming: parseFloat(stats.total_extra_timing || '0'),
          incentives: 0, // Placeholder
          tips: parseFloat(stats.total_tips || '0'),
        }
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
        balance: driver.wallet_balance || 0,
        currency: 'INR',
      });
    } catch (err) {
      next(err);
    }
  },

  async getEarningsTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const { from, to, limit, offset } = req.query as any;

      // 1. Ride earnings from trips
      const activity = await TripRepository.findActivityByDriverId(
        driverId, from, to, undefined,
        limit ? parseInt(limit) : undefined,
        offset ? parseInt(offset) : undefined
      );

      const rideTransactions = activity
        .filter((t: any) => t.trip_status === 'COMPLETED' || t.trip_status === 'MID_CANCELLED')
        .map((t: any) => ({
          id: t.trip_id || t.id,
          title: t.trip_status === 'COMPLETED' ? 'Ride Earnings' : 'Cancellation Fee',
          subtitle: `Trip #${(t.trip_code || t.booking_code || t.trip_id || t.id || '').toString().slice(-6)}`,
          amount: parseFloat(t.total_fare || '0'),
          date: new Date(t.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }),
          time: new Date(t.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
          type: 'Credit' as const,
          badge: t.payment_method === 'CASH' ? 'Cash' : 'Online',
          icon: 'car',
          source: 'ride' as const,
          tripData: {
            id: t.trip_id || t.id,
            trip_id: t.trip_id || t.id,
            trip_code: t.trip_code || t.booking_code,
            trip_status: t.trip_status,
            total_fare: parseFloat(t.total_fare || '0'),
            base_fare: parseFloat(t.base_fare || '0'),
            distance_fare: parseFloat(t.distance_fare || '0'),
            time_fare: parseFloat(t.time_fare || '0'),
            waiting_charges: parseFloat(t.waiting_charges || '0'),
            tip: parseFloat(t.tip || '0'),
            toll_charges: parseFloat(t.toll_charges || '0'),
            night_charges: parseFloat(t.night_charges || '0'),
            discount: parseFloat(t.discount || '0'),
            pickup_address: t.pickup_address,
            drop_address: t.drop_address,
            distance_km: t.distance_km,
            payment_method: t.payment_method,
            passenger_name: t.passenger_name,
            created_at: t.created_at,
            started_at: t.started_at,
            ended_at: t.ended_at,
          },
          walletData: null,
          createdAt: t.created_at,
        }));

      // 2. Wallet usage (subscription, penalty, topup, etc.)
      const driver = await DriverService.getDriverById(driverId);
      const walletTransactions = (driver.creditUsage || [])
        .filter((u: any) => {
          // Only show wallet debits (subscription, penalty, fees) — exclude topups/credits
          if (Number(u.amount) > 0) return false;
          if (!from && !to) return true;
          const uDate = new Date(u.createdAt);
          if (from && uDate < new Date(from)) return false;
          if (to && uDate > new Date(to)) return false;
          return true;
        })
        .map((u: any) => {
          const desc = (u.description || '').replace(/\[.*?\]\[.*?\]/, '').trim();
          const isCredit = Number(u.amount) > 0;

          // Determine badge based on type or description
          let badge = isCredit ? 'Topup' : 'Fee';
          let icon = isCredit ? 'wallet' : 'card';
          let title = isCredit ? 'Wallet Topup' : 'Wallet Deduction';

          const descLower = desc.toLowerCase();
          if (descLower.includes('subscription') || descLower.includes('plan')) {
            badge = 'Subscription'; icon = 'card'; title = 'Subscription Payment';
          } else if (descLower.includes('penalty') || descLower.includes('fine')) {
            badge = 'Penalty'; icon = 'warning'; title = 'Penalty Charge';
          } else if (descLower.includes('incentive') || descLower.includes('bonus')) {
            badge = 'Incentive'; icon = 'gift'; title = 'Incentive Bonus';
          } else if (descLower.includes('refund')) {
            badge = 'Refund'; icon = 'refresh'; title = 'Refund';
          } else if (desc) {
            title = desc.split(/via/i)[0].trim() || title;
          }

          // Extract payment method
          let paymentMethod: string | undefined;
          if (desc.toLowerCase().includes('via')) {
            paymentMethod = desc.split(/via/i)[1]?.trim();
            if (paymentMethod?.includes(':')) paymentMethod = paymentMethod.split(':')[0].trim();
          }

          const match = (u.description || '').match(/\[(.*?)\]\[(.*?)\]/);

          return {
            id: u.usageId,
            title,
            subtitle: desc || title,
            amount: Number(u.amount),
            date: new Date(u.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }),
            time: new Date(u.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
            type: isCredit ? 'Credit' as const : 'Debit' as const,
            badge,
            icon,
            source: 'wallet' as const,
            tripData: null,
            walletData: {
              id: u.usageId,
              type: u.type || (isCredit ? 'WALLET_TOPUP' : 'WITHDRAW'),
              title,
              date: new Date(u.createdAt).toLocaleDateString(),
              time: new Date(u.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              amount: Number(u.amount),
              status: 'Completed',
              paymentMethod,
              orderId: match?.[1] || u.referenceId || null,
              paymentId: match?.[2] || null,
              createdAt: u.createdAt,
            },
            createdAt: u.createdAt,
          };
        });

      // 3. Merge and sort by date DESC
      const allTransactions = [...rideTransactions, ...walletTransactions]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return successResponse(res, 200, 'Earnings transactions fetched successfully', allTransactions);
    } catch (err) {
      next(err);
    }
  },

  async getWalletTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const driver = await DriverService.getDriverById(driverId);
      
      const transactions = (driver.creditUsage || []).map((u: any) => {
        let paymentMethod;
        let orderId = u.referenceId || null;
        let paymentId = null;
        const desc = u.description || '';
        
        // Extract order/payment ids from description if present
        const match = desc.match(/\[(.*?)\]\[(.*?)\]/);
        if (match) {
           orderId = match[1];
           paymentId = match[2];
        }

        let cleanDesc = desc.replace(/\[.*?\]\[.*?\]/, '').trim();
        if (cleanDesc.toLowerCase().includes('via')) {
          paymentMethod = cleanDesc.split(/via/i)[1].trim();
          if (paymentMethod.includes(':')) {
            paymentMethod = paymentMethod.split(':')[0].trim();
          }
        }

        return {
          id: u.usageId,
          type: u.type || (u.amount > 0 ? 'WALLET_TOPUP' : 'WITHDRAW'),
          title: cleanDesc || (u.amount > 0 ? 'Wallet Topup' : 'Wallet Deduction'),
          date: new Date(u.createdAt).toLocaleDateString(),
          time: new Date(u.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          amount: Number(u.amount),
          status: 'Completed',
          paymentMethod,
          orderId,
          paymentId,
          createdAt: u.createdAt,
        };
      });

      transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return successResponse(res, 200, 'Wallet transactions fetched successfully', transactions);
    } catch (err) {
      next(err);
    }
  },

  async createWalletTopupOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const { amount } = req.body;
      if (!amount || amount <= 0) throw new Error('Invalid amount');

      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const options = {
        amount: Math.round(Number(amount) * 100), // convert to paise
        currency: 'INR',
        receipt: `wallet_${driverId.substring(0, 8)}_${Date.now()}`,
      };

      const order = await razorpay.orders.create(options);
      return successResponse(res, 200, 'Order created successfully', order);
    } catch (err) {
      next(err);
    }
  },

  async verifyWalletTopupPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

      const { PaymentService } = require('../payments/payment.service');
      const isValid = await PaymentService.verifyWalletTopupSignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        driverId,
        amount: Number(amount),
      });

      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Invalid signature' });
      }

      return successResponse(res, 200, 'Payment verified successfully', null);
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
      const { lng, lat, radius, rideType } = req.body;
      if (!lng || !lat) {
        return res.status(400).json({ success: false, message: 'Missing coordinates' });
      }

      const drivers = await DriverService.getAvailableDrivers(
        Number(lng),
        Number(lat),
        Number(radius) || config.defaultSearchRadius,
        rideType
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

  async setupWalletPin(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.id as string;
      const { pin } = req.body;

      await DriverService.setupWalletPin(driverId, pin);
      return successResponse(res, 200, 'Wallet PIN setup successfully', { success: true });
    } catch (err) {
      next(err);
    }
  },
};
