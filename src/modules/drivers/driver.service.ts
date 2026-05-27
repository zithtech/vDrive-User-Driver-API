// src/modules/drivers/driver.service.ts
import { DriverRepository } from './driver.repository';
import { CreateDriverInput, UpdateDriverInput, Driver } from './driver.model';
import { TripService } from '../trip/trip.service';
import { Server } from 'socket.io';
import { query } from '../../shared/database';
import { Trip } from '../trip/trip.model';
import { logger } from '../../shared/logger';
import { DriverDocumentsRepository } from './driver-documents.repository';
import { DriverReferralRepository } from '../driver-referrals/driver-referral.repository';
import axios from 'axios';
import config from '../../config';
import { notificationService } from '../../services/notificationService';
import { DriverOnboardingStatus } from '../../enums/user.enums';

export const DriverService = {
  async createDriver(driverData: CreateDriverInput): Promise<Driver> {
    // Validate required fields
    if (!driverData.full_name || !driverData.phone_number || !driverData.email) {
      throw { statusCode: 400, message: 'Missing required fields' };
    }

    // Create driver
    const driver = await DriverRepository.create(driverData);

    // Trigger webhook asynchronously for Admin App real-time notifications
    try {
      const webhookUrl = `${config.adminBackendUrl}/api/webhooks/driver-events`;
      axios.post(webhookUrl, {
        eventType: 'NEW_DRIVER',
        message: `A new driver named ${driver.full_name} has registered.`,
        data: driver
      }, {
        headers: { 'x-api-key': config.internalServiceApiKey }
      }).catch(err => logger.error(`Webhook trigger failed: ${err.message}`));
    } catch (e) {
      // Ignore 
    }

    return driver;
  },

   async updateDriver(id: string, driverData: UpdateDriverInput): Promise<Driver> {
    const currentDriver = await DriverRepository.findById(id);
    if (!currentDriver) {
      throw { statusCode: 404, message: 'Driver not found' };
    }

    const currentStatus = currentDriver.onboarding_status;
    let nextStatus: any = driverData.onboarding_status || currentStatus;

    // 1. Profile Completion: PHONE_VERIFIED -> PROFILE_COMPLETED
    if (currentStatus === DriverOnboardingStatus.PHONE_VERIFIED || !currentStatus) {
      const isProfileUpdate = driverData.first_name || driverData.last_name || driverData.email;
      if (isProfileUpdate) {
        const fName = driverData.first_name || currentDriver.first_name;
        const lName = driverData.last_name || currentDriver.last_name;

        if (!driverData.full_name && (driverData.first_name || driverData.last_name)) {
          driverData.full_name = `${fName} ${lName}`.trim();
        }

        if (fName && lName) {
          nextStatus = DriverOnboardingStatus.PROFILE_COMPLETED;
        }
      }
    }

    // 2. Address Completion: PROFILE_COMPLETED -> ADDRESS_COMPLETED
    // We allow transition to ADDRESS_COMPLETED if we have address data and are currently at PROFILE_COMPLETED (or lower)
    // or if the payload explicitly requests it.
    if (driverData.address) {
      // Only move forward to ADDRESS_COMPLETED if currently lower
      if (nextStatus === DriverOnboardingStatus.PHONE_VERIFIED || nextStatus === DriverOnboardingStatus.PROFILE_COMPLETED || !nextStatus) {
        nextStatus = DriverOnboardingStatus.ADDRESS_COMPLETED;
        
        // Trigger webhook for Admin App real-time notifications
        try {
          const webhookUrl = `${config.adminBackendUrl}/api/webhooks/driver-events`;
          const driverName = currentDriver.full_name || driverData.full_name || 'A driver';
          axios.post(webhookUrl, {
            eventType: 'DRIVER_PROFILE_COMPLETED',
            message: `Driver ${driverName} completed profile setup.`,
            data: driverData
          }, {
            headers: { 'x-api-key': config.internalServiceApiKey }
          }).catch(err => logger.error(`Webhook trigger failed: ${err.message}`));
        } catch (e) {
          // Ignore 
        }
      }
    }

    // Ensure we don't downgrade if payload explicitly had a higher status
    if (driverData.onboarding_status) {
      // Hierarchy check (very basic)
      const order = [
        DriverOnboardingStatus.PHONE_VERIFIED,
        DriverOnboardingStatus.PROFILE_COMPLETED,
        DriverOnboardingStatus.ADDRESS_COMPLETED,
        DriverOnboardingStatus.DOCS_SUBMITTED,
        DriverOnboardingStatus.DOCUMENTS_APPROVED,
        DriverOnboardingStatus.ACTIVE
      ];
      const currentIdx = order.indexOf(nextStatus);
      const requestedIdx = order.indexOf(driverData.onboarding_status as DriverOnboardingStatus);
      if (requestedIdx > currentIdx) {
        nextStatus = driverData.onboarding_status;
      }
    }

    driverData.onboarding_status = nextStatus;

    // Handle Referral logic
    if (driverData.referred_by) {
      try {
        const existingReferral = await DriverReferralRepository.findByRefereeId(id, 'DRIVER');
        if (!existingReferral) {
          const referrerId = await DriverReferralRepository.findByCode(driverData.referred_by, 'DRIVER');
          if (referrerId && referrerId !== id) {
            await DriverReferralRepository.createReferral({
              referrer_id: referrerId,
              referee_id: id,
              referral_type: 'DRIVER',
              status: 'PENDING'
            });
            logger.info(`Referral created: driver ${id} referred by ${referrerId}`);
            
            // IMPORTANT: Update driverData.referred_by to the referrer's UUID 
            // so it can be stored correctly in the 'drivers' table
            driverData.referred_by = referrerId;
          } else {
            // If code is invalid or own code, don't try to save it as an ID
            delete driverData.referred_by;
          }
        } else {
          // If already referred, don't update this field again
          delete driverData.referred_by;
        }
      } catch (err) {
        logger.error(`Error processing referral in updateDriver: ${err}`);
        delete driverData.referred_by;
      }
    }

    const driver = await DriverRepository.update(id, driverData);
    if (!driver) {
      throw { statusCode: 404, message: 'Driver not found' };
    }

    // Send push notification for status changes (e.g., blocked or rejected)
    if (driverData.status && driverData.status !== currentStatus) {
      if (driver.fcm_token) {
        let title = '';
        let body = '';
        let type = '';

        if (driverData.status === 'blocked') {
          title = 'Account Restricted';
          body = `Your account has been restricted. Reason: ${driverData.status_reason || 'Administrative reasons'}`;
          type = 'ACCOUNT_BLOCKED';
        } else if (driverData.status === 'rejected') {
          title = 'Application Rejected';
          body = `Your application was not approved. Reason: ${driverData.status_reason || 'Incomplete details'}`;
          type = 'ACCOUNT_REJECTED';
        }

        if (title && body) {
          notificationService.sendPushNotification(driver.fcm_token, {
            title,
            body,
            data: {
              type,
              status: driverData.status,
              status_reason: driverData.status_reason || ''
            }
          }).catch(err => logger.error(`Failed to send status update notification: ${err.message}`));
        }
      }
    }

    return driver;
  },

  async getDriverById(id: string): Promise<Driver> {
    const driver = await DriverRepository.findById(id);
    if (!driver) {
      throw { statusCode: 404, message: 'Driver not found' };
    }
    return driver;
  },

  async getAllDrivers(limit: number = 50, offset: number = 0, status?: string, onboardingStatus?: string): Promise<Driver[]> {
    return await DriverRepository.findAll(limit, offset, status, onboardingStatus);
  },

  async resetDriverProfile(driverId: string): Promise<boolean> {
    try {
      logger.info(`Resetting profile for driver: ${driverId}`);
      // 1. Delete all documents
      await DriverDocumentsRepository.deleteByDriverId(driverId);
      logger.info(`Documents deleted for driver: ${driverId}`);

      // 2. Reset KYC status, Onboarding Status, and Basic metadata
      const defaultKyc = JSON.stringify({ overallStatus: 'pending', verifiedAt: null });
      await query(
        `UPDATE drivers 
         SET status = $1, 
             kyc = $2, 
             onboarding_status = $4, 
             documents_submitted = false,
             profile_pic_url = NULL,
             updated_at = NOW() 
         WHERE id = $3`,
        ['pending_verification', defaultKyc, driverId, DriverOnboardingStatus.PHONE_VERIFIED]
      );
      logger.info(`Drivers table updated for driver: ${driverId}`);

      return true;
    } catch (error: any) {
      logger.error(`Error in resetDriverProfile: ${error.message}`);
      throw error;
    }
  },

  async verifyDriverDocuments(driverId: string): Promise<boolean> {
    try {
      logger.info(`Manual verification started for driver: ${driverId}`);

      const driver = await DriverRepository.findById(driverId);
      if (!driver) {
        throw { statusCode: 404, message: 'Driver not found' };
      }

      // 1. Update all documents to verified
      await query(
        `UPDATE driver_documents 
         SET status = 'verified', 
             verified_at = NOW() 
         WHERE driver_id = $1`,
        [driverId]
      );

      // 2. Activate driver account
      const kycData = JSON.stringify({
        overallStatus: 'verified',
        verifiedAt: new Date().toISOString()
      });

      await query(
        `UPDATE drivers 
         SET status = 'active', 
             onboarding_status = $3, 
             kyc = $1,
             updated_at = NOW() 
         WHERE id = $2`,
        [kycData, driverId, DriverOnboardingStatus.DOCUMENTS_APPROVED]
      );

      logger.info(`Driver ${driverId} manually verified and activated`);

      // 3. Send Push Notification
      if (driver.fcm_token) {
        notificationService.sendPushNotification(driver.fcm_token, {
          title: 'Account Approved!',
          body: 'Your documents have been verified. You can now go online and start earning.',
          data: {
            type: 'ACCOUNT_APPROVED',
            onboarding_status: DriverOnboardingStatus.DOCUMENTS_APPROVED
          }
        }).catch(err => logger.error(`Failed to send approval notification: ${err.message}`));
      }

      return true;
    } catch (error: any) {
      logger.error(`Error in verifyDriverDocuments: ${error.message}`);
      throw error;
    }
  },

  async deleteDriver(id: string): Promise<boolean> {
    const result = await query('DELETE FROM drivers WHERE id = $1', [id]);
    if ((result as any).rowCount === 0) {
      throw { statusCode: 404, message: 'Driver not found' };
    }
    return true;
  },

  /**
   * Update the FCM token for a driver
   */
  async updateFcmToken(driverId: string, fcmToken: string): Promise<void> {
    const driver = await DriverRepository.findById(driverId);
    if (!driver) {
      throw { statusCode: 404, message: 'Driver not found' };
    }

    await DriverRepository.updateFcmToken(driverId, fcmToken);
    logger.info(`FCM token updated for driver: ${driverId}`);
  },

  async goOnline(driverId: string): Promise<any> {
    const driver = await DriverRepository.findById(driverId);
    if (!driver) {
      throw { statusCode: 404, message: 'Driver not found' };
    }

    // Close any stale open sessions (safety net for app crashes / missed goOffline)
    await query(
      `UPDATE driver_online_sessions 
       SET went_offline_at = NOW(), 
           duration_minutes = EXTRACT(EPOCH FROM (NOW() - went_online_at)) / 60
       WHERE driver_id = $1 AND went_offline_at IS NULL`,
      [driverId]
    );

    // Create a new online session
    await query(
      `INSERT INTO driver_online_sessions (driver_id, went_online_at) VALUES ($1, NOW())`,
      [driverId]
    );

    // Update status to ONLINE
    await DriverRepository.update(driverId, {
      availability: {
        online: true,
        status: 'ONLINE' as any,
        lastActive: new Date().toISOString(),
      },
    });

    // Check for upcoming scheduled rides
    const upcomingRides = await query(
      `SELECT * FROM trips 
       WHERE driver_id = $1 
       AND booking_type = 'SCHEDULED' 
       AND trip_status = 'ACCEPTED' 
       AND scheduled_start_time > NOW()
       ORDER BY scheduled_start_time ASC`,
      [driverId]
    );

    return {
      success: true,
      upcomingRide: upcomingRides.rows[0] || null,
    };
  },

 async goOffline(driverId: string): Promise<void> {
    const driver = await DriverRepository.findById(driverId);
    if (!driver) {
      throw { statusCode: 404, message: 'Driver not found' };
    }

    // Close the open session
    await query(
      `UPDATE driver_online_sessions 
       SET went_offline_at = NOW(), 
           duration_minutes = EXTRACT(EPOCH FROM (NOW() - went_online_at)) / 60
       WHERE driver_id = $1 AND went_offline_at IS NULL`,
      [driverId]
    );

    await DriverRepository.update(driverId, {
      availability: {
        online: false,
        status: 'OFFLINE' as any,
        lastActive: new Date().toISOString(),
      },
    });
  },


  async findNearbyDrivers(io: Server, lng: number, lat: number, newTrip: Trip,radius:number) {
    // Business Rule: We only show drivers active in the last 10 mins
    // const { drivers, searchedRadius } = await DriverRepository.findNearbyDriversExpanding(lng, lat,radius);
    const drivers = await DriverRepository.findNearbyDrivers(lng, lat, radius);

    if (!drivers || drivers.length === 0) {
      throw new Error("No drivers found in your area.");
    }

    if (drivers && drivers.length > 0) {
      // Average speed 30km/h => 500 meters/min
      const driversWithEta = drivers.map(d => ({
        ...d,
        eta: Math.ceil(parseInt(d.distance_meters) / config.avgSpeedMetersPerMin) || 1
      }));

      await TripService.requestRideToMultipleDrivers(io, [newTrip], driversWithEta);
    }
    return { drivers, searchedRadius: radius };
    // return { drivers, searchedRadius };
  },

  async getAvailableDrivers(lng: number, lat: number, radius: number): Promise<any[]> {
    const driversData = await DriverRepository.findNearbyDrivers(lng, lat, radius);
    
    // Process distance and ETA
    // Average speed 30km/h => 0.5 km/min => 500 meters/min

    return driversData.map(d => ({
      id: d.id,
      name: d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Unknown',
      phone_number: d.phone_number,
      rating: parseFloat(d.rating) || 0,
      current_lat: d.current_lat,
      current_lng: d.current_lng,
      distance_meters: parseInt(d.distance_meters),
      distance_km: parseFloat((parseInt(d.distance_meters) / 1000).toFixed(2)),
      eta_minutes: Math.ceil(parseInt(d.distance_meters) / config.avgSpeedMetersPerMin) || 1, // at least 1 min
    }));
  },

  async syncLocation(id: string, lat: number, lng: number, address: string) {
    // Validation: Coordinates must be within Earth's range
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error("Invalid coordinates provided.");
    }
    return await DriverRepository.updateLocation(id, lat, lng, address);
  },

  async getTodayOverview(driverId: string): Promise<any> {
    const driver = await DriverRepository.findById(driverId);
    if (!driver) {
      throw { statusCode: 404, message: 'Driver not found' };
    }

    // Get today's date boundaries in UTC
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Calculate online minutes today
    // Closed sessions today
    const closedSessions = await query(
      `SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
       FROM driver_online_sessions 
       WHERE driver_id = $1 
         AND went_online_at >= $2 
         AND went_offline_at IS NOT NULL`,
      [driverId, todayStart]
    );
    let totalMinutes = parseFloat(closedSessions.rows[0]?.total_minutes || 0);

    // Ongoing session (if currently online)
    const openSession = await query(
      `SELECT went_online_at 
       FROM driver_online_sessions 
       WHERE driver_id = $1 AND went_offline_at IS NULL 
       ORDER BY went_online_at DESC LIMIT 1`,
      [driverId]
    );
    const currentlyOnline = openSession.rows.length > 0;
    let currentSessionStart: string | null = null;

    if (currentlyOnline) {
      const sessionStart = new Date(openSession.rows[0].went_online_at);
      currentSessionStart = sessionStart.toISOString();
      const ongoingMinutes = (Date.now() - sessionStart.getTime()) / (60 * 1000);
      totalMinutes += ongoingMinutes;
    }

    // 2. Trips completed today
    const tripStats = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE trip_status = 'COMPLETED') as trips_completed,
         COALESCE(SUM(total_fare) FILTER (WHERE trip_status = 'COMPLETED'), 0) as total_earnings
       FROM trips 
       WHERE driver_id = $1 
         AND created_at >= $2 
         AND created_at <= $3`,
      [driverId, todayStart, todayEnd]
    );

    const tripsCompleted = parseInt(tripStats.rows[0]?.trips_completed || 0);
    const totalEarnings = parseFloat(tripStats.rows[0]?.total_earnings || 0);

    // 3. All-time stats for profile header (RIDES & YEARS)
    const allTimeStats = await query(
      `SELECT COUNT(*) as total_completed_rides 
       FROM trips 
       WHERE driver_id = $1 AND trip_status = 'COMPLETED'`,
      [driverId]
    );

    const totalCompletedRides = parseInt(allTimeStats.rows[0]?.total_completed_rides || 0);
    
    // Calculate app usage years
    const createdAt = new Date(driver.created_at || Date.now());
    const diffMs = Date.now() - createdAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const yearsActive = parseFloat((diffDays / 365).toFixed(1));

    // Format online time
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    const onlineFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return {
      onlineMinutes: Math.round(totalMinutes),
      onlineFormatted,
      tripsCompleted,
      totalEarnings,
      totalCompletedRides,
      yearsActive: yearsActive || 0.1, // Default 0.1 for better UX if newly joined
      currentlyOnline,
      currentSessionStart,
    };
  },

  async getOnlineHours(driverId: string): Promise<number> {
    const result = await query(
      `SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
       FROM driver_online_sessions 
       WHERE driver_id = $1 AND went_offline_at IS NOT NULL`,
      [driverId]
    );
    return Math.round(parseFloat(result.rows[0]?.total_minutes || 0) / 60);
  },
};
