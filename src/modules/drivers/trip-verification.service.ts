import { TripVerificationRepository } from './trip-verification.repository';
import { TripVerification, TripVerificationStatus, ImageVerificationStatus, CreateTripVerificationInput } from './trip-verification.model';
import { DriverRepository } from './driver.repository';
import { logger } from '../../shared/logger';
import { DriverDocumentsRepository } from './driver-documents.repository';
import { notifyAdmin } from '../../sockets/admin-socket.service';
import { TripStatus } from '../../enums/trip.enums';
import { s3Service } from '../s3/s3.service';

export class TripVerificationService {
    /**
     * Helper to sign URLs for a trip verification record
     */
    private static async signVerificationUrls(verification: TripVerification | null): Promise<TripVerification | null> {
        if (!verification) return null;

        const signSingle = async (url: string | null) => {
            if (!url || !url.includes('amazonaws.com')) return url;
            try {
                const urlObj = new URL(url);
                const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                return await s3Service.getReadUrl(key);
            } catch (e) {
                return url;
            }
        };

        return {
            ...verification,
            selfie_url: await signSingle(verification.selfie_url) || '',
            car_image_url: await signSingle(verification.car_image_url) || '',
            car_images: verification.car_images ? await Promise.all(verification.car_images.map(signSingle)) : undefined
        } as TripVerification;
    }
    /**
     * Submit new photos for trip verification.
     * Sets trip status to VERIFICATION_PENDING and notifies Admin.
     */
    static async submitPhotos(data: CreateTripVerificationInput): Promise<TripVerification> {
        logger.info(`Submitting trip verification photos for driver: ${data.driver_id}, trip: ${data.trip_id}`);

        // 1. Reset is_trip_verified to false
        await DriverRepository.update(data.driver_id, { is_trip_verified: false });

        // 2. Create the verification record
        const verification = await TripVerificationRepository.upsert(data);

        // 3. Update trip status to VERIFICATION_PENDING
        if (data.trip_id) {
            try {
                const { TripRepository } = require('../trip/trip.repository');
                await TripRepository.updateTripStatus(data.trip_id, TripStatus.VERIFICATION_PENDING);
                logger.info(`Trip ${data.trip_id} status set to VERIFICATION_PENDING`);
            } catch (err: any) {
                logger.error(`Failed to update trip status to VERIFICATION_PENDING: ${err.message}`);
            }
        }

        // 4. Notify Admin via socket (Live Operational Feed)
        try {
            const driver = await DriverRepository.findById(data.driver_id);
            notifyAdmin('driver_event', {
                eventType: 'TRIP_VERIFICATION_REQUIRED',
                message: `${driver?.full_name || 'Driver'} uploaded verification photos for trip approval`,
                timestamp: new Date().toISOString(),
                data: {
                    verification_id: verification.id,
                    driver_id: data.driver_id,
                    driver_name: driver?.full_name || 'Unknown',
                    driver_phone: driver?.phone_number || '',
                    trip_id: data.trip_id,
                    selfie_url: data.selfie_url,
                    car_image_url: data.car_image_url,
                    attempt_number: verification.attempt_number,
                },
            });
            logger.info(`Admin notified about trip verification for driver ${data.driver_id}`);
        } catch (err: any) {
            logger.error(`Failed to notify admin about trip verification: ${err.message}`);
        }

        return verification;
    }

    /**
     * Re-upload specific rejected images
     */
    static async reuploadImages(
        verificationId: string,
        data: { selfie_url?: string; car_image_url?: string; car_images?: string[] }
    ): Promise<TripVerification | null> {
        logger.info(`Re-uploading images for verification ${verificationId}`);

        const verification = await TripVerificationRepository.reuploadImages(verificationId, data);

        if (verification) {
            // Update trip back to VERIFICATION_PENDING
            if (verification.trip_id) {
                try {
                    const { TripRepository } = require('../trip/trip.repository');
                    await TripRepository.updateTripStatus(verification.trip_id, TripStatus.VERIFICATION_PENDING);
                } catch (err: any) {
                    logger.error(`Failed to update trip status on reupload: ${err.message}`);
                }
            }

            // Re-notify admin
            try {
                const driver = await DriverRepository.findById(verification.driver_id);
                notifyAdmin('driver_event', {
                    eventType: 'TRIP_VERIFICATION_REQUIRED',
                    message: `${driver?.full_name || 'Driver'} re-uploaded verification photos (Attempt #${verification.attempt_number})`,
                    timestamp: new Date().toISOString(),
                    data: {
                        verification_id: verification.id,
                        driver_id: verification.driver_id,
                        driver_name: driver?.full_name || 'Unknown',
                        trip_id: verification.trip_id,
                        selfie_url: verification.selfie_url,
                        car_image_url: verification.car_image_url,
                        attempt_number: verification.attempt_number,
                        is_reupload: true,
                    },
                });
            } catch (err: any) {
                logger.error(`Failed to notify admin about reupload: ${err.message}`);
            }
        }

        return verification;
    }

