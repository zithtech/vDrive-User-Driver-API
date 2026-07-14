import { UserRole } from '../../enums/user.enums';
import { query } from '../../shared/database';
import { Trip, TripDetailsType } from './trip.model';
import { TripChanges } from './tripChanges.model';
import { logger } from '../../shared/logger';

export const TripRepository = {
  //user-driver
  async findAll(): Promise<Trip[]> {
    const result = await query(
      `SELECT t.*, u.full_name AS passenger_name, COALESCE( jsonb_agg(to_jsonb(tc) ORDER BY tc.changed_at DESC) FILTER (WHERE tc.trip_id IS NOT NULL),'[]'::jsonb) AS trip_changes 
      FROM trips t 
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN trip_changes tc ON t.trip_id = tc.trip_id GROUP BY t.trip_id, u.full_name ORDER BY t.created_at DESC;`
    );
    return result.rows || [];
  },

  async findActiveRequests(bookingType?: string, driverId?: string): Promise<Trip[]> {
    const params: any[] = [];
    // let sql = `
    //   SELECT t.*, u.full_name AS passenger_name
    //   FROM trips t
    //   LEFT JOIN users u ON t.user_id = u.id
    //   WHERE (
    //     (t.trip_status = 'REQUESTED'`;
    let sql = `
      SELECT t.*,
        jsonb_build_object(
            'id', u.id,
            'full_name', u.full_name,
            'first_name', u.first_name,
            'last_name', u.last_name,
            'phone_number', u.phone_number,
            'email', u.email,
            'profile_url', u.profile_url,
            'rating', u.rating
        ) AS user_details
      FROM trips t 
      LEFT JOIN users u ON t.user_id = u.id
    `;

    const whereConditions: string[] = [];
    const statusConditions: string[] = [];

    // Part 1: Requested rides (with optional skip filtering)
    let requestedCond = `t.trip_status = 'REQUESTED'`;
    if (driverId) {
      requestedCond += ` AND NOT EXISTS (
        SELECT 1 FROM trip_skips ts 
        WHERE ts.trip_id = t.trip_id AND ts.driver_id = $${params.length + 1}
      ) AND NOT (COALESCE(t.rejected_drivers, '[]'::jsonb) @> to_jsonb($${params.length + 1}::text))`;
      params.push(driverId);
    }
    statusConditions.push(`(${requestedCond})`);

    // Part 2: Rides assigned to or accepted by THIS driver (only if driverId provided)
    if (driverId) {
      statusConditions.push(
        `(t.trip_status IN ('ASSIGNED', 'ACCEPTED') AND t.driver_id = $${params.length + 1})`
      );
      params.push(driverId);
    }

    // Combine status conditions with OR
    whereConditions.push(`(${statusConditions.join(' OR ')})`);

    // Part 3: Booking type filter
    if (bookingType) {
      whereConditions.push(`t.booking_type = $${params.length + 1}`);
      params.push(bookingType);
    }

    if (whereConditions.length > 0) {
      sql += ` WHERE ` + whereConditions.join(' AND ');
    }

    sql += ` ORDER BY t.scheduled_start_time ASC, t.created_at DESC;`;

    const result = await query(sql, params);
    return result.rows || [];
  },

  async findById(id: string): Promise<Trip | null> {
    const result = await query(
      `SELECT t.*, 
              jsonb_build_object(
                'id', u.id,
                'full_name', u.full_name,
                'first_name', u.first_name,
                'last_name', u.last_name,
                'phone_number', u.phone_number,
                'email', u.email,
                'profile_url', u.profile_url,
                'rating', u.rating
              ) AS user_details,
              jsonb_build_object(
                'id', d.id,
                'first_name', d.first_name,
                'last_name', d.last_name,
                'full_name', d.full_name,
                'phone_number', d.phone_number,
                'profile_pic_url', d.profile_pic_url,
                'rating', d.rating,
                'current_lat', d.current_lat,
                'current_lng', d.current_lng,
                'total_trips', d.total_trips
                -- 'vehicle_number', d.vehicle_number,
                -- 'vehicle_model', d.vehicle_model,
                -- 'vehicle_type', d.vehicle_type
              ) AS driver_details,
      COALESCE(jsonb_agg(to_jsonb(tc)
      ORDER BY tc.changed_at DESC) FILTER (WHERE tc.trip_id IS NOT NULL),'[]'::jsonb) AS trip_changes
      FROM trips t 
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      LEFT JOIN trip_changes tc ON t.trip_id = tc.trip_id WHERE t.trip_id = $1 GROUP BY t.trip_id, u.id, d.id;`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByUserId(
    userId: string,
    role: string,
    limit?: number,
    tab?: string
  ): Promise<{ data: Trip[]; total: number }> {
    let result;
    const limitClause = limit ? ` LIMIT ${limit}` : '';

    let tabFilter = '';
    if (tab === 'completed') {
      tabFilter = "AND t.trip_status = 'COMPLETED'";
    } else if (tab === 'cancelled') {
      tabFilter = "AND t.trip_status IN ('CANCELLED', 'MID_CANCELLED')";
    } else if (tab === 'upcoming') {
      tabFilter =
        "AND t.booking_type = 'SCHEDULED' AND t.trip_status IN ('REQUESTED', 'ACCEPTED', 'ARRIVING', 'ARRIVED')";
    }

    if (role === UserRole.CUSTOMER) {
      result = await query(
        `SELECT t.*, 
                count(*) over() as full_count,
                jsonb_build_object(
                'id', u.id,
                'full_name', u.full_name,
                'first_name', u.first_name,
                'last_name', u.last_name,
                'phone_number', u.phone_number,
                'email', u.email,
                'profile_url', u.profile_url,
                'rating', u.rating
              ) AS user_details,
              jsonb_build_object(
                'id', d.id,
                'first_name', d.first_name,
                'last_name', d.last_name,
                'full_name', d.full_name,
                'phone_number', d.phone_number,
                'profile_pic_url', d.profile_pic_url,
                'rating', d.rating,
                'current_lat', d.current_lat,
                'current_lng', d.current_lng,
                'total_trips', d.total_trips
               -- 'vehicle_number', d.vehicle_number,
               -- 'vehicle_model', d.vehicle_model,
               -- 'vehicle_type', d.vehicle_type
              ) AS driver_details,
              COALESCE(jsonb_agg(to_jsonb(tc) ORDER BY tc.changed_at DESC) 
              FILTER (WHERE tc.id IS NOT NULL), '[]'::jsonb) AS trip_changes
       FROM trips t 
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN trip_changes tc ON t.trip_id = tc.trip_id 
       LEFT JOIN drivers d ON t.driver_id = d.id
       WHERE t.user_id = $1 
       ${tabFilter}
       GROUP BY t.trip_id, u.id, d.id
       ORDER BY t.created_at DESC${limitClause};`,
        [userId]
      );
    } else if (role === UserRole.DRIVER) {
      result = await query(
        `SELECT t.*, 
                count(*) over() as full_count,
                jsonb_build_object(
                'id', u.id,
                'full_name', u.full_name,
                'first_name', u.first_name,
                'last_name', u.last_name,
                'phone_number', u.phone_number,
                'email', u.email,
                'profile_url', u.profile_url,
                'rating', u.rating
              ) AS user_details,
              jsonb_build_object(
                'id', d.id,
                'first_name', d.first_name,
                'last_name', d.last_name,
                'full_name', d.full_name,
                'phone_number', d.phone_number,
                'profile_pic_url', d.profile_pic_url,
                'rating', d.rating,
                'current_lat', d.current_lat,
                'current_lng', d.current_lng,
                'total_trips', d.total_trips
               -- 'vehicle_number', d.vehicle_number,
               -- 'vehicle_model', d.vehicle_model,
               -- 'vehicle_type', d.vehicle_type
              ) AS driver_details,
              COALESCE(jsonb_agg(to_jsonb(tc) ORDER BY tc.changed_at DESC) 
              FILTER (WHERE tc.id IS NOT NULL), '[]'::jsonb) AS trip_changes
       FROM trips t 
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN drivers d ON t.driver_id = d.id
       LEFT JOIN trip_changes tc ON t.trip_id = tc.trip_id 
       WHERE t.driver_id = $1 
       ${tabFilter}
       GROUP BY t.trip_id, u.id, d.id
       ORDER BY t.created_at DESC${limitClause};`,
        [userId]
      );
    }

    const rows = result?.rows || [];
    const total = rows.length > 0 ? parseInt(rows[0].full_count, 10) : 0;

    // Remove the full_count from the actual data returned
    const data = rows.map((row) => {
      const { full_count, ...rest } = row;
      return rest;
    });

    return { data, total };
  },

  async createTrip(data: Partial<Trip>): Promise<Trip | null> {
    const result = await query(
      `
      INSERT INTO trips (user_id, ride_type, service_type,driver_allowance, trip_status, booking_type,is_for_self,passenger_details, original_scheduled_start_time, scheduled_start_time, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, distance_km,trip_duration_minutes, base_fare,additional_charges, platform_fee, total_fare, paid_amount, payment_status, vehicle_model, vehicle_type, transmission_type, discount, applied_coupon_id, coupon_code, otp, package_hours, outstation_trip_type, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,NOW(),NOW())
      RETURNING *;
    `,
      [
        data.user_id,
        data.ride_type,
        data.service_type,
        data.driver_allowance || 0,
        data.trip_status,
        data.booking_type,
        data.is_for_self ?? true,
        data.passenger_details ? JSON.stringify(data.passenger_details) : null,
        data.original_scheduled_start_time,
        data.scheduled_start_time || null,
        data.pickup_lat,
        data.pickup_lng,
        data.pickup_address,
        data.drop_lat,
        data.drop_lng,
        data.drop_address,
        data.distance_km,
        data.trip_duration_minutes || 0,
        data.base_fare,
        data.platform_fee,
        data.additional_charges || 0,
        data.total_fare,
        data.paid_amount || 0,
        data.payment_status || 'PENDING',
        data.vehicle_model,
        data.vehicle_type,
        data.transmission_type,
        data.discount || 0,
        data.applied_coupon_id || null,
        data.coupon_code || null,
        data.otp || null,
        data.package_hours || null,
        data.outstation_trip_type || null,
      ]
    );

    return result.rows[0] || null;
  },

  async updateTrip(trip_id: string, setQuery: string, values: any[]): Promise<Trip | null> {
    const result = await query(
      `UPDATE trips SET ${setQuery}, updated_at = NOW() WHERE trip_id = $${values.length + 1} RETURNING *;`,
      [...values, trip_id]
    );

    return result.rows[0] || null;
  },

  async findActiveTripByUserId(userId: string): Promise<any> {
    const result = await query(
      `SELECT 
        t.*, 
        jsonb_build_object(
                'id', d.id,
                'first_name', d.first_name,
                'last_name', d.last_name,
                'full_name', d.full_name,
                'phone_number', d.phone_number,
                'profile_pic_url', d.profile_pic_url,
                'rating', d.rating,
                'current_lat', d.current_lat,
                'current_lng', d.current_lng,
                'total_trips', d.total_trips
               -- 'vehicle_number', d.vehicle_number,
               -- 'vehicle_model', d.vehicle_model,
               -- 'vehicle_type', d.vehicle_type
              ) AS driver_details,
        COALESCE(
          (SELECT jsonb_agg(tc ORDER BY tc.changed_at DESC)
           FROM trip_changes tc
           WHERE tc.trip_id = t.trip_id), 
          '[]'::jsonb
        ) AS trip_changes
     FROM trips t 
     LEFT JOIN drivers d ON t.driver_id = d.id
     WHERE t.user_id = $1 
       -- AND t.is_for_self = true 
       -- Status check: Include all states that require an active UI overlay
       -- AND t.trip_status IN ( 'LIVE')

       AND t.trip_status NOT IN ('COMPLETED', 'CANCELLED','MID_CANCELLED')
       AND (
         (t.booking_type = 'LIVE' AND t.trip_status = 'LIVE')
         OR
         (t.booking_type = 'SCHEDULED')
       )
     ORDER BY t.created_at DESC;`,
      [userId]
    );
    const rows = result.rows || [];
    return {
      activeTrips: rows.filter((r) => r.booking_type === 'LIVE'),
      scheduledTrips: rows.filter((r) => r.booking_type === 'SCHEDULED'),
    };
  },

  async acceptTrip(tripId: string, driverId: string): Promise<Trip | null> {
    const sql = `
            UPDATE trips 
            SET 
                trip_status = 'ACCEPTED', 
                driver_id = $1 ,
                assigned_at = NOW()
            WHERE 
                trip_id = $2 
                AND trip_status IN ('REQUESTED', 'ASSIGNED')
            RETURNING *;
        `;
    try {
      const result = await query(sql, [driverId, tripId]);
      if (result.rows.length === 0) {
        return null;
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Database Error in acceptTrip: ${error}`);
      throw new Error('Failed to update trip acceptance in database');
    }
  },

  async getDriverDetails(driverId: string) {
    const sql = 'SELECT * FROM drivers WHERE id = $1';
    const result = await query(sql, [driverId]);
    return result.rows[0];
  },

  //Admin
  async getAllTripsWithChanges(): Promise<TripDetailsType[]> {
    const sql = `
      SELECT 
        t.*, 
        t.trip_id,
        t.trip_code AS trip_code,
        t.distance_km AS "Estimate_km",
        u.full_name AS user_name, 
        u.phone_number AS user_phone,
        d.full_name AS driver_name,
        d.phone_number AS driver_phone,
        v.vehicle_number AS car_number,
        COALESCE(v.model, t.vehicle_model) AS car_type,
        COALESCE(t.base_fare, 0) AS base_fare,
        COALESCE(t.waiting_charges, 0) AS waiting_charges,
        COALESCE(t.driver_allowance, 0) AS driver_allowance,
        COALESCE(t.platform_fee, 0) AS platform_fee,
        COALESCE(t.total_fare, 0) AS total_fare,
        0 AS distance_fare_per_km,
        0 AS distance_fare,
        0 AS time_fare_per_minute,
        0 AS time_fare,
        0 AS return_compensation,
        1 AS surge_multiplier,
        0 AS surge_pricing,
        0 AS tip,
        0 AS toll_charges,
        0 AS night_charges,
        0 AS discount,
        5 AS gst_percentage,
        0 AS gst_amount,
        (COALESCE(t.total_fare, 0) - COALESCE(t.platform_fee, 0)) AS subtotal,
        COALESCE(
          json_agg(
            json_build_object(
              'id', tt.id,
              'trip_id', tt.trip_id,
              'sequence_no', tt.sequence_no,
              'event_type', tt.event_type,
              'status', tt.status,
              'actor_type', tt.actor_type,
              'actor_id',              tt.actor_id,
              'actor_name',            tt.actor_name,
              'changed_fields',        tt.changed_fields,
              'old_value',             tt.old_value,
              'new_value',             tt.new_value,
              'notes',                 tt.notes,
              'metadata',              tt.metadata,
              'event_at',              tt.event_at
            ) ORDER BY tt.sequence_no ASC
          ) FILTER (WHERE tt.id IS NOT NULL),
          '[]'
        ) AS trip_transactions
      FROM trips t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN trip_transactions tt ON t.trip_id = tt.trip_id
      GROUP BY t.trip_id, u.full_name, u.phone_number, d.full_name, d.phone_number, v.vehicle_number, v.model
      ORDER BY t.created_at DESC;
    `;
    const result = await query(sql);
    return result.rows;
  },
  // async getAllTripsWithChanges(): Promise<TripDetailsType[]> {
  //   const sql = `
  //     SELECT
  //       t.*,
  //       u.full_name AS user_name,
  //       u.phone_number AS user_phone,
  //       d.full_name AS driver_name,
  //       d.phone_number AS driver_phone,
  //       COALESCE(
  //         json_agg(
  //           json_build_object(
  //             'id', tc.id,
  //             'trip_id', tc.trip_id,
  //             'change_type', tc.change_type,
  //             'old_value', tc.old_value,
  //             'new_value', tc.new_value,
  //             'changed_by', tc.changed_by,
  //             'changed_at', tc.changed_at,
  //             'notes', tc.notes
  //           )
  //         ) FILTER (WHERE tc.id IS NOT NULL), '[]'
  //       ) AS trip_changes
  //     FROM trips t
  //     LEFT JOIN users u ON t.user_id = u.id
  //     LEFT JOIN drivers d ON t.driver_id = d.id
  //     LEFT JOIN trip_changes tc ON t.trip_id = tc.trip_id
  //     GROUP BY t.trip_id, u.full_name, u.phone_number, d.full_name, d.phone_number
  //     ORDER BY t.created_at DESC;
  //   `;
  //   const result = await query(sql);
  //   return result.rows;
  // },

  //TripChanges
  async createTripChanges(data: TripChanges): Promise<Trip | null> {
    const result = await query(
      `INSERT INTO trip_changes (trip_id, change_type, old_value, new_value,changed_by, changed_at, notes) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, NOW(), $6) RETURNING *;`,
      [
        data.trip_id,
        data.change_type,
        data.old_value ? JSON.stringify(data.old_value) : null,
        JSON.stringify(data.new_value),
        data.changed_by,
        data.notes,
      ]
    );
    return result.rows[0] || null;
  },

  async updateTripStatus(tripId: string, tripStatus: string): Promise<Trip | null> {
    const sql = `UPDATE trips SET trip_status = $2 WHERE trip_id = $1 RETURNING *;`;
    try {
      const result = await query(sql, [tripId, tripStatus]);
      if (result.rows.length === 0) {
        return null;
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Database Error in updateTripStatus: ${error}`);
      throw new Error('Failed to update trip Status in database');
    }
  },

  async findActivityByDriverId(
    driverId: string,
    from?: string,
    to?: string,
    status?: string
  ): Promise<any[]> {
    let sql = `
      SELECT t.*, u.full_name AS passenger_name 
      FROM trips t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.driver_id = $1
    `;
    const params: any[] = [driverId];

    if (from) {
      sql += ` AND t.created_at::DATE >= $${params.length + 1}`;
      params.push(from);
    }
    if (to) {
      sql += ` AND t.created_at::DATE <= $${params.length + 1}`;
      params.push(to);
    }
    if (status) {
      sql += ` AND t.trip_status = $${params.length + 1}`;
      params.push(status.toUpperCase());
    }

    sql += ` ORDER BY t.created_at DESC`;

    const result = await query(sql, params);
    return result.rows;
  },

  async getStatsByDriverId(driverId: string): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_trips,
        COUNT(CASE WHEN trip_status = 'COMPLETED' THEN 1 END) as completed_trips,
        COUNT(CASE WHEN trip_status = 'CANCELLED' THEN 1 END) as cancelled_trips,
        SUM(CASE WHEN trip_status = 'COMPLETED' THEN total_fare ELSE 0 END) as total_earnings
      FROM trips 
      WHERE driver_id = $1`,
      [driverId]
    );
    return result.rows[0];
  },

  async cancelTrip(
    tripId: string,
    tripStatus: string,
    cancelReason: string,
    cancelBy: string,
    notes: string
  ): Promise<Trip | null> {
    const sql = `UPDATE trips SET trip_status = $2, cancel_reason = $3, cancel_by = $4, notes = $5, updated_at = NOW() WHERE trip_id = $1 RETURNING *;`;
    try {
      const result = await query(sql, [tripId, tripStatus, cancelReason, cancelBy, notes]);
      if (result.rows.length === 0) {
        return null;
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Database Error in cancelTrip: ${error}`);
      throw new Error('Failed to cancel trip in database');
    }
  },

  async findActiveByDriverId(driverId: string): Promise<Trip | null> {
    const result = await query(
      `SELECT t.*, 
              jsonb_build_object(
                'id', u.id,
                'full_name', u.full_name,
                'first_name', u.first_name,
                'last_name', u.last_name,
                'phone_number', u.phone_number,
                'email', u.email,
                'profile_url', u.profile_url,
                'rating', u.rating
              ) AS user_details
      FROM trips t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.driver_id = $1 
      AND t.trip_status IN ('ASSIGNED', 'ACCEPTED', 'VERIFICATION_PENDING', 'ARRIVING', 'ARRIVED', 'LIVE', 'DESTINATION_REACHED')
      ORDER BY t.created_at DESC
      LIMIT 1;`,
      [driverId]
    );
    return result.rows[0] || null;
  },

  async skipTrip(tripId: string, driverId: string): Promise<void> {
    await query(
      `INSERT INTO trip_skips (driver_id, trip_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
      [driverId, tripId]
    );
  },

  async getCompletedRideCount(userId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) 
       FROM trips
       WHERE user_id = $1 AND trip_status = 'COMPLETED';`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  },
  async resetForRedispatch(tripId: string, cancelledDriverId: string): Promise<Trip | null> {
    const sql = `
      UPDATE trips 
      SET 
        trip_status = 'REQUESTED',
        driver_id = NULL,
        cancel_reason = NULL,
        cancel_by = NULL,
        notes = NULL,
        re_dispatch_count = COALESCE(re_dispatch_count, 0) + 1,
        rejected_drivers = COALESCE(rejected_drivers, '[]'::jsonb) || to_jsonb($2::text),
        updated_at = NOW()
      WHERE trip_id = $1
      RETURNING *;
    `;
    try {
      const result = await query(sql, [tripId, cancelledDriverId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Database Error in resetForRedispatch: ${error}`);
      throw new Error('Failed to reset trip for re-dispatch');
    }
  },

  async getRedispatchCount(tripId: string): Promise<{ count: number; rejectedDrivers: string[] }> {
    const sql = `SELECT COALESCE(re_dispatch_count, 0) as count, COALESCE(rejected_drivers, '[]'::jsonb) as rejected_drivers FROM trips WHERE trip_id = $1;`;
    try {
      const result = await query(sql, [tripId]);
      if (!result.rows[0]) return { count: 0, rejectedDrivers: [] };
      return {
        count: parseInt(result.rows[0].count, 10),
        rejectedDrivers: result.rows[0].rejected_drivers || [],
      };
    } catch (error) {
      logger.error(`Database Error in getRedispatchCount: ${error}`);
      return { count: 0, rejectedDrivers: [] };
    }
  },
};
