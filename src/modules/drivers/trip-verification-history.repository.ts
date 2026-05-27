import { query } from '../../shared/database';
import { LogVerificationEventInput, TripVerificationHistory } from './trip-verification-history.model';

export const TripVerificationHistoryRepository = {
    async logEvent(data: LogVerificationEventInput): Promise<TripVerificationHistory> {
        const sql = `
            INSERT INTO trip_verification_history (
                verification_id, driver_id, trip_id, selfie_url, car_image_url, car_images,
                status, selfie_status, car_image_status, event_type, admin_id,
                remarks, selfie_remarks, car_image_remarks
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `;

        const carImagesJson = data.car_images ? JSON.stringify(data.car_images) : null;

        const result = await query(sql, [
            data.verification_id,
            data.driver_id,
            data.trip_id || null,
            data.selfie_url,
            data.car_image_url || null,
            carImagesJson,
            data.status,
            data.selfie_status || null,
            data.car_image_status || null,
            data.event_type,
            data.admin_id || null,
            data.remarks || null,
            data.selfie_remarks || null,
            data.car_image_remarks || null
        ]);

        return result.rows[0] as TripVerificationHistory;
    },

    async getByVerificationId(verificationId: string): Promise<TripVerificationHistory[]> {
        const sql = `
            SELECT * FROM trip_verification_history
            WHERE verification_id = $1
            ORDER BY created_at DESC
        `;
        const result = await query(sql, [verificationId]);
        return result.rows as TripVerificationHistory[];
    },

    async getByTripId(tripId: string): Promise<TripVerificationHistory[]> {
        const sql = `
            SELECT * FROM trip_verification_history
            WHERE trip_id = $1
            ORDER BY created_at DESC
        `;
        const result = await query(sql, [tripId]);
        return result.rows as TripVerificationHistory[];
    }
};
