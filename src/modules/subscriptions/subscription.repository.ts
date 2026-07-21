import { query } from '../../shared/database';
import { SubscriptionPlan, DriverSubscription, PaymentRecord } from './subscription.model';

export const SubscriptionRepository = {
  async getPlanById(planId: number, client?: any): Promise<SubscriptionPlan | null> {
    const q = client ? client.query.bind(client) : query;
    const result = await q('SELECT * FROM recharge_plans WHERE id = $1 AND is_active = true', [
      planId,
    ]);
    if (!result.rows[0]) return null;
    const plan = result.rows[0];
    return {
      ...plan,
      name: plan.plan_name,
    };
  },

  async getAllPlans(client?: any): Promise<SubscriptionPlan[]> {
    const q = client ? client.query.bind(client) : query;
    const result = await q('SELECT * FROM recharge_plans WHERE is_active = true');
    return result.rows.map((plan: any) => ({
      ...plan,
      name: plan.plan_name,
    }));
  },

  async createPayment(paymentData: Partial<PaymentRecord>, client?: any): Promise<PaymentRecord> {
    const q = client ? client.query.bind(client) : query;
    const {
      driver_id,
      plan_id,
      billing_cycle,
      amount,
      currency,
      razorpay_order_id,
      status,
      applied_promo_id,
      discount_amount,
      reward_amount_used,
    } = paymentData;
    const result = await q(
      `INSERT INTO payments (driver_id, plan_id, billing_cycle, amount, currency, razorpay_order_id, status, applied_promo_id, discount_amount, reward_amount_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        driver_id,
        plan_id,
        billing_cycle,
        amount,
        currency,
        razorpay_order_id,
        status,
        applied_promo_id,
        discount_amount,
        reward_amount_used,
      ]
    );
    return result.rows[0];
  },

  async getPaymentByOrderId(orderId: string, client?: any): Promise<PaymentRecord | null> {
    const q = client ? client.query.bind(client) : query;
    const result = await q('SELECT * FROM payments WHERE razorpay_order_id = $1', [orderId]);
    return result.rows[0] || null;
  },

  async updatePaymentStatus(
    orderId: string,
    status: string,
    paymentId?: string,
    signature?: string,
    client?: any
  ): Promise<PaymentRecord> {
    const q = client ? client.query.bind(client) : query;
    const result = await q(
      `UPDATE payments 
       SET status = $2, razorpay_payment_id = $3, razorpay_signature = $4, updated_at = CURRENT_TIMESTAMP 
       WHERE razorpay_order_id = $1 RETURNING *`,
      [orderId, status, paymentId, signature]
    );
    return result.rows[0];
  },

  async getActiveSubscription(driverId: string, client?: any): Promise<DriverSubscription | null> {
    const q = client ? client.query.bind(client) : query;
    const result = await q(
      "SELECT * FROM driver_subscriptions WHERE driver_id = $1 AND status = 'active'",
      [driverId]
    );
    return result.rows[0] || null;
  },

  async expireActiveSubscription(driverId: string, client?: any): Promise<void> {
    const q = client ? client.query.bind(client) : query;
    await q(
      "UPDATE driver_subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE driver_id = $1 AND status = 'active'",
      [driverId]
    );
  },

  async createSubscription(
    subscriptionData: Partial<DriverSubscription>,
    client?: any
  ): Promise<DriverSubscription> {
    const q = client ? client.query.bind(client) : query;
    const { driver_id, plan_id, billing_cycle, start_date, expiry_date, status } = subscriptionData;
    const result = await q(
      `INSERT INTO driver_subscriptions (driver_id, plan_id, billing_cycle, start_date, expiry_date, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [driver_id, plan_id, billing_cycle, start_date, expiry_date, status]
    );
    return result.rows[0];
  },

  async expireReachedSubscriptions(client?: any): Promise<number> {
    const q = client ? client.query.bind(client) : query;

    // 1. Identify drivers whose subscriptions are expiring
    const toExpire = await q(
      "SELECT DISTINCT driver_id FROM driver_subscriptions WHERE expiry_date < NOW() AND status = 'active'"
    );

    if (toExpire.rowCount === 0) return 0;

    const driverIds = toExpire.rows.map((r: any) => r.driver_id);

    // 2. Expire the subscription records
    const result = await q(
      "UPDATE driver_subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE expiry_date < NOW() AND status = 'active'"
    );

    // 3. Update drivers table status for these drivers
    // Note: In real scenarios, a driver might have another pending sub, but standard flow is they become inactive.
    await q(
      'UPDATE drivers SET subscription_active = false, updated_at = NOW() WHERE id = ANY($1)',
      [driverIds]
    );

    return result.rowCount || 0;
  },

  async getAllActiveSubscriptions(): Promise<any[]> {
    const result = await query(
      `SELECT ds.*, rp.plan_name,
              d.full_name as driver_name, d.phone_number as driver_phone
       FROM driver_subscriptions ds
       JOIN recharge_plans rp ON ds.plan_id = rp.id
       JOIN drivers d ON ds.driver_id = d.id
       WHERE ds.status = 'active'
       ORDER BY ds.expiry_date ASC`
    );
    return result.rows || [];
  },

  async hasSuccessfulPayments(driverId: string): Promise<boolean> {
    const result = await query(
      "SELECT id FROM payments WHERE driver_id = $1 AND status = 'completed' LIMIT 1",
      [driverId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async getExpiringSubscriptions(hoursStart: number = 24, hoursEnd: number = 48): Promise<any[]> {
    const result = await query(
      `SELECT ds.driver_id, d.fcm_token, rp.plan_name, ds.expiry_date
       FROM driver_subscriptions ds
       JOIN drivers d ON ds.driver_id = d.id
       JOIN recharge_plans rp ON ds.plan_id = rp.id
       WHERE ds.status = 'active' 
         AND ds.expiry_date > (NOW() + interval '1 hour' * $1)
         AND ds.expiry_date <= (NOW() + interval '1 hour' * $2)
         AND d.fcm_token IS NOT NULL`,
       [hoursStart, hoursEnd]
    );
    return result.rows || [];
  },
};
