import { query } from '../../shared/database';
import { Promo, PromoUsage } from './promo.model';

export const PromoRepository = {
  async findByCode(code: string, client?: any): Promise<Promo | null> {
    const q = client ? client.query.bind(client) : query;
    const result = await q(
      `SELECT * FROM promos 
       WHERE UPPER(code) = UPPER($1) 
       AND is_active = true 
       AND (expiry_date IS NULL OR expiry_date > NOW())
       AND (start_date <= NOW())`,
      [code]
    );
    return result.rows[0] || null;
  },

  async findAvailableForDriver(driverId: string, client?: any): Promise<Promo[]> {
    const q = client ? client.query.bind(client) : query;
    const result = await q(
      `SELECT * FROM promos 
       WHERE is_active = true 
       AND (expiry_date IS NULL OR expiry_date > NOW())
       AND (start_date <= NOW())
       AND (
         target_type = 'global' OR 
         (target_type = 'specific_driver' AND target_driver_id = $1) OR
         (target_type = 'ride_count_based')
       )`,
      [driverId]
    );
    return result.rows || [];
  },

  async findReferralRewardsForDriver(driverId: string, client?: any): Promise<Promo[]> {
    const q = client ? client.query.bind(client) : query;
    const result = await q(
      `SELECT * FROM promos 
       WHERE promo_type = 'REFERRAL_REWARD'
       AND target_driver_id = $1
       ORDER BY created_at DESC`,
      [driverId]
    );
    return result.rows || [];
  },

  async findAll(client?: any): Promise<Promo[]> {
    const q = client ? client.query.bind(client) : query;
    const result = await q('SELECT * FROM promos ORDER BY created_at DESC');
    return result.rows || [];
  },

  async findById(id: number, client?: any): Promise<Promo | null> {
    const q = client ? client.query.bind(client) : query;
    const result = await q('SELECT * FROM promos WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(promoData: Partial<Promo>, client?: any): Promise<Promo> {
    const q = client ? client.query.bind(client) : query;
    const {
      code,
      description,
      discount_type,
      discount_value,
      target_type,
      target_driver_id,
      min_rides_required,
      max_uses,
      max_uses_per_driver,
      start_date,
      expiry_date,
      is_active,
      promo_type,
    } = promoData;
    const result = await q(
      `INSERT INTO promos (code, description, discount_type, discount_value, target_type, target_driver_id, min_rides_required, max_uses, max_uses_per_driver, start_date, expiry_date, is_active, promo_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()), $11, $12, $13) RETURNING *`,
      [
        code,
        description,
        discount_type,
        discount_value,
        target_type,
        target_driver_id,
        min_rides_required || 0,
        max_uses,
        max_uses_per_driver || 1,
        start_date,
        expiry_date,
        is_active ?? true,
        promo_type || 'OFFER',
      ]
    );
    return result.rows[0];
  },

  async update(id: number, promoData: Partial<Promo>, client?: any): Promise<Promo> {
    const q = client ? client.query.bind(client) : query;
    const columns = Object.keys(promoData).filter((key) => (promoData as any)[key] !== undefined);
    if (columns.length === 0) return this.findById(id, client) as any;

    const setClause = columns.map((col, i) => `"${col}" = $${i + 2}`).join(', ');
    const params = columns.map((col) => (promoData as any)[col]);

    const result = await q(
      `UPDATE promos SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    return result.rows[0];
  },

  async delete(id: number, client?: any): Promise<void> {
    const q = client ? client.query.bind(client) : query;
    await q('DELETE FROM promos WHERE id = $1', [id]);
  },

  async getUsageCount(promoId: number, driverId?: string, client?: any): Promise<number> {
    const q = client ? client.query.bind(client) : query;
    let sql = 'SELECT COUNT(*) FROM promo_usage WHERE promo_id = $1';
    const params: any[] = [promoId];

    if (driverId) {
      sql += ' AND driver_id = $2';
      params.push(driverId);
    }

    const result = await q(sql, params);
    return parseInt(result.rows[0].count);
  },

  async recordUsage(usageData: Partial<PromoUsage>, client?: any): Promise<PromoUsage> {
    const q = client ? client.query.bind(client) : query;
    const { promo_id, driver_id, payment_id, discount_applied } = usageData;
    const result = await q(
      `INSERT INTO promo_usage (promo_id, driver_id, payment_id, discount_applied)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [promo_id, driver_id, payment_id, discount_applied]
    );
    return result.rows[0];
  },
};
