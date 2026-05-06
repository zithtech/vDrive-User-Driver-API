import { query } from '../../shared/database';
import { TripVerification, TripVerificationStatus, ImageVerificationStatus } from './trip-verification.model';

export const TripVerificationRepository = {
  async findByDriverId(driverId: string): Promise<TripVerification[]> {
    const sqlQuery = `
      SELECT id, driver_id, trip_id, selfie_url, car_image_url, car_images, 
             status, selfie_status, car_image_status, remarks, selfie_remarks, car_image_remarks,
             rejection_reason, admin_id, attempt_number, created_at, updated_at
      FROM trip_verifications
      WHERE driver_id = $1
      ORDER BY created_at DESC
    `;
    const result = await query(sqlQuery, [driverId]);
    return result.rows as TripVerification[];
  },

  async findById(id: string): Promise<TripVerification | null> {
    const sqlQuery = `
      SELECT id, driver_id, trip_id, selfie_url, car_image_url, car_images,
             status, selfie_status, car_image_status, remarks, selfie_remarks, car_image_remarks,
             rejection_reason, admin_id, attempt_number, created_at, updated_at
      FROM trip_verifications
      WHERE id = $1
    `;
    const result = await query(sqlQuery, [id]);
    const row = result.rows[0];
    return row ? (row as TripVerification) : null;
  },

  async findByTripId(tripId: string): Promise<TripVerification | null> {
    const sqlQuery = `
      SELECT id, driver_id, trip_id, selfie_url, car_image_url, car_images,
             status, selfie_status, car_image_status, remarks, selfie_remarks, car_image_remarks,
             rejection_reason, admin_id, attempt_number, created_at, updated_at
      FROM trip_verifications
      WHERE trip_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await query(sqlQuery, [tripId]);
    const row = result.rows[0];
    return row ? (row as TripVerification) : null;
  },

  async findPendingVerifications(): Promise<TripVerification[]> {
    const sqlQuery = `
      SELECT tv.id, tv.driver_id, tv.trip_id, 
             tv.selfie_url, tv.car_image_url, tv.car_images,
             tv.status, tv.selfie_status, tv.car_image_status, tv.remarks, 
             tv.selfie_remarks, tv.car_image_remarks,
             tv.rejection_reason, tv.admin_id, tv.attempt_number, 
             tv.created_at, tv.updated_at,
             d.full_name as driver_name, d.phone_number as driver_phone,
             t.pickup_address, t.drop_address, t.trip_status
      FROM trip_verifications tv
      LEFT JOIN drivers d ON tv.driver_id = d.id
      LEFT JOIN trips t ON tv.trip_id = t.trip_id
      WHERE tv.status = 'pending'
      ORDER BY tv.created_at DESC
    `;
    const result = await query(sqlQuery, []);
    return result.rows;
  },

  async upsert(data: {
    driver_id: string;
    trip_id?: string;
    selfie_url: string;
    car_image_url?: string;
    car_images?: string[];
  }): Promise<TripVerification> {
    // Check if there's an existing rejected verification for this trip to increment attempt
    let attemptNumber = 1;
    if (data.trip_id) {
      const existing = await this.findByTripId(data.trip_id);
      if (existing && existing.status === 'rejected') {
        attemptNumber = (existing.attempt_number || 1) + 1;
      }
    }

    const insertQuery = `
      INSERT INTO trip_verifications (driver_id, trip_id, selfie_url, car_image_url, car_images, status, selfie_status, car_image_status, attempt_number)
      VALUES ($1, $2, $3, $4, $5, 'pending', 'pending', 'pending', $6)
      RETURNING *
    `;

    const carImagesJson = data.car_images ? JSON.stringify(data.car_images) : null;

    const result = await query(insertQuery, [
      data.driver_id,
      data.trip_id || null,
      data.selfie_url,
      data.car_image_url || (data.car_images?.[0] || ''),
      carImagesJson,
      attemptNumber
    ]);
    return result.rows[0] as TripVerification;
  },

  async updateStatus(
    id: string,
    status: TripVerificationStatus,
    remarks?: string
  ): Promise<TripVerification | null> {
    const sqlQuery = `
      UPDATE trip_verifications
      SET status = $2, remarks = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sqlQuery, [id, status, remarks || null]);
    const row = result.rows[0];
    return row ? (row as TripVerification) : null;
  },

  async updateGranularStatus(
    id: string,
    data: {
      selfie_status?: ImageVerificationStatus;
      car_image_status?: ImageVerificationStatus;
      selfie_remarks?: string;
      car_image_remarks?: string;
      admin_id?: string;
    }
  ): Promise<TripVerification | null> {
    // Compute overall status from granular statuses
    const current = await this.findById(id);
    if (!current) return null;

    const newSelfieStatus = data.selfie_status || current.selfie_status;
    const newCarStatus = data.car_image_status || current.car_image_status;

    let overallStatus: TripVerificationStatus = 'pending';
    if (newSelfieStatus === 'approved' && newCarStatus === 'approved') {
      overallStatus = 'approved';
    } else if (newSelfieStatus === 'rejected' || newCarStatus === 'rejected') {
      overallStatus = 'rejected';
    }

    // Build rejection_reason JSON
    const rejectionReason: any = {};
    if (newSelfieStatus === 'rejected') {
      rejectionReason.selfie = data.selfie_remarks || current.selfie_remarks || 'Rejected';
    }
    if (newCarStatus === 'rejected') {
      rejectionReason.car_image = data.car_image_remarks || current.car_image_remarks || 'Rejected';
    }

    const sqlQuery = `
      UPDATE trip_verifications
      SET selfie_status = $2, 
          car_image_status = $3, 
          selfie_remarks = $4, 
          car_image_remarks = $5,
          status = $6,
          rejection_reason = $7,
          admin_id = $8,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sqlQuery, [
      id,
      newSelfieStatus,
      newCarStatus,
      data.selfie_remarks || current.selfie_remarks || null,
      data.car_image_remarks || current.car_image_remarks || null,
      overallStatus,
      Object.keys(rejectionReason).length > 0 ? JSON.stringify(rejectionReason) : null,
      data.admin_id || null,
    ]);
    const row = result.rows[0];
    return row ? (row as TripVerification) : null;
  },

  /** Re-upload specific image(s) for a rejected verification */
  async reuploadImages(
    id: string,
    data: {
      selfie_url?: string;
      car_image_url?: string;
      car_images?: string[];
    }
  ): Promise<TripVerification | null> {
    const sets: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (data.selfie_url) {
      sets.push(`selfie_url = $${paramIndex}, selfie_status = 'pending', selfie_remarks = NULL`);
      values.push(data.selfie_url);
      paramIndex++;
    }
    if (data.car_image_url) {
      sets.push(`car_image_url = $${paramIndex}, car_image_status = 'pending', car_image_remarks = NULL`);
      values.push(data.car_image_url);
      paramIndex++;
    }
    if (data.car_images) {
      sets.push(`car_images = $${paramIndex}, car_image_status = 'pending', car_image_remarks = NULL`);
      values.push(JSON.stringify(data.car_images));
      paramIndex++;
    }

    if (sets.length === 0) return null;

    sets.push("status = 'pending'");
    sets.push('attempt_number = attempt_number + 1');
    sets.push('rejection_reason = NULL');
    sets.push('updated_at = NOW()');

    const sqlQuery = `
      UPDATE trip_verifications
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sqlQuery, values);
    const row = result.rows[0];
    return row ? (row as TripVerification) : null;
  },

  async deleteByDriverId(driverId: string): Promise<void> {
    const sqlQuery = 'DELETE FROM trip_verifications WHERE driver_id = $1';
    await query(sqlQuery, [driverId]);
  },
};
