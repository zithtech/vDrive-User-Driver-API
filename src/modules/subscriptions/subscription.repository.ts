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

  // ─── Razorpay Plan ID Caching ───────────────────────────────────────

  async getRazorpayPlanId(planId: number, billingCycle: string, client?: any): Promise<string | null> {
    const q = client ? client.query.bind(client) : query;
    const column = `razorpay_plan_id_${billingCycle === 'day' ? 'daily' : billingCycle === 'week' ? 'weekly' : 'monthly'}`;
    const result = await q(`SELECT ${column} FROM recharge_plans WHERE id = $1`, [planId]);
    return result.rows[0]?.[column] || null;
  },

  async saveRazorpayPlanId(planId: number, billingCycle: string, razorpayPlanId: string, client?: any): Promise<void> {
    const q = client ? client.query.bind(client) : query;
    const column = `razorpay_plan_id_${billingCycle === 'day' ? 'daily' : billingCycle === 'week' ? 'weekly' : 'monthly'}`;
    await q(`UPDATE recharge_plans SET ${column} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [razorpayPlanId, planId]);
  },

  // ─── Payment Records ───────────────────────────────────────────────

  async createPayment(paymentData: Partial<PaymentRecord>, client?: any): Promise<PaymentRecord> {
    const q = client ? client.query.bind(client) : query;
    const {
      driver_id,
      plan_id,
      billing_cycle,
      amount,
      currency,
      razorpay_order_id,
      razorpay_subscription_id,
      status,
      applied_promo_id,
      discount_amount,
      reward_amount_used,
      prorated_credit,
      is_upgrade,
      is_downgrade,
      payment_type,
    } = paymentData;
    const result = await q(
      `INSERT INTO payments (driver_id, plan_id, billing_cycle, amount, currency, razorpay_order_id, 
       razorpay_subscription_id, status, applied_promo_id, discount_amount, reward_amount_used,
       prorated_credit, is_upgrade, is_downgrade, payment_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        driver_id,
        plan_id,
        billing_cycle,
        amount,
        currency,
        razorpay_order_id || null,
        razorpay_subscription_id || null,
        status,
        applied_promo_id || null,
        discount_amount || 0,
        reward_amount_used || 0,
        prorated_credit || 0,
        is_upgrade || false,
        is_downgrade || false,
        payment_type || 'one_time',
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

  // ─── Driver Subscriptions ──────────────────────────────────────────

  async getActiveSubscription(driverId: string, client?: any): Promise<any | null> {
    const q = client ? client.query.bind(client) : query;
    const result = await q(
      `SELECT 
         ds.*,
         dp.razorpay_payment_id,
         dp.razorpay_order_id,
         dp.payment_type as payment_method
       FROM driver_subscriptions ds
       LEFT JOIN LATERAL (
         SELECT razorpay_payment_id, razorpay_order_id, payment_type
         FROM payments
         WHERE driver_id = ds.driver_id
           AND (
             (ds.razorpay_subscription_id IS NOT NULL AND razorpay_subscription_id = ds.razorpay_subscription_id)
             OR (plan_id = ds.plan_id AND billing_cycle = ds.billing_cycle)
           )
           AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1
       ) dp ON true
       WHERE ds.driver_id = $1 AND ds.status = 'active'`,
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

  async cancelActiveSubscription(driverId: string, client?: any): Promise<void> {
    const q = client ? client.query.bind(client) : query;
    await q(
      "UPDATE driver_subscriptions SET status = 'cancelled', auto_renew = false, updated_at = CURRENT_TIMESTAMP WHERE driver_id = $1 AND status = 'active'",
      [driverId]
    );
  },

  async createSubscription(
    subscriptionData: Partial<DriverSubscription>,
    client?: any
  ): Promise<DriverSubscription> {
    const q = client ? client.query.bind(client) : query;
    const {
      driver_id, plan_id, billing_cycle, start_date, expiry_date, status,
      auto_renew, razorpay_subscription_id, previous_plan_id, prorated_credit,
    } = subscriptionData;
    const result = await q(
      `INSERT INTO driver_subscriptions 
       (driver_id, plan_id, billing_cycle, start_date, expiry_date, status, auto_renew, razorpay_subscription_id, previous_plan_id, prorated_credit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        driver_id, plan_id, billing_cycle, start_date, expiry_date, status,
        auto_renew || false,
        razorpay_subscription_id || null,
        previous_plan_id || null,
        prorated_credit || 0,
      ]
    );
    return result.rows[0];
  },

  async updateSubscriptionAutoRenew(driverId: string, autoRenew: boolean, client?: any): Promise<void> {
    const q = client ? client.query.bind(client) : query;
    await q(
      "UPDATE driver_subscriptions SET auto_renew = $2, updated_at = CURRENT_TIMESTAMP WHERE driver_id = $1 AND status = 'active'",
      [driverId, autoRenew]
    );
  },

  async getSubscriptionByRazorpayId(razorpaySubId: string, client?: any): Promise<DriverSubscription | null> {
    const q = client ? client.query.bind(client) : query;
    const result = await q(
      "SELECT * FROM driver_subscriptions WHERE razorpay_subscription_id = $1 AND status = 'active'",
      [razorpaySubId]
    );
    return result.rows[0] || null;
  },

  // ─── Subscription Events (Webhook Idempotency) ─────────────────────

  async isEventProcessed(eventId: string, client?: any): Promise<boolean> {
    const q = client ? client.query.bind(client) : query;
    const result = await q('SELECT id FROM subscription_events WHERE razorpay_event_id = $1', [eventId]);
    return (result.rowCount ?? 0) > 0;
  },

  async recordEvent(eventData: {
    razorpay_event_id: string;
    event_type: string;
    razorpay_subscription_id?: string;
    razorpay_payment_id?: string;
    payload?: any;
  }, client?: any): Promise<void> {
    const q = client ? client.query.bind(client) : query;
    await q(
      `INSERT INTO subscription_events (razorpay_event_id, event_type, razorpay_subscription_id, razorpay_payment_id, payload)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (razorpay_event_id) DO NOTHING`,
      [
        eventData.razorpay_event_id,
        eventData.event_type,
        eventData.razorpay_subscription_id || null,
        eventData.razorpay_payment_id || null,
        eventData.payload ? JSON.stringify(eventData.payload) : null,
      ]
    );
  },

  // ─── Expiration & Cleanup ──────────────────────────────────────────

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

  // ─── Subscription History ──────────────────────────────────────────

  async getSubscriptionHistory(driverId: string): Promise<{ subscriptions: any[]; totalSpent: number; totalCount: number }> {
    // Fetch all subscriptions (active, expired, cancelled) with plan details
    const subsResult = await query(
      `SELECT ds.*, rp.plan_name, rp.daily_price, rp.weekly_price, rp.monthly_price, rp.features,
              p.razorpay_payment_id, p.razorpay_order_id
       FROM driver_subscriptions ds
       JOIN recharge_plans rp ON ds.plan_id = rp.id
       LEFT JOIN LATERAL (
         SELECT razorpay_payment_id, razorpay_order_id
         FROM payments
         WHERE driver_id = ds.driver_id AND plan_id = ds.plan_id AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1
       ) p ON true
       WHERE ds.driver_id = $1
       ORDER BY ds.created_at DESC`,
      [driverId]
    );

    // Calculate total spent from completed payments
    const spentResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_spent, COUNT(*) as total_count
       FROM payments
       WHERE driver_id = $1 AND status = 'completed'`,
      [driverId]
    );

    const totalSpent = Number(spentResult.rows[0]?.total_spent || 0);
    const totalCount = subsResult.rows?.length || 0;

    return {
      subscriptions: subsResult.rows || [],
      totalSpent,
      totalCount,
    };
  },
};

