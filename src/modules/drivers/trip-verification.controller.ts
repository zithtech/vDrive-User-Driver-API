import { Request, Response, NextFunction } from 'express';
import { TripVerificationService } from './trip-verification.service';
import { successResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';

export class TripVerificationController {
    /**
     * Driver: Submit photos after S3 upload is complete
     */
    static async submitPhotos(req: Request, res: Response, next: NextFunction) {
        try {
            const { driverId } = req.params;
            const { selfie_url, car_image_url, car_images, trip_id } = req.body;

            logger.info(`Trip photos submission request for driver: ${driverId}`);

            const verification = await TripVerificationService.submitPhotos({
                driver_id: driverId as string,
                trip_id,
                selfie_url,
                car_image_url,
                car_images
            });

            return successResponse(res, 201, 'Trip photos submitted successfully', verification);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Driver: Re-upload specific rejected images
     */
    static async reuploadImages(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params; // verification ID
            const { selfie_url, car_image_url, car_images } = req.body;

            logger.info(`Re-upload request for verification: ${id}`);

            const verification = await TripVerificationService.reuploadImages(id as string, {
                selfie_url,
                car_image_url,
                car_images,
            });

            if (!verification) {
                throw { statusCode: 404, message: 'Verification not found' };
            }

            return successResponse(res, 200, 'Images re-uploaded successfully', verification);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Admin: Get comparison data (Trip Selfie vs Profile Selfie)
     */
    static async getComparisonData(req: Request, res: Response, next: NextFunction) {
        try {
            const { driverId } = req.params;
            const data = await TripVerificationService.getComparisonData(driverId as string);
            return successResponse(res, 200, 'Comparison data fetched successfully', data);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Admin: Get full verification details by verification ID
     */
    static async getVerificationDetails(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const data = await TripVerificationService.getVerificationDetails(id as string);
            if (!data) {
                throw { statusCode: 404, message: 'Verification not found' };
            }
            return successResponse(res, 200, 'Verification details fetched', data);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Admin: Granular verify — approve/reject selfie and car images independently
     */
    static async verifyTripGranular(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { selfie_status, car_image_status, selfie_remarks, car_image_remarks, admin_id } = req.body;

            const verification = await TripVerificationService.verifyTripGranular(id as string, {
                selfie_status,
                car_image_status,
                selfie_remarks,
                car_image_remarks,
                admin_id,
            });

            if (!verification) {
                throw { statusCode: 404, message: 'Verification not found' };
            }

            return successResponse(res, 200, `Trip verification updated: ${verification.status}`, verification);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Admin: Legacy simple verify (Approve/Reject)
     */
    static async verifyTrip(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params; // Verification ID
            const { status, remarks } = req.body;

            const verification = await TripVerificationService.verifyTrip(id as string, status, remarks);
            return successResponse(res, 200, `Trip verification ${status} successfully`, verification);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get latest verification status for a driver
     */
    static async getLatestStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { driverId } = req.params;
            const verification = await TripVerificationService.getLatestVerification(driverId as string);
            return successResponse(res, 200, 'Latest verification status fetched', verification);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get verification by trip ID
     */
    static async getByTripId(req: Request, res: Response, next: NextFunction) {
        try {
            const { tripId } = req.params;
            const verification = await TripVerificationService.getVerificationByTripId(tripId as string);
            return successResponse(res, 200, 'Verification fetched by trip', verification);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Admin: Get all pending verifications
     */
    static async getPendingVerifications(req: Request, res: Response, next: NextFunction) {
        try {
            const verifications = await TripVerificationService.getPendingVerifications();
            return successResponse(res, 200, 'Pending verifications fetched', verifications);
        } catch (error) {
            next(error);
        }
    }

    /**
     * TEST ONLY: Force verify driver for testing
     */
    static async testVerifyDriver(req: Request, res: Response, next: NextFunction) {
        try {
            const { driverId } = req.params;
            await TripVerificationService.testForceVerifyDriver(driverId as string);
            return successResponse(res, 200, 'Driver trip status force-verified for testing');
        } catch (error) {
            next(error);
        }
    }
}
