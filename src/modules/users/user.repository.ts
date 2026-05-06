// src/modules/users/user.repository.ts
import { query } from '../../shared/database';
import { User } from './user.model';

export const UserRepository = {
  async findAllWithFilters(
    page: number,
    limit: number,
    search?: string
  ): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;
    let whereClause = "WHERE status <> 'deleted'";
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex + 1})`;
      params.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const selectQuery = `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    const result = await query(selectQuery, params);

    return { users: result.rows, total };
  },

  async findById(id: string, status: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE id = $1 AND status = $2', [id, status]);
    return result.rows[0] || null;
  },

  async createUser(data: User): Promise<User | null> {

    try {

      const result = await query(
        `INSERT INTO users (first_name, last_name, full_name, phone_number, alternate_contact, role, gender, date_of_birth, status, email, device_id, onboarding_status, otp, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) RETURNING *;`,
        [
          data.first_name,
          data.last_name,
          data.full_name,
          data.phone_number,
          data.alternate_contact,
          data.role,
          data.gender,
          data.date_of_birth,
          data.status,
          data.email,
          data.device_id,
          data.onboarding_status,
          data.otp || '0000',
        ]
      );
      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }

  },

  async updateUser(id: string, setQuery: string, values: any[]): Promise<User | null> {
    const result = await query(
      `UPDATE users SET ${setQuery}, updated_at = NOW() WHERE id = $${values.length + 1} RETURNING *;`,
      [...values, id]
    );

    return result.rows[0] || null;
  },

  async deleteUser(id: string, status: string): Promise<User | null> {
    const result = await query(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *;`,
      [status, id]
    );

    return result.rows[0] || null;
  },

  async updateUserStatus(id: string, status: string, notes?: string): Promise<User | null> {
    const result = await query(
      `UPDATE users SET status = $1, notes = $2, updated_at = NOW() WHERE id = $3 RETURNING *;`,
      [status, notes, id]
    );

    return result.rows[0] || null;
  },

  async searchUsers(
    searchTerm: string,
    page: number,
    limit: number
  ): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;
    const searchQuery = `%${searchTerm}%`;
    const params = [searchQuery, searchQuery, limit, offset];

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users WHERE status <> 'deleted' AND (full_name ILIKE $1 OR email ILIKE $2 OR phone_number ILIKE $1)`;
    const countResult = await query(countQuery, [searchQuery, searchQuery]);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const selectQuery = `SELECT * FROM users WHERE status <> 'deleted' AND (full_name ILIKE $1 OR email ILIKE $2 OR phone_number ILIKE $1) ORDER BY created_at DESC LIMIT $3 OFFSET $4`;
    const result = await query(selectQuery, params);

    return { users: result.rows, total };
  },

  // Save or Update the FCM Token for a user
  async updateFcmToken(id: string, fcmToken: string): Promise<void> {
    await query('UPDATE users SET fcm_token = $1 WHERE id = $2', [fcmToken, id]);
  },

  // Retrieve the FCM Token to send a notification
  async getFcmTokenById(id: string): Promise<string | null> {
    const result = await query('SELECT fcm_token FROM users WHERE id = $1', [id]);
    return result.rows[0]?.fcm_token || null;
  },

  async incrementReferralCount(id: string) {
    const result = await query(
      `UPDATE users SET referral_count = referral_count + 1 WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  async incrementStats(id: string): Promise<void> {
    await query(
      `UPDATE users SET total_trips = COALESCE(total_trips, 0) + 1 WHERE id = $1`,
      [id]
    );
  }
};
