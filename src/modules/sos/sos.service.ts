import axios from 'axios';
import config from '../../config';
import { getIO, emitToRoom, emitToAll } from '../../sockets/socket';
import { logger } from '../../shared/logger';
import { SosRepository } from './sos.repository';
import { DriverRepository } from '../drivers/driver.repository';
import { UserRepository } from '../users/user.repository';
import { TripRepository } from '../trip/trip.repository';
import { UserStatus } from '../../enums/user.enums';
import { DriverNotifications, UserNotifications } from '../notifications';

export class SosService {
  static async triggerSos(user_id: string, user_type: 'driver' | 'customer', trip_id?: string) {
    // 1. Check if SOS already active for this user
    let sosEvent = await SosRepository.findActiveSosByUser(user_id, user_type);
    const isNewEvent = !sosEvent;

    if (isNewEvent) {
      // 2. Automatically associate active trip if missing for drivers
      let associatedTripId = trip_id;
      if (user_type === 'driver' && !associatedTripId) {
        const activeTrip = await TripRepository.findActiveByDriverId(user_id);
        if (activeTrip) {
          associatedTripId = activeTrip.trip_id;
          logger.info(`Automatically associated active trip ${associatedTripId} with SOS for driver ${user_id}`);
        }
      }

      // 3. Create new SOS event
      sosEvent = await SosRepository.createSosEvent(user_id, user_type, associatedTripId);
    }

    if (!sosEvent) {
      throw new Error('Failed to create or find active SOS event');
    }

    return await this.getEnrichedSosData(sosEvent, isNewEvent);
  }

  static async getActiveSosWithDetails() {
    const activeEvents = await SosRepository.findAllActiveSos();
    const enrichedEvents = await Promise.all(
      activeEvents.map(event => this.getEnrichedSosData(event, false))
    );
    return enrichedEvents;
  }

  private static async getEnrichedSosData(sosEvent: any, isNewEvent: boolean) {
    const { user_id, user_type, trip_id: currentTripId } = sosEvent;

    // Fetch Enriched Data for Alerting
    let enrichedUserData: any = null;

    if (user_type === 'driver') {
      const driver = await DriverRepository.findById(user_id);
      if (driver) {
        enrichedUserData = {
          full_name: driver.full_name || `${driver.first_name} ${driver.last_name}`,
          phone_number: driver.phone_number,
          vdrive_id: driver.vdrive_id,
          type: 'driver',
          current_lat: driver.current_lat,
          current_lng: driver.current_lng
        };
      }
    } else {
      const user = await UserRepository.findById(user_id, UserStatus.ACTIVE);
      enrichedUserData = user ? {
        full_name: user.full_name || `${user.first_name} ${user.last_name}`,
        phone_number: user.phone_number,
        vdrive_id: user.user_code,
        type: 'customer'
      } : null;
    }

    const trip = currentTripId ? await TripRepository.findById(currentTripId) : null;

    const enrichedData = {
      ...sosEvent,
      user: enrichedUserData,
      trip: trip ? {
        pickup_address: trip.pickup_address,
        drop_address: trip.drop_address,
        status: trip.trip_status
      } : null,
      latitude: enrichedUserData?.current_lat,
      longitude: enrichedUserData?.current_lng
    };

    if (isNewEvent) {
      // 4. Emit via Socket.io
      const io = getIO();
      // Confirm to the user/driver
      io.to(`${user_type}_${user_id}`).emit('sos_triggered', sosEvent);
      
      // Notify trip room if applicable
      if (currentTripId) {
          io.to(`trip_${currentTripId}`).emit('sos_triggered', sosEvent);
      }

      // Notify all admins for real-time monitoring
      io.to('admins').emit('admin_sos_alert', enrichedData);

      // 5. Trigger Webhook to Admin Backend
      try {
        await this.sendWebhookWithRetry('SOS_TRIGGERED', `${user_type} has triggered an SOS alert!`, enrichedData);
        logger.info(`SOS webhook sent to Admin Backend for SOS ID: ${sosEvent?.id}`);
      } catch (error) {
        logger.error('Failed to send SOS webhook to Admin Backend after retries:', error);
      }

      // 6. Logic for SMS to trusted contacts (hook)
      const contacts = await SosRepository.getTrustedContacts(user_id, user_type);
      this.sendSmsToContacts(contacts, sosEvent);
    } else {
      // For existing events, we still want to notify admins if they re-trigger
      // Throttled or just send a 'RE-TRIGGERED' event
      try {
        await this.sendWebhookWithRetry('SOS_TRIGGERED', `${user_type} HAS RE-TRIGGERED AN ACTIVE SOS!`, enrichedData);
        logger.info(`Re-triggered SOS webhook sent for SOS ID: ${sosEvent?.id}`);
      } catch (error) {
        logger.error('Failed to send re-triggered SOS webhook:', error);
      }
    }

    return enrichedData;
  }

