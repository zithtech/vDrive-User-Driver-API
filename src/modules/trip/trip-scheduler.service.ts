import { query } from '../../shared/database';
import { logger } from '../../shared/logger';
import { NotificationService } from '../notifications/notification.service';
import { DriverRepository } from '../drivers/driver.repository';

export const TripSchedulerService = {
    /**
     * Periodically called by cron to handle reminders and unassignments
     */
    async processScheduledRides() {
        try {
            const now = new Date();

            // 1. Fetch upcoming accepted scheduled rides
            const result = await query(
                `SELECT t.*, d.availability->>'status' as driver_status, d.fcm_token 
         FROM trips t
         JOIN drivers d ON t.driver_id = d.id
         WHERE t.booking_type = 'SCHEDULED' 
         AND t.trip_status = 'ACCEPTED'
         AND t.scheduled_start_time > $1
         AND t.scheduled_start_time < $1 + INTERVAL '35 minutes'`,
                [now]
            );

            for (const trip of result.rows) {
                const startTime = new Date(trip.scheduled_start_time);
                const diffMinutes = Math.floor((startTime.getTime() - now.getTime()) / 60000);

                // a. 30-minute reminder
                if (diffMinutes >= 28 && diffMinutes <= 32 && !trip.reminders_sent?.thirty_min) {
                    if (trip.driver_status === 'ONLINE') {
                        const messageId = await NotificationService.sendNotificationToDriver(
                            trip.driver_id,
                            'Upcoming Trip Reminder',
                            `You have a scheduled trip starting in 30 minutes at ${trip.pickup_address}.`,
                            { type: 'SCHEDULED_REMINDER', trip_id: String(trip.trip_id) }
                        );
                        
                        if (messageId) {
                            logger.info(`Successfully sent 30-minute reminder for trip ${trip.trip_id} to driver ${trip.driver_id}`);
                            // Notify app via socket
                            const { emitToRoom } = require('../../sockets/socket');
                            emitToRoom(`driver_${trip.driver_id}`, 'SCHEDULED_REMINDER', { trip_id: trip.trip_id });

                            await query(
                                "UPDATE trips SET reminders_sent = reminders_sent || '{\"thirty_min\": true}'::jsonb WHERE trip_id = $1",
                                [trip.trip_id]
                            );
                        }
                    } else {
                        logger.info(`Skipping 30-minute reminder for trip ${trip.trip_id} as driver ${trip.driver_id} is OFFLINE.`);
                    }
                }

                // b. 10-minute check & auto-unassign
                if (diffMinutes >= 8 && diffMinutes <= 12 && !trip.reminders_sent?.ten_min) {
                    if (trip.driver_status === 'OFFLINE') {
                        // Unassign
                        logger.warn(`Auto-unassigning trip ${trip.trip_id} because driver ${trip.driver_id} is OFFLINE 10 mins before start.`);

                        await query(
                            "UPDATE trips SET trip_status = 'REQUESTED', driver_id = NULL, reminders_sent = reminders_sent || '{\"ten_min\": true}'::jsonb, updated_at = NOW() WHERE trip_id = $1",
                            [trip.trip_id]
                        );

                        await NotificationService.sendNotificationToDriver(
                            trip.driver_id,
                            'Trip Unassigned',
                            'You were offline 10 minutes before a scheduled trip, so it has been unassigned.',
                            { type: 'TRIP_UNASSIGNED', trip_id: String(trip.trip_id) }
                        );

                        // Notify app via socket
                        const { emitToRoom } = require('../../sockets/socket');
                        emitToRoom(`driver_${trip.driver_id}`, 'TRIP_REMOVED', { tripId: trip.trip_id });
                    } else {
                        // Just a 10-minute reminder if they are online
                        const messageId = await NotificationService.sendNotificationToDriver(
                            trip.driver_id,
                            'Final Trip Reminder',
                            `Your scheduled trip starts in 10 minutes. Please head to ${trip.pickup_address}.`,
                            { type: 'SCHEDULED_REMINDER', trip_id: String(trip.trip_id) }
                        );

                        if (messageId) {
                            logger.info(`Successfully sent 10-minute reminder for trip ${trip.trip_id} to driver ${trip.driver_id}`);
                            // Notify app via socket
                            const { emitToRoom } = require('../../sockets/socket');
                            emitToRoom(`driver_${trip.driver_id}`, 'SCHEDULED_REMINDER', { trip_id: trip.trip_id });

                            await query(
                                "UPDATE trips SET reminders_sent = reminders_sent || '{\"ten_min\": true}'::jsonb WHERE trip_id = $1",
                                [trip.trip_id]
                            );
                        }
                    }
                }
            }
        } catch (error: any) {
            logger.error(`Error in processScheduledRides: ${error.message}`);
        }
    },

    /**
     * Broadcasts REQUESTED scheduled rides starting soon to ONLINE drivers
     */
    async broadcastUpcomingScheduledRides() {
        try {
            const now = new Date();

            // 1. Fetch scheduled rides starting in < 20 minutes that are still REQUESTED
            const result = await query(
                `SELECT t.*, u.full_name as passenger_name 
                 FROM trips t
                 LEFT JOIN users u ON t.user_id = u.id
                 WHERE t.booking_type = 'SCHEDULED' 
                 AND t.trip_status = 'REQUESTED'
                 AND t.scheduled_start_time > $1
                 AND t.scheduled_start_time < $1 + INTERVAL '20 minutes'
                 AND (t.last_broadcast_at IS NULL OR t.last_broadcast_at < $1 - INTERVAL '10 minutes')`,
                [now]
            );

            if (result.rows.length === 0) return;

            // 2. Fetch UNIQUE fcm_tokens for drivers with active status and subscription (Online & Offline)
            const eligibleDrivers = await query(
                `SELECT DISTINCT fcm_token FROM drivers 
                 WHERE status = 'active'
                 AND onboarding_status = 'SUBSCRIPTION_ACTIVE'
                 AND fcm_token IS NOT NULL`
            );

            for (const trip of result.rows) {
                let broadcastSuccess = false;
                for (const driver of eligibleDrivers.rows) {
                    const messageId = await NotificationService.sendNotification(
                        driver.fcm_token,
                        'New Scheduled Ride Request',
                        `A scheduled ride is starting soon at ${trip.pickup_address}.`,
                        {
                            type: 'ride_request',
                            trip_id: String(trip.trip_id || ''),
                            pickup_address: String(trip.pickup_address || ''),
                            drop_address: String(trip.drop_address || ''),
                            total_fare: trip.total_fare?.toString() || '--',
                            distance_km: trip.distance_km?.toString() || '--',
                            trip_duration_minutes: trip.trip_duration_minutes?.toString() || '--',
                            ride_type: String(trip.ride_type || ''),
                            booking_type: String(trip.booking_type || ''),
                            scheduled_start_time: trip.scheduled_start_time instanceof Date 
                                ? trip.scheduled_start_time.toISOString() 
                                : String(trip.scheduled_start_time || ''),
                        }
                    );
                    if (messageId) broadcastSuccess = true;
                }

                if (broadcastSuccess) {
                    logger.info(`📡 Broadcasted "Starting Soon" for trip ${trip.trip_id} to ${eligibleDrivers.rows.length} drivers.`);
                    await query(
                        "UPDATE trips SET last_broadcast_at = NOW() WHERE trip_id = $1",
                        [trip.trip_id]
                    );
                }
            }
        } catch (error: any) {
            logger.error(`Error in broadcastUpcomingScheduledRides: ${error.message}`);
        }
    },

    /**
     * Immediately broadcasts a NEWly created scheduled ride to all eligible drivers
     */
    async broadcastNewScheduledRide(trip: any, io?: any) {
        try {
            // Fetch UNIQUE fcm_tokens for drivers with active status and subscription (Online & Offline)
            const eligibleDrivers = await query(
                `SELECT DISTINCT fcm_token FROM drivers 
                 WHERE status = 'active'
                 AND onboarding_status = 'SUBSCRIPTION_ACTIVE'
                 AND fcm_token IS NOT NULL`
            );

            const startTimeStr = trip.scheduled_start_time instanceof Date 
                ? trip.scheduled_start_time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                : String(trip.scheduled_start_time || '');

            for (const driver of eligibleDrivers.rows) {
                await NotificationService.sendNotification(
                    driver.fcm_token,
                    'New Scheduled Ride Available',
                    `A new scheduled ride is available for ${startTimeStr}. Pickup: ${trip.pickup_address}`,
                    {
                        type: 'ride_request',
                        trip_id: String(trip.trip_id || ''),
                        pickup_address: String(trip.pickup_address || ''),
                        drop_address: String(trip.drop_address || ''),
                        total_fare: trip.total_fare?.toString() || '--',
                        distance_km: trip.distance_km?.toString() || '--',
                        trip_duration_minutes: trip.trip_duration_minutes?.toString() || '--',
                        ride_type: String(trip.ride_type || ''),
                        booking_type: String(trip.booking_type || ''),
                        scheduled_start_time: trip.scheduled_start_time instanceof Date 
                            ? trip.scheduled_start_time.toISOString() 
                            : String(trip.scheduled_start_time || ''),
                    }
                );
            }

            // 📍 REAL-TIME: Broadcast via Sockets if io is provided
            if (io) {
                logger.info(`📡 Broadcasting NEW_TRIP_REQUEST via Sockets for trip ${trip.trip_id}`);
                io.emit('NEW_TRIP_REQUEST', { trip });
            }
        } catch (error: any) {
            logger.error(`Error in broadcastNewScheduledRide: ${error.message}`);
        }
    }

};