    /**
     * Get the most recent trip verification for a driver
     */
    static async getLatestVerification(driverId: string): Promise<TripVerification | null> {
        const verifications = await TripVerificationRepository.findByDriverId(driverId);
        const latest = verifications.length > 0 ? verifications[0] : null;
        return await this.signVerificationUrls(latest);
    }

    /**
     * Get verification by trip ID
     */
    static async getVerificationByTripId(tripId: string): Promise<TripVerification | null> {
        const verification = await TripVerificationRepository.findByTripId(tripId);
        return await this.signVerificationUrls(verification);
    }

    /**
     * Get all pending verifications for admin dashboard
     */
    static async getPendingVerifications(): Promise<TripVerification[]> {
        const verifications = await TripVerificationRepository.findPendingVerifications();
        return await Promise.all(verifications.map(v => this.signVerificationUrls(v) as Promise<TripVerification>));
    }

    /**
     * Admin: Granular verification — approve/reject selfie and car images independently.
     * Automatically resolves the overall status:
     *   - Both approved => trip starts (LIVE)
     *   - Any rejected => driver gets specific rejection feedback
     */
    static async verifyTripGranular(
        id: string,
        data: {
            selfie_status?: ImageVerificationStatus;
            car_image_status?: ImageVerificationStatus;
            selfie_remarks?: string;
            car_image_remarks?: string;
            admin_id?: string;
        }
    ): Promise<TripVerification | null> {
        logger.info(`Admin verifying trip verification ${id} granularly`);

        const verification = await TripVerificationRepository.updateGranularStatus(id, data);

        if (!verification) {
            logger.error(`Trip verification ${id} not found`);
            return null;
        }

        const { emitToRoom } = require('../../sockets/socket');

        if (verification.status === 'approved') {
            // ✅ APPROVED — Start the trip
            await DriverRepository.update(verification.driver_id, { is_trip_verified: true });
            logger.info(`Driver ${verification.driver_id} is now trip verified.`);

            // Update trip status to LIVE
            if (verification.trip_id) {
                try {
                    const { TripService } = require('../trip/trip.service');
                    await TripService.startTrip(verification.trip_id);
                    logger.info(`Trip ${verification.trip_id} auto-started after verification approval`);
                } catch (err: any) {
                    logger.error(`Failed to auto-start trip ${verification.trip_id}: ${err.message}`);
                }
            }

            // Notify driver via Socket
            emitToRoom(`driver_${verification.driver_id}`, 'TRIP_VERIFICATION_APPROVED', {
                verification_id: verification.id,
                trip_id: verification.trip_id,
                status: 'approved',
                message: 'Your verification has been approved! Ride is starting.',
                timestamp: new Date().toISOString(),
            });

            // Notify driver via FCM (fallback for background)
            try {
                const driverFcmToken = await DriverRepository.getFcmTokenById(verification.driver_id);
                if (driverFcmToken) {
                    const { DriverNotifications } = require('../notifications');
                    await DriverNotifications.tripVerificationApproved(driverFcmToken, verification.trip_id || '');
                }
            } catch (err: any) {
                logger.error(`Failed to send approval FCM: ${err.message}`);
            }

            // Notify Admin Feed
            notifyAdmin('driver_event', {
                eventType: 'TRIP_VERIFICATION_APPROVED',
                message: `Trip verification approved for driver ${verification.driver_id}`,
                timestamp: new Date().toISOString(),
                data: { verification_id: verification.id, trip_id: verification.trip_id },
            });

        } else if (verification.status === 'rejected') {
            // ❌ REJECTED — Notify driver with specific reasons
            await DriverRepository.update(verification.driver_id, { is_trip_verified: false });

            const rejectionPayload = {
                verification_id: verification.id,
                trip_id: verification.trip_id,
                status: 'rejected',
                selfie_status: verification.selfie_status,
                car_image_status: verification.car_image_status,
                selfie_remarks: verification.selfie_remarks,
                car_image_remarks: verification.car_image_remarks,
                rejection_reason: verification.rejection_reason,
                message: 'Your verification was rejected. Please re-upload the required photos.',
                timestamp: new Date().toISOString(),
            };

            // Socket notification to driver
            emitToRoom(`driver_${verification.driver_id}`, 'TRIP_VERIFICATION_REJECTED', rejectionPayload);

            // FCM notification (fallback)
            try {
                const driverFcmToken = await DriverRepository.getFcmTokenById(verification.driver_id);
                if (driverFcmToken) {
                    const { DriverNotifications } = require('../notifications');
                    await DriverNotifications.tripVerificationRejected(
                        driverFcmToken,
                        verification.trip_id || '',
                        verification.rejection_reason
                    );
                }
            } catch (err: any) {
                logger.error(`Failed to send rejection FCM: ${err.message}`);
            }

            // Notify Admin Feed
            notifyAdmin('driver_event', {
                eventType: 'TRIP_VERIFICATION_REJECTED',
                message: `Trip verification rejected for driver ${verification.driver_id}`,
                timestamp: new Date().toISOString(),
                data: { verification_id: verification.id, trip_id: verification.trip_id, rejection_reason: verification.rejection_reason },
            });
        }

        return await this.signVerificationUrls(verification);
    }

