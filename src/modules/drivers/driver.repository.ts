import { getClient, query } from '../../shared/database';
import { logger } from '../../shared/logger';
import {
  Driver,
  CreateDriverInput,
  UpdateDriverInput,
  Document,
  KYC,
  Credit,
  Availability,
  Performance,
  Payments,
} from './driver.model';
import { DriverReferralRepository } from '../driver-referrals/driver-referral.repository';
import { DriverOnboardingStatus } from '../../enums/user.enums';

export const DriverRepository = {
  async findDriverById(id: string): Promise<Driver | null> {
    return this.findById(id);
  },

  async create(driverData: CreateDriverInput): Promise<Driver> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Generate unique referral code for the new driver
      const referralCode = await DriverReferralRepository.generateUniqueReferralCode(
        driverData.first_name,
        'DRIVER'
      );

      // Handle referred_by if provided (it comes as a code from the frontend)
      let referrerId = null;
      if (driverData.referred_by) {
        referrerId = await DriverReferralRepository.findByCode(driverData.referred_by, 'DRIVER');
      }

      // Insert driver
      const driverResult = await client.query(
        `INSERT INTO drivers (
          first_name, last_name, phone_number, alternate_contact, email, profile_pic_url, date_of_birth, gender, 
          address, role, status, kyc, onboarding_status, documents_submitted, credit, performance, payments, is_trip_verified, language, device_id, is_vibration_enabled, total_earnings, referral_code, referred_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        RETURNING *`,
        [
          driverData.first_name,
          driverData.last_name,
          driverData.phone_number,
          driverData.alternate_contact || null,
          driverData.email,
          driverData.profilePicUrl || null,
          driverData.date_of_birth,
          driverData.gender,
          JSON.stringify(driverData.address),
          driverData.role,
          driverData.status,
          driverData.kyc_status
            ? JSON.stringify(driverData.kyc_status)
            : '{"overallStatus": "pending", "verifiedAt": null}',
          driverData.onboarding_status || DriverOnboardingStatus.PHONE_VERIFIED,
          driverData.documents_submitted || false,
          driverData.credit
            ? JSON.stringify(driverData.credit)
            : '{"limit": 0, "balance": 0, "totalRecharged": 0, "totalUsed": 0, "lastRechargeAt": null}',
          driverData.performance
            ? JSON.stringify(driverData.performance)
            : '{"averageRating": 0, "totalTrips": 0, "cancellations": 0, "lastActive": null}',
          driverData.payments
            ? JSON.stringify(driverData.payments)
            : '{"totalEarnings": 0, "pendingPayout": 0, "commissionPaid": 0}',
          driverData.is_trip_verified || false,
          driverData.language || 'en',
          driverData.device_id || null,
          driverData.is_vibration_enabled ?? true,
          driverData.total_earnings || 0,
          referralCode,
          referrerId,
        ]
      );

      const driver = driverResult.rows[0];
      const driverId = driver.id;

      // If referred, create entry in referrals table
      if (referrerId) {
        await DriverReferralRepository.createReferral({
          referrer_id: referrerId,
          referee_id: driverId,
          referral_type: 'DRIVER',
          status: 'PENDING',
        });
      }

      // Insert documents if provided
      const documents = [];
      if (driverData.documents && driverData.documents.length > 0) {
        for (const doc of driverData.documents) {
          const docResult = await client.query(
            `INSERT INTO driver_documents (
              driver_id, document_type, document_number, document_url, 
              status, license_status, expiry_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
              driverId,
              doc.documentType,
              doc.documentNumber,
              JSON.stringify(doc.documentUrl),
              doc.licenseStatus || 'pending',
              doc.licenseStatus || 'pending',
              doc.expiryDate || null,
            ]
          );
          documents.push(docResult.rows[0]);
        }
      }

      await client.query('COMMIT');

      // Return formatted driver object
      return await DriverRepository.mapToDriver(driver, documents, [], [], []);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async update(id: string, driverData: UpdateDriverInput): Promise<Driver | null> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Update driver fields
      const driverFields: string[] = [];
      const driverValues: any[] = [];
      let paramCount = 1;

      if (driverData.first_name) {
        driverFields.push(`first_name = $${paramCount++}`);
        driverValues.push(driverData.first_name);
      }
      if (driverData.last_name) {
        driverFields.push(`last_name = $${paramCount++}`);
        driverValues.push(driverData.last_name);
      }
      if (driverData.full_name) {
        driverFields.push(`full_name = $${paramCount++}`);
        driverValues.push(driverData.full_name);
      }
      if (driverData.phone_number) {
        driverFields.push(`phone_number = $${paramCount++}`);
        driverValues.push(driverData.phone_number);
      }
      if (driverData.alternate_contact !== undefined) {
        driverFields.push(`alternate_contact = $${paramCount++}`);
        driverValues.push(driverData.alternate_contact);
      }
      if (driverData.email) {
        driverFields.push(`email = $${paramCount++}`);
        driverValues.push(driverData.email);
      }
      if (driverData.profilePicUrl) {
        driverFields.push(`profile_pic_url = $${paramCount++}`);
        driverValues.push(driverData.profilePicUrl);
      }
      if (driverData.date_of_birth) {
        driverFields.push(`date_of_birth = $${paramCount++}`);
        driverValues.push(driverData.date_of_birth);
      }
      if (driverData.gender) {
        driverFields.push(`gender = $${paramCount++}`);
        driverValues.push(driverData.gender);
      }
      if (driverData.address) {
        driverFields.push(`address = $${paramCount++}`);
        driverValues.push(JSON.stringify(driverData.address));
      }
      if (driverData.role) {
        driverFields.push(`role = $${paramCount++}`);
        driverValues.push(driverData.role);
      }
      if (driverData.status) {
        driverFields.push(`status = $${paramCount++}`);
        driverValues.push(driverData.status);
      }
      if (driverData.status_reason) {
        driverFields.push(`status_reason = $${paramCount++}`);
        driverValues.push(driverData.status_reason);
      }
      if (driverData.onboarding_status) {
        driverFields.push(`onboarding_status = $${paramCount++}`);
        driverValues.push(driverData.onboarding_status);
      }
      if (driverData.documents_submitted !== undefined) {
        driverFields.push(`documents_submitted = $${paramCount++}`);
        driverValues.push(driverData.documents_submitted);
      }
      if (driverData.is_trip_verified !== undefined) {
        driverFields.push(`is_trip_verified = $${paramCount++}`);
        driverValues.push(driverData.is_trip_verified);
      }
      if (driverData.language) {
        driverFields.push(`language = $${paramCount++}`);
        driverValues.push(driverData.language);
      }
      if (driverData.is_vibration_enabled !== undefined) {
        driverFields.push(`is_vibration_enabled = $${paramCount++}`);
        driverValues.push(driverData.is_vibration_enabled);
      }
      if (driverData.fcm_token) {
        driverFields.push(`fcm_token = $${paramCount++}`);
        driverValues.push(driverData.fcm_token);
      }
      if (driverData.total_earnings !== undefined) {
        driverFields.push(`total_earnings = $${paramCount++}`);
        driverValues.push(driverData.total_earnings);
      }
      if (driverData.total_trips !== undefined) {
        driverFields.push(`total_trips = $${paramCount++}`);
        driverValues.push(driverData.total_trips);
      }
      if (driverData.referral_code) {
        driverFields.push(`referral_code = $${paramCount++}`);
        driverValues.push(driverData.referral_code);
      }
      if (driverData.referred_by) {
        driverFields.push(`referred_by = $${paramCount++}`);
        driverValues.push(driverData.referred_by);
      }

      // JSONB updates using merge operator ||
      // 🛡️ Use COALESCE to prevent NULL results when merging
      if (driverData.kyc) {
        driverFields.push(`kyc = COALESCE(kyc, '{}'::jsonb) || $${paramCount++}`);
        driverValues.push(JSON.stringify(driverData.kyc));
      }
      if (driverData.credit) {
        driverFields.push(`credit = COALESCE(credit, '{}'::jsonb) || $${paramCount++}`);
        driverValues.push(JSON.stringify(driverData.credit));
      }
      if (driverData.availability) {
        driverFields.push(`availability = COALESCE(availability, '{}'::jsonb) || $${paramCount++}`);
        driverValues.push(JSON.stringify(driverData.availability));
      }
      if (driverData.rating !== undefined) {
        driverFields.push(`rating = $${paramCount++}`);
        driverValues.push(driverData.rating);
      }

      if (driverData.performance) {
        // Sync rating to performance object if provided
        const performanceData = { ...driverData.performance };
        if (driverData.rating !== undefined) {
          performanceData.averageRating = driverData.rating;
        }

        driverFields.push(`performance = COALESCE(performance, '{}'::jsonb) || $${paramCount++}`);
        driverValues.push(JSON.stringify(performanceData));
      } else if (driverData.rating !== undefined) {
        // If only rating is provided, still sync it to performance JSONB
        driverFields.push(
          `performance = COALESCE(performance, '{}'::jsonb) || jsonb_build_object('averageRating', $${paramCount++}::numeric)`
        );
        driverValues.push(driverData.rating);
      }
      if (driverData.payments) {
        driverFields.push(`payments = COALESCE(payments, '{}'::jsonb) || $${paramCount++}`);
        driverValues.push(JSON.stringify(driverData.payments));
      }

      if (driverFields.length > 0) {
        driverValues.push(id);
        await client.query(
          `UPDATE drivers SET ${driverFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`,
          driverValues
        );
      }

      // Update documents if provided
      if (driverData.documents && driverData.documents.length > 0) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        for (const doc of driverData.documents) {
          let docIdToUpdate = null;

          // 1. If valid UUID provided, try to use it
          if (doc.documentId && uuidRegex.test(doc.documentId)) {
            docIdToUpdate = doc.documentId;
          }
          // 2. If no valid UUID, try to find existing document by type
          else if (doc.documentType) {
            const existingDocResult = await client.query(
              'SELECT id FROM driver_documents WHERE driver_id = $1 AND document_type = $2',
              [id, doc.documentType]
            );
            if (existingDocResult.rows.length > 0) {
              docIdToUpdate = existingDocResult.rows[0].id;
            }
          }

          if (docIdToUpdate) {
            // Update existing document
            const docFields: string[] = [];
            const docValues: any[] = [];
            let dParamCount = 1;

            if (doc.documentType) {
              docFields.push(`document_type = $${dParamCount++}`);
              docValues.push(doc.documentType);
            }
            if (doc.documentNumber) {
              docFields.push(`document_number = $${dParamCount++}`);
              docValues.push(doc.documentNumber);
            }
            if (doc.documentUrl) {
              docFields.push(`document_url = $${dParamCount++}`);
              docValues.push(JSON.stringify(doc.documentUrl));
            }
            if (doc.licenseStatus !== undefined) {
              docFields.push(`license_status = $${dParamCount++}`);
              docValues.push(doc.licenseStatus === '' ? null : doc.licenseStatus);

              // Also sync with 'status' column if it's a valid enum value
              const validStatuses = ['pending', 'verified', 'rejected'];
              if (validStatuses.includes(doc.licenseStatus as string)) {
                docFields.push(`status = $${dParamCount++}`);
                docValues.push(doc.licenseStatus);
              }
            }
            if (doc.expiryDate !== undefined) {
              docFields.push(`expiry_date = $${dParamCount++}`);
              docValues.push(doc.expiryDate === '' ? null : doc.expiryDate);
            }

            if (docFields.length > 0) {
              docValues.push(docIdToUpdate);
              docValues.push(id); // Ensure document belongs to driver
              await client.query(
                `UPDATE driver_documents SET ${docFields.join(', ')} WHERE id = $${dParamCount} AND driver_id = $${dParamCount + 1}`,
                docValues
              );
            }
          } else {
            // Create new document
            await client.query(
              `INSERT INTO driver_documents (
                driver_id, document_type, document_number, document_url, 
                status, license_status, expiry_date
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                id,
                doc.documentType,
                doc.documentNumber,
                JSON.stringify(doc.documentUrl),
                doc.licenseStatus || 'pending',
                doc.licenseStatus || 'pending',
                doc.expiryDate || null,
              ]
            );
          }
        }
      }

      await client.query('COMMIT');
      return this.findById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async findById(id: string): Promise<Driver | null> {
    // Get driver
    const driverResult = await query('SELECT * FROM drivers WHERE id = $1', [id]);
    if (driverResult.rows.length === 0) return null;

    const driver = driverResult.rows[0];
    // logger.info(`Driver data fetched: ${JSON.stringify(driver)}`);
    // Get completed trips count
    try {
      const completedTripsResult = await query(
        "SELECT COUNT(*) FROM trips WHERE driver_id = $1 AND trip_status = 'COMPLETED'",
        [id]
      );
      driver.total_trips = parseInt(completedTripsResult.rows[0].count);
    } catch (error) {
      logger.error(`Error fetching total completed trips for driver ${id}: ${error}`);
      driver.total_trips = 0;
    }

    // Get documents
    const documentsResult = await query('SELECT * FROM driver_documents WHERE driver_id = $1', [
      id,
    ]);
    const documents = documentsResult.rows;

    // Get recharges
    let recharges = [];
    try {
      const rechargesResult = await query(
        'SELECT * FROM driver_recharges WHERE driver_id = $1 ORDER BY created_at DESC',
        [id]
      );
      recharges = rechargesResult.rows;
    } catch (error) {
      logger.error(`Error fetching recharges for driver ${id}: ${error}`);
    }

    // Get credit usage
    let creditUsage = [];
    try {
      const creditUsageResult = await query(
        'SELECT * FROM driver_credit_usage WHERE driver_id = $1 ORDER BY created_at DESC',
        [id]
      );
      creditUsage = creditUsageResult.rows;
    } catch (error) {
      logger.error(`Error fetching credit usage for driver ${id}: ${error}`);
    }

    // Get active subscription
    let activeSubscription = null;
    try {
      const subscriptionResult = await query(
        `SELECT ds.*, rp.plan_name 
         FROM driver_subscriptions ds
         JOIN recharge_plans rp ON ds.plan_id = rp.id
         WHERE ds.driver_id = $1 AND ds.status = 'active'
         LIMIT 1`,
        [id]
      );
      activeSubscription = subscriptionResult.rows[0] || null;
    } catch (error) {
      logger.error(`Error fetching active subscription for driver ${id}: ${error}`);
    }

    // TODO: Fetch activity logs if table exists, for now pass empty
    const activityLogs: any[] = [];

    return await DriverRepository.mapToDriver(
      driver,
      documents,
      recharges,
      creditUsage,
      activityLogs,
      activeSubscription
    );
  },

  async findAll(
    limit: number = 50,
    offset: number = 0,
    status?: string,
    onboardingStatus?: string
  ): Promise<Driver[]> {
    let queryStr = 'SELECT * FROM drivers';
    const params: any[] = [];
    const conditions: string[] = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (onboardingStatus) {
      params.push(onboardingStatus);
      conditions.push(`onboarding_status = $${params.length}`);
    }

    if (conditions.length > 0) {
      queryStr += ' WHERE ' + conditions.join(' AND ');
    }

    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const driversResult = await query(queryStr, params);

    const drivers = [];
    for (const driver of driversResult.rows) {
      try {
        const fullDriver = await DriverRepository.findById(driver.id);
        if (fullDriver) drivers.push(fullDriver);
      } catch (error) {
        logger.error(`Error fetching full data for driver ${driver.id}: ${error}`);
        // Map basic driver data if full fetch fails to prevent breaking the whole list
        drivers.push(await DriverRepository.mapToDriver(driver, [], [], [], []));
      }
    }

    return drivers;
  },

  async mapToDriver(
    driver: any,
    documents: any[] = [],
    recharges: any[] = [],
    creditUsage: any[] = [],
    activityLogs: any[] = [],
    activeSubscription: any = null
  ): Promise<Driver> {
    const safeParse = (data: any) => {
      if (!data) return undefined;
      if (typeof data === 'object') return data;
      try {
        return JSON.parse(data);
      } catch (e) {
        return data;
      }
    };

    const fName = driver.first_name || '';
    const lName = driver.last_name || '';

    // Resolve profile picture URL (return raw S3 URL — frontend proxy handles signing)
    const profileUrl = (() => {
      const primary = safeParse(driver.profile_pic_url);
      if (primary) {
        const url =
          typeof primary === 'object' ? primary.url || primary.front || undefined : primary;
        if (url) {
          logger.info(`[mapToDriver] Resolved image from primary field for driver ${driver.id}`);
          return url;
        }
      }
      const selfie = documents.find(
        (d) =>
          d.document_type?.toLowerCase() === 'profile_selfie' ||
          d.document_type?.toLowerCase() === 'profile selfie' ||
          d.document_type === 'PROFILE_SELFIE'
      );
      if (!selfie || !selfie.document_url) return undefined;
      const selfieUrl = safeParse(selfie.document_url);
      const url =
        typeof selfieUrl === 'object' ? selfieUrl.url || selfieUrl.front || undefined : selfieUrl;
      if (url) {
        logger.info(`[mapToDriver] Resolved image from selfie document for driver ${driver.id}`);
      }
      return url;
    })();

    return {
      driverId: driver.id,
      first_name: fName,
      last_name: lName,
      full_name: driver.full_name,
      phone_number: driver.phone_number,
      alternate_contact: driver.alternate_contact || undefined,
      email: driver.email,
      profilePicUrl: profileUrl,
      profile_picture: profileUrl,
      profile_pic_url: profileUrl,
      date_of_birth: driver.date_of_birth,
      gender: driver.gender,
      address: safeParse(driver.address),
      role: driver.role,
      status: driver.status,
      status_reason: driver.status_reason,
      rating: parseFloat(driver.rating) || 0,
      total_trips: driver.total_trips || 0,
      total_earnings: parseFloat(driver.total_earnings) || 0,
      availability: safeParse(driver.availability) || {
        online: false,
        status: 'OFFLINE',
        lastActive: null,
      },
      last_active: driver.last_active,
      kyc_status: safeParse(driver.kyc),
      onboarding_status: driver.onboarding_status,
      documents_submitted: driver.documents_submitted,
      credit: safeParse(driver.credit),
      recharges: recharges.map((r) => ({
        transactionId: r.id,
        amount: parseFloat(r.amount),
        paymentMethod: r.payment_method,
        reference: r.reference || '',
        status: r.status,
        createdAt: r.created_at,
      })),
      creditUsage: creditUsage.map((cu) => ({
        usageId: cu.id,
        tripId: cu.trip_id || '',
        amount: parseFloat(cu.amount),
        type: cu.type,
        description: cu.description || '',
        createdAt: cu.created_at,
      })),
      activityLogs: activityLogs.map((log) => ({
        logId: log.id,
        action: log.action,
        details: log.details || '',
        createdAt: log.created_at,
      })),
      active_subscription: activeSubscription
        ? {
            platform_subscription_id: activeSubscription.id,
            plan_name: activeSubscription.plan_name,
            billing_cycle: activeSubscription.billing_cycle,
            start_date: activeSubscription.start_date,
            expiry_date: activeSubscription.expiry_date,
            status: activeSubscription.status,
          }
        : undefined,
      created_at: driver.created_at,
      updated_at: driver.updated_at,
      performance: (() => {
        const perf = safeParse(driver.performance) || {};
        return {
          ...perf,
          averageRating: perf.averageRating !== undefined ? perf.averageRating : (parseFloat(driver.rating) || 0),
          totalTrips: perf.totalTrips !== undefined ? perf.totalTrips : (driver.total_trips || 0),
          cancellations: perf.cancellations || 0,
          lastActive: perf.lastActive || null,
        };
      })(),
      payments: safeParse(driver.payments),
      is_trip_verified: driver.is_trip_verified,
      language: driver.language || 'en',
      is_vibration_enabled: driver.is_vibration_enabled,
      fcm_token: driver.fcm_token || undefined,
      referral_code: driver.referral_code || undefined,
      referred_by: driver.referred_by || undefined,
      vdrive_id: driver.vdrive_id,
      current_lat: driver.current_lat,
      current_lng: driver.current_lng,
      current_heading: driver.current_heading,
      documents: documents.map((doc) => ({
        documentId: doc.id,
        documentType: doc.document_type,
        documentNumber: doc.document_number,
        documentUrl: safeParse(doc.document_url),
        status: doc.status || 'pending',
        licenseStatus: doc.status || 'pending',
        expiryDate: doc.expiry_date,
        remarks: doc.remarks,
        verifiedAt: doc.verified_at,
      })),
    };
  },

  async getDriverbyID(id: string): Promise<Driver | null> {
    return this.findById(id);
  },

  async findNearbyDriversExpanding(lng: number, lat: number) {
    const radiusTiers = [500, 2000, 5000, 10000, 20000];
    let drivers = [];

    for (const radius of radiusTiers) {
      logger.info(`Searching within ${radius} meters...`);

      drivers = await this.findNearbyDrivers(lng, lat, radius);

      if (drivers.length > 0) {
        return {
          drivers,
          searchedRadius: radius,
        };
      }
    }

    return {
      drivers: [],
      searchedRadius: radiusTiers[radiusTiers.length - 1],
    };
  },
  async findNearbyDrivers(lng: number, lat: number, radiusMeters: number) {
    logger.info(`findNearbyDrivers: ${lng}, ${lat}, ${radiusMeters}`);
    try {
      const { getRedisClient } = require('../../shared/redis');
      const redis = getRedisClient();

      // 1. Get real-time drivers within radius from Redis
      // Returns: [ [ 'driverId', 'distance', [ 'lng', 'lat' ] ], ... ]
      const nearbyFromRedis = (await redis.georadius(
        'driver_locations',
        lng,
        lat,
        radiusMeters,
        'm',
        'WITHDIST',
        'WITHCOORD',
        'ASC'
      )) as any[];

      if (!nearbyFromRedis || nearbyFromRedis.length === 0) {
        logger.info('No drivers found in Redis, falling back to PostGIS');
        return await this.findNearbyDriversPostGIS(lng, lat, radiusMeters);
      }

      const driverIds = nearbyFromRedis.map((entry) => entry[0]);

      // 2. Query Postgres to filter by availability and get driver details
      const sqlQuery = `
         SELECT
          id,
          first_name,
          last_name,
          full_name,
          rating,
          phone_number,
          fcm_token,
          availability
      FROM drivers
      WHERE id = ANY($1)
        AND (availability->>'online')::boolean = true
        AND (availability->>'status')::text IN ('ONLINE', 'HAS_UPCOMING_SCHEDULED')
        AND status = 'active'
      `;
      const { rows } = await query(sqlQuery, [driverIds]);

      // 3. Combine DB details with real-time Redis coordinates
      const onlineDrivers = rows.map((dbDriver) => {
        const redisData = nearbyFromRedis.find((entry) => entry[0] === dbDriver.id);
        return {
          ...dbDriver,
          current_lng: redisData ? parseFloat(redisData[2][0]) : dbDriver.current_lng,
          current_lat: redisData ? parseFloat(redisData[2][1]) : dbDriver.current_lat,
          distance_meters: redisData ? Math.round(parseFloat(redisData[1])) : 0,
        };
      });

      // 4. Sort by distance
      onlineDrivers.sort((a, b) => a.distance_meters - b.distance_meters);

      return onlineDrivers;
    } catch (error) {
      logger.error('Error finding nearby drivers via Redis, falling back to PostGIS:', error);
      return await this.findNearbyDriversPostGIS(lng, lat, radiusMeters);
    }
  },

  async findNearbyDriversPostGIS(lng: number, lat: number, radiusMeters: number) {
    const sqlQuery = `
       SELECT
        id,
        first_name,
        last_name,
        full_name,
        current_lat,
        current_lng,
        rating,
        phone_number,
        fcm_token,
        availability,
        ROUND(ST_Distance(location, ST_MakePoint($1, $2)::geography)::numeric, 0) as distance_meters
    FROM drivers
    WHERE (availability->>'online')::boolean = true
      AND (availability->>'status')::text IN ('ONLINE', 'HAS_UPCOMING_SCHEDULED')
      AND status = 'active'
      AND ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3)
    ORDER BY distance_meters ASC;
    `;
    const { rows } = await query(sqlQuery, [lng, lat, radiusMeters]);
    return rows;
  },

  async updateLocation(id: string, lat: number, lng: number, address: string) {
    const sqlQuery = `
            UPDATE drivers 
            SET 
                current_lat = $1,
                current_lng = $2,
                location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                last_active = CURRENT_TIMESTAMP 
            WHERE id = $3 AND is_deleted = FALSE
            RETURNING id, full_name;
        `;

    const { rows } = await query(sqlQuery, [lat, lng, id]);
    return rows[0];
  },

  async getFcmTokenById(id: string): Promise<string | null> {
    const result = await query('SELECT fcm_token FROM drivers WHERE id = $1', [id]);
    return result.rows[0]?.fcm_token || null;
  },

  /**
   * Dedicated method to update only the FCM token
   */
  async updateFcmToken(driverId: string, fcmToken: string): Promise<void> {
    await query('UPDATE drivers SET fcm_token = $1, updated_at = NOW() WHERE id = $2', [
      fcmToken,
      driverId,
    ]);
  },

  /**
   * Increment driver trip statistics atomically
   */
  async incrementStats(driverId: string, earnings: number): Promise<void> {
    const sql = `
      UPDATE drivers 
      SET 
        total_trips = total_trips + 1,
        total_earnings = total_earnings + $1,
        performance = COALESCE(performance, jsonb_build_object('totalTrips', 0, 'averageRating', 0, 'cancellations', 0, 'lastActive', null)) || 
                      jsonb_build_object('totalTrips', (COALESCE(performance->>'totalTrips', '0')::int + 1)),
        payments = COALESCE(payments, jsonb_build_object('totalEarnings', 0, 'pendingPayout', 0, 'commissionPaid', 0)) || 
                   jsonb_build_object('totalEarnings', (COALESCE(payments->>'totalEarnings', '0')::numeric + $1))
      WHERE id = $2
    `;
    await query(sql, [earnings, driverId]);
  },

  /**
   * Atomically add credit balance to a driver's wallet/JSONB field
   * and record the transaction in driver_credit_usage.
   */
  async addCredit(
    driverId: string,
    amount: number,
    type: string,
    description: string,
    externalClient?: any
  ): Promise<void> {
    const client = externalClient || (await getClient());
    const shouldRelease = !externalClient;
    const shouldTransact = !externalClient;

    try {
      if (shouldTransact) await client.query('BEGIN');

      // 1. Update the JSONB credit field atomically
      const updateSql = `
        UPDATE drivers 
        SET credit = jsonb_set(
          jsonb_set(
            COALESCE(credit, '{"limit": 0, "balance": 0, "totalRecharged": 0, "totalUsed": 0, "lastRechargeAt": null}'::jsonb), 
            '{balance}', 
            (COALESCE((credit->>'balance')::numeric, 0) + $1)::text::jsonb
          ),
          '{totalRecharged}', 
          (COALESCE((credit->>'totalRecharged')::numeric, 0) + $1)::text::jsonb
        ),
        updated_at = NOW() 
        WHERE id = $2
      `;
      await client.query(updateSql, [amount, driverId]);

      // 2. Record the transaction in credit usage table
      const usageSql = `
        INSERT INTO driver_credit_usage (driver_id, amount, type, description, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `;
      await client.query(usageSql, [driverId, amount, type, description]);

      if (shouldTransact) await client.query('COMMIT');
    } catch (error) {
      if (shouldTransact) await client.query('ROLLBACK');
      logger.error(`Error adding credit to driver ${driverId}:`, error);
      throw error;
    } finally {
      if (shouldRelease) client.release();
    }
  },

  /**
   * Atomically deduct credit balance from a driver's wallet.
   */
  async deductCredit(
    driverId: string,
    amount: number,
    type: string,
    description: string,
    externalClient?: any
  ): Promise<void> {
    const client = externalClient || (await getClient());
    const shouldRelease = !externalClient;
    const shouldTransact = !externalClient;

    try {
      if (shouldTransact) await client.query('BEGIN');

      // 1. Update the JSONB credit field atomically
      const updateSql = `
        UPDATE drivers 
        SET credit = jsonb_set(
          jsonb_set(
            COALESCE(credit, '{"limit": 0, "balance": 0, "totalRecharged": 0, "totalUsed": 0, "lastRechargeAt": null}'::jsonb), 
            '{balance}', 
            (COALESCE((credit->>'balance')::numeric, 0) - $1)::text::jsonb
          ),
          '{totalUsed}', 
          (COALESCE((credit->>'totalUsed')::numeric, 0) + $1)::text::jsonb
        ),
        updated_at = NOW() 
        WHERE id = $2 AND (credit->>'balance')::numeric >= $1
      `;
      const result = await client.query(updateSql, [amount, driverId]);

      if (result.rowCount === 0) {
        throw new Error('Insufficient credit balance');
      }

      // 2. Record the transaction in credit usage table
      const usageSql = `
        INSERT INTO driver_credit_usage (driver_id, amount, type, description, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `;
      await client.query(usageSql, [driverId, -amount, type, description]);

      if (shouldTransact) await client.query('COMMIT');
    } catch (error) {
      if (shouldTransact) await client.query('ROLLBACK');
      logger.error(`Error deducting credit from driver ${driverId}:`, error);
      throw error;
    } finally {
      if (shouldRelease) client.release();
    }
  },
};
