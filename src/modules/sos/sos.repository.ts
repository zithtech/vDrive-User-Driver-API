import { query } from '../../shared/database';
import { SosEvent, SosLocation, TrustedContact } from './sos.model';

export class SosRepository {
  static async createSosEvent(
    user_id: string,
    user_type: 'driver' | 'customer',
    trip_id?: string
  ): Promise<SosEvent> {
    const result = await query(
      'INSERT INTO sos_events (user_id, user_type, trip_id, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [user_id, user_type, trip_id, 'ACTIVE']
    );
    return result.rows[0];
  }

  static async addSosLocation(sos_id: string, latitude: number, longitude: number): Promise<void> {
    await query('INSERT INTO sos_locations (sos_id, latitude, longitude) VALUES ($1, $2, $3)', [
      sos_id,
      latitude,
      longitude,
    ]);
  }

  static async resolveSosEvent(id: string): Promise<void> {
    await query(
      "UPDATE sos_events SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );
  }

  static async findById(id: string): Promise<SosEvent | null> {
    const result = await query('SELECT * FROM sos_events WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async findActiveSosByUser(
    user_id: string,
    user_type: 'driver' | 'customer'
  ): Promise<SosEvent | null> {
    const result = await query(
      "SELECT * FROM sos_events WHERE user_id = $1 AND user_type = $2 AND status = 'ACTIVE' LIMIT 1",
      [user_id, user_type]
    );
    return result.rows[0] || null;
  }

  static async findAllActiveSos(): Promise<SosEvent[]> {
    const result = await query(
      "SELECT * FROM sos_events WHERE status = 'ACTIVE' ORDER BY created_at DESC"
    );
    return result.rows;
  }

  static async getTrustedContacts(
    user_id: string,
    user_type: 'driver' | 'customer'
  ): Promise<TrustedContact[]> {
    const result = await query(
      'SELECT * FROM trusted_contacts WHERE user_id = $1 AND user_type = $2',
      [user_id, user_type]
    );
    return result.rows;
  }

  static async addTrustedContact(
    user_id: string,
    user_type: 'driver' | 'customer',
    name: string,
    phone: string,
    relationship?: string
  ): Promise<TrustedContact> {
    const existingContactsCount = await query(
      'SELECT COUNT(*) FROM trusted_contacts WHERE user_id = $1 AND user_type = $2',
      [user_id, user_type]
    );
    if (parseInt(existingContactsCount.rows[0].count) >= 5) {
      throw new Error('Maximum number of trusted contacts reached');
    }
    const result = await query(
      'INSERT INTO trusted_contacts (user_id, user_type, name, phone, relationship) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, user_type, name, phone, relationship || null]
    );
    return result.rows[0];
  }

  static async removeTrustedContact(id: string, user_id: string): Promise<void> {
    await query('DELETE FROM trusted_contacts WHERE id = $1 AND user_id = $2', [id, user_id]);
  }

  static async findAllSosHistory(
    filters?: { status?: string; user_type?: string; from_date?: string; to_date?: string },
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: any[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status && filters.status !== 'all') {
      whereClause += ` AND se.status = $${paramIndex++}`;
      params.push(filters.status.toUpperCase());
    }
    if (filters?.user_type && filters.user_type !== 'all') {
      whereClause += ` AND se.user_type = $${paramIndex++}`;
      params.push(filters.user_type.toLowerCase());
    }
    if (filters?.from_date) {
      whereClause += ` AND se.created_at >= $${paramIndex++}`;
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      whereClause += ` AND se.created_at <= $${paramIndex++}`;
      params.push(filters.to_date);
    }

    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) FROM sos_events se ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await query(
      `SELECT se.*,
        CASE 
          WHEN se.user_type = 'driver' THEN (SELECT full_name FROM drivers WHERE id = se.user_id)
          ELSE (SELECT full_name FROM users WHERE id = se.user_id)
        END AS user_name,
        CASE 
          WHEN se.user_type = 'driver' THEN (SELECT phone_number FROM drivers WHERE id = se.user_id)
          ELSE (SELECT phone_number FROM users WHERE id = se.user_id)
        END AS user_phone,
        CASE 
          WHEN se.user_type = 'driver' THEN (SELECT vdrive_id FROM drivers WHERE id = se.user_id)
          ELSE (SELECT user_code FROM users WHERE id = se.user_id)
        END AS user_code,
        CASE 
          WHEN se.user_type = 'driver' THEN (SELECT profile_pic_url FROM drivers WHERE id = se.user_id)
          ELSE (SELECT profile_url FROM users WHERE id = se.user_id)
        END AS profile_pic,
        t.trip_id AS trip_ref_id,
        (SELECT trip_code FROM trips WHERE trip_id = se.trip_id) AS trip_code,
        t.pickup_address,
        t.drop_address,
        t.trip_status
      FROM sos_events se
      LEFT JOIN trips t ON se.trip_id = t.trip_id
      ${whereClause}
      ORDER BY se.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return { data: dataResult.rows, total };
  }
}