    /**
     * Legacy: Simple approve/reject (kept for backward compatibility)
     */
    static async verifyTrip(
        id: string,
        status: TripVerificationStatus,
        remarks?: string
    ): Promise<TripVerification | null> {
        logger.info(`Admin verifying trip verification ${id} with status: ${status}`);

        const verification = await TripVerificationRepository.updateStatus(id, status, remarks);

        if (verification && status === 'approved') {
            await DriverRepository.update(verification.driver_id, { is_trip_verified: true });
            logger.info(`Driver ${verification.driver_id} is now trip verified.`);
        } else if (verification && status === 'rejected') {
            await DriverRepository.update(verification.driver_id, { is_trip_verified: false });
        }

        return verification;
    }

    /**
     * Helper for admin: Get trip photo and profile photo side-by-side
     */
    static async getComparisonData(driverId: string) {
        const latestTripVerification = await this.getLatestVerification(driverId);
        const documents = await DriverDocumentsRepository.findByDriverId(driverId);
        const profileSelfie = documents.find(d => d.document_type === 'profile_selfie');

        return {
            tripVerification: latestTripVerification,
            profileSelfie: profileSelfie ? profileSelfie.document_url : null
        };
    }

    /**
     * Get full comparison data for a specific verification (by ID)
     */
    static async getVerificationDetails(verificationId: string) {
        const verification = await TripVerificationRepository.findById(verificationId);
        const signedVerification = await this.signVerificationUrls(verification);
        if (!signedVerification) return null;

        const documents = await DriverDocumentsRepository.findByDriverId(signedVerification.driver_id);
        // Find profile selfie and sign its URL as well
        const profileSelfieDoc = documents.find(d => d.document_type === 'profile_selfie');
        let profileSelfieUrl = null;
        if (profileSelfieDoc && profileSelfieDoc.document_url) {
            try {
                const parsed = typeof profileSelfieDoc.document_url === 'string' ? JSON.parse(profileSelfieDoc.document_url) : profileSelfieDoc.document_url;
                const url = parsed.url || parsed.front || parsed;
                if (url && url.includes('amazonaws.com')) {
                    const urlObj = new URL(url);
                    const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                    profileSelfieUrl = await s3Service.getReadUrl(key);
                } else {
                    profileSelfieUrl = url;
                }
            } catch (e) {
                profileSelfieUrl = profileSelfieDoc.document_url;
            }
        }

        const driver = await DriverRepository.findById(signedVerification.driver_id);

        return {
            verification: signedVerification,
            profileSelfie: profileSelfieUrl,
            driver: driver ? {
                id: driver.driverId,
                name: driver.full_name,
                phone: driver.phone_number,
                profile_picture: driver.profile_picture,
            } : null,
        };
    }

    /**
     * TEST ONLY: Force verify a driver for testing purposes
     */
    static async testForceVerifyDriver(driverId: string): Promise<void> {
        logger.info(`Force verifying driver ${driverId} for testing`);
        
        // 1. Update driver flag
        await DriverRepository.update(driverId, { is_trip_verified: true });

        // 2. If there's a pending verification, approve it
        const latest = await this.getLatestVerification(driverId);
        if (latest && latest.status === 'pending') {
            await TripVerificationRepository.updateStatus(latest.id, 'approved', 'Auto-approved for testing');
        }
    }
}