  static async updateLocation(sos_id: string, latitude: number, longitude: number) {
    logger.info(`Received SOS location update: sos_id=${sos_id}, lat=${latitude}, lng=${longitude}`);
    await SosRepository.addSosLocation(sos_id, latitude, longitude);

    const updatePayload = {
      sos_id,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    };

    // Emit real-time location to any tracking admin/user
    emitToRoom(`sos_${sos_id}`, 'sos_location_update', updatePayload);
    // Also notify general admin room
    emitToRoom('admins', 'admin_sos_location_update', updatePayload);

    // Notify Admin Backend via Webhook
    try {
      await this.sendWebhookWithRetry('SOS_LOCATION_UPDATE', 'SOS location updated', updatePayload);
    } catch (error) {
      logger.error('Failed to send SOS location webhook:', error);
    }
  }

  static async resolveSos(sos_id: string) {
    const sosEvent = await SosRepository.findById(sos_id);
    if (!sosEvent) {
      logger.warn(`Attempted to resolve non-existent SOS event: ${sos_id}`);
      return;
    }

    await SosRepository.resolveSosEvent(sos_id);
    
    // Notify all parties using safe helpers (won't throw if socket not ready)
    emitToAll('sos_resolved', { sos_id });
    emitToRoom('admins', 'admin_sos_resolved', { sos_id });

    // Notify the user/driver via FCM
    try {
      if (sosEvent.user_type === 'driver') {
        const fcmToken = await DriverRepository.getFcmTokenById(sosEvent.user_id);
        if (fcmToken) {
          await DriverNotifications.sosResolved(fcmToken, sos_id);
        }
      } else {
        const fcmToken = await UserRepository.getFcmTokenById(sosEvent.user_id);
        if (fcmToken) {
          await UserNotifications.sosResolved(fcmToken, sos_id);
        }
      }
    } catch (error) {
      logger.error(`Failed to send SOS resolution FCM for SOS ID: ${sos_id}`, error);
    }

    // Notify Admin Backend
     try {
      await this.sendWebhookWithRetry('SOS_RESOLVED', 'SOS alert has been resolved.', { sos_id });
    } catch (error) {
      logger.error('Failed to send SOS resolve webhook:', error);
    }
  }

  private static async sendWebhookWithRetry(eventType: string, message: string, data: any, retries = 3) {
    const url = `${config.adminBackendUrl}/api/webhooks/driver-events`;
    const payload = { eventType, message, data };
    const headers = { 'x-api-key': config.internalServiceApiKey };

    for (let i = 0; i < retries; i++) {
      try {
        await axios.post(url, payload, { headers });
        return;
      } catch (error) {
        if (i === retries - 1) throw error;
        logger.warn(`Webhook attempt ${i + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      }
    }
  }

  private static async sendSmsToContacts(contacts: any[], sosEvent: any) {
    // Placeholder for actual SMS integration
    logger.info(`[SMS STUB] Sending SOS alerts to ${contacts.length} trusted contacts for User ID: ${sosEvent.user_id}`);
    contacts.forEach(contact => {
      logger.info(`[SMS STUB] Sending to ${contact.phone}: "Emergency! ${contact.name}, someone you know has triggered an SOS. Track: [link]"`);
    });
  }
}
