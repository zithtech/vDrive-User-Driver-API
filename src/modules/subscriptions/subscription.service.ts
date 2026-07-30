import Razorpay from 'razorpay';
import crypto from 'crypto';
import { SubscriptionRepository } from './subscription.repository';
import { DriverRepository } from '../drivers/driver.repository';
import { PromoService } from '../promos/promo.service';
import {
  CreateOrderRequest,
  VerifyPaymentRequest,
  VerifySubscriptionPaymentRequest,
  PlanChangePreview,
} from './subscription.model';
import { query, getClient } from '../../shared/database';
import axios from 'axios';
import config from '../../config';
import { logger } from '../../shared/logger';
import { DriverNotifications } from '../notifications/driver.notification';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID as string,
  key_secret: process.env.RAZORPAY_KEY_SECRET as string,
});

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Maps billing cycle string to Razorpay's period format and interval.
 */
function getRazorpayPeriod(billingCycle: string): { period: string; interval: number } {
  switch (billingCycle) {
    case 'day':
      return { period: 'daily', interval: 1 };
    case 'week':
      return { period: 'weekly', interval: 1 };
    case 'month':
      return { period: 'monthly', interval: 1 };
    default:
      throw new Error('Invalid billing cycle');
  }
}

/**
 * Returns the price from the plan based on the billing cycle.
 */
function getPlanPrice(plan: any, billingCycle: string): number {
  if (billingCycle === 'day') return Number(plan.daily_price);
  if (billingCycle === 'week') return Number(plan.weekly_price);
  if (billingCycle === 'month') return Number(plan.monthly_price);
  throw new Error('Invalid billing cycle');
}

/**
 * Returns the total days in a billing cycle for proration math.
 */
function getBillingCycleDays(billingCycle: string): number {
  switch (billingCycle) {
    case 'day':
      return 1;
    case 'week':
      return 7;
    case 'month':
      return 30; // Standardized to 30 days for monthly proration
    default:
      return 30;
  }
}

/**
 * Calculates the number of days between two dates.
 */
function daysBetween(startDate: Date, endDate: Date): number {
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Get or create a Razorpay Plan for a local plan + billing cycle combo.
 * Razorpay requires plans to be created first before subscriptions can reference them.
 */
async function getOrCreateRazorpayPlan(plan: any, billingCycle: string): Promise<string> {
  // Check if we already have a cached Razorpay Plan ID
  const existingPlanId = await SubscriptionRepository.getRazorpayPlanId(plan.id, billingCycle);
  if (existingPlanId) return existingPlanId;

  // Create a new plan on Razorpay
  const price = getPlanPrice(plan, billingCycle);
  const { period, interval } = getRazorpayPeriod(billingCycle);

  const razorpayPlan = await (razorpay as any).plans.create({
    period,
    interval,
    item: {
      name: `${plan.plan_name} (${billingCycle})`,
      amount: Math.round(price * 100), // Razorpay expects paise
      currency: 'INR',
      description: plan.description || `${plan.plan_name} - ${billingCycle} subscription`,
    },
  });

  // Cache the Razorpay Plan ID for future use
  await SubscriptionRepository.saveRazorpayPlanId(plan.id, billingCycle, razorpayPlan.id);
  logger.info(`Created Razorpay Plan ${razorpayPlan.id} for ${plan.plan_name} (${billingCycle})`);

  return razorpayPlan.id;
}

// ─── Service ─────────────────────────────────────────────────────────

export const SubscriptionService = {

  // ═══════════════════════════════════════════════════════════════════
  // EXISTING: One-Time Payment Flow (kept for backward compatibility)
  // ═══════════════════════════════════════════════════════════════════

  async createOrder(driverId: string, input: CreateOrderRequest) {
    const plan = await SubscriptionRepository.getPlanById(input.plan_id);
    if (!plan) {
      throw new Error('Invalid plan ID or plan is not active');
    }

    // Prevent downgrades via one-time purchase if they have an active plan
    const existingSub = await SubscriptionRepository.getActiveSubscription(driverId);
    if (existingSub) {
      const oldPlan = await SubscriptionRepository.getPlanById(existingSub.plan_id);
      if (oldPlan) {
        const durationValues: Record<string, number> = { day: 1, week: 7, month: 30 };
        const oldDuration = durationValues[existingSub.billing_cycle] || 0;
        const newDuration = durationValues[input.billing_cycle] || 0;

        const isTierDowngrade = plan.id < oldPlan.id;
        const isDurationDowngrade = newDuration < oldDuration;
        const isDowngrade = isTierDowngrade || (plan.id === oldPlan.id && isDurationDowngrade);

        if (isDowngrade) {
          throw new Error('Downgrading an active plan is not allowed. Please cancel auto-renewal and wait for your current plan to expire.');
        }
      }
    }

    let amount = getPlanPrice(plan, input.billing_cycle);

    // Dynamic Discount Logic
    let discountAmount = 0;
    let rewardAmountUsed = 0;
    let appliedPromoId: number | undefined;

    const driver = await DriverRepository.findById(driverId);

    // 1. Promo Code Check (Universal & Targeted)
    if (input.promo_code) {
      const validation = await PromoService.validatePromo(input.promo_code, driverId, amount);
      if (!validation.isValid) {
        throw new Error(validation.message || 'Invalid promo code');
      }
      discountAmount = validation.discountAmount;
      appliedPromoId = validation.promo?.id;
    }

    // 2. Referral/Reward Balance Check (Manual usage)
    if (input.use_reward_balance && driver?.credit?.balance) {
      const availableBalance = Number(driver.credit.balance || 0);
      const remainingAfterPromo = Math.max(0, amount - discountAmount);

      // Use balance up to the remaining amount
      rewardAmountUsed = Math.min(availableBalance, remainingAfterPromo);
      discountAmount += rewardAmountUsed;
    }

    // 3. First Recharge Check (Fallback / Combo)
    if (Number(plan.first_recharge_discount || 0) > 0) {
      const hasPurchasedBefore = await SubscriptionRepository.hasSuccessfulPayments(driverId);
      if (!hasPurchasedBefore) {
        const firstDiscount = (amount * Number(plan.first_recharge_discount)) / 100;
        discountAmount = Math.max(discountAmount, firstDiscount);
      }
    }

    amount = Math.max(0, amount - discountAmount);

    let order: any = {
      id: `free_${driverId.substring(0, 8)}_${Date.now()}`,
      amount: 0,
      currency: 'INR',
    };

    if (amount > 0) {
      const options = {
        amount: Math.round(amount * 100), // Razorpay expects amount in paise
        currency: 'INR',
        receipt: `sub_${driverId.substring(0, 8)}_${Date.now()}`,
      };
      order = await razorpay.orders.create(options);
    }

    await SubscriptionRepository.createPayment({
      driver_id: driverId,
      plan_id: plan.id,
      billing_cycle: input.billing_cycle,
      amount: amount,
      currency: 'INR',
      razorpay_order_id: order.id,
      status: 'pending',
      applied_promo_id: appliedPromoId,
      discount_amount: discountAmount,
      reward_amount_used: rewardAmountUsed,
      payment_type: 'one_time',
    });

    return {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      is_free: amount === 0,
    };
  },

  async verifyPayment(driverId: string, input: VerifyPaymentRequest) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = input;

    const isFreeOrder = razorpay_order_id.startsWith('free_');

    // 1. Verify Signature (Skip if it's a free order covered by rewards)
    if (!isFreeOrder) {
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET as string)
        .update(body.toString())
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        logger.error(`Invalid signature for order ${razorpay_order_id} and driver ${driverId}`);
        throw new Error('Invalid payment signature');
      }
    }

    // 2. Fetch payment record
    const payment = await SubscriptionRepository.getPaymentByOrderId(razorpay_order_id);
    if (!payment || payment.status !== 'pending') {
      throw new Error('Payment record not found or already processed');
    }

    // 3. Database Transaction for secure activation
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Update payment status
      await SubscriptionRepository.updatePaymentStatus(
        razorpay_order_id,
        'completed',
        razorpay_payment_id,
        razorpay_signature,
        client
      );

      // Record promo usage if applicable
      if (payment.applied_promo_id) {
        await PromoService.usePromo(
          Number(payment.applied_promo_id),
          driverId,
          payment.id,
          Number(payment.discount_amount || 0),
          client
        );
      }

      // 4. Deduct Wallet Balance (ATOM-SYNC)
      if (Number(payment.reward_amount_used || 0) > 0) {
        await DriverRepository.deductCredit(
          driverId,
          Number(payment.reward_amount_used),
          'SUBSCRIPTION_PAYMENT',
          `Applied towards ${payment.billing_cycle} plan recharge`,
          client
        );
        
        // Notify driver of wallet deduction
        const driverRes = await client.query('SELECT fcm_token, credit_balance FROM drivers WHERE id = $1', [driverId]);
        if (driverRes.rows[0]?.fcm_token) {
           await DriverNotifications.walletDebited(
               driverRes.rows[0].fcm_token,
               (payment.reward_amount_used || 0).toString(),
               driverRes.rows[0].credit_balance.toString()
           ).catch(err => logger.error(`Push error: ${err.message}`));
        }
      }

      // Check if driver already had an active subscription to mark this as a renewal
      const oldSub = await SubscriptionRepository.getActiveSubscription(driverId, client);
      const isRenewal = !!oldSub;

      // Expire old active subscription
      await SubscriptionRepository.expireActiveSubscription(driverId, client);

      // Calculate expiry date
      const startDate = new Date();
      const expiryDate = new Date();
      if (payment.billing_cycle === 'day') expiryDate.setDate(expiryDate.getDate() + 1);
      else if (payment.billing_cycle === 'week') expiryDate.setDate(expiryDate.getDate() + 7);
      else if (payment.billing_cycle === 'month') expiryDate.setMonth(expiryDate.getMonth() + 1);

      // Create new subscription
      await SubscriptionRepository.createSubscription(
        {
          driver_id: driverId,
          plan_id: payment.plan_id,
          billing_cycle: payment.billing_cycle as any,
          start_date: startDate,
          expiry_date: expiryDate,
          status: 'active',
          auto_renew: false,
        },
        client
      );

      // Update driver subscription status
      await client.query(
        `UPDATE drivers 
         SET subscription_active = true, 
             onboarding_status = 'SUBSCRIPTION_ACTIVE',
             updated_at = NOW() 
         WHERE id = $1`,
        [driverId]
      );

      await client.query('COMMIT');

      // Trigger webhook asynchronously for Admin App real-time notifications
      try {
        const driverRes = await client.query('SELECT full_name, fcm_token FROM drivers WHERE id = $1', [
          driverId,
        ]);
        const planRes = await client.query('SELECT plan_name FROM recharge_plans WHERE id = $1', [
          payment.plan_id,
        ]);

        const driverName = driverRes.rows[0]?.full_name || 'A driver';
        const planName = planRes.rows[0]?.plan_name || 'a subscription plan';

        const actionText = isRenewal ? 'renewed' : 'activated';

        // Notify Driver via Push
        const fcmToken = driverRes.rows[0]?.fcm_token;
        if (fcmToken) {
           DriverNotifications.subscriptionActivated(fcmToken, planName, isRenewal)
             .catch(err => logger.error(`Failed to send subscription push: ${err.message}`));
        }

        const webhookUrl = `${config.adminBackendUrl}/api/webhooks/driver-events`;
        axios
          .post(
            webhookUrl,
            {
              eventType: isRenewal ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_ACTIVATED',
              message: `Driver ${driverName} ${actionText} ${planName}`,
              data: { driverId, planId: payment.plan_id, driverName, planName, isRenewal },
            },
            {
              headers: { 'x-api-key': config.internalServiceApiKey },
            }
          )
          .catch((err) => logger.error(`Webhook trigger failed: ${err.message}`));
      } catch (e) {
        // Ignore
      }
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Transaction failed, rolled back: ${error}`);
      throw error;
    } finally {
      client.release();
    }

    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════════════
  // NEW: Auto-Subscription (Razorpay Subscriptions API) Flow
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Creates a Razorpay Subscription for auto-renewal.
   * If the driver already has an active subscription (upgrade/downgrade),
   * it cancels the old one, calculates prorated credit, and applies it
   * as a one-time discount on the first billing cycle of the new subscription.
   */
  async createAutoSubscription(driverId: string, input: CreateOrderRequest) {
    const plan = await SubscriptionRepository.getPlanById(input.plan_id);
    if (!plan) {
      throw new Error('Invalid plan ID or plan is not active');
    }

    const newPlanPrice = getPlanPrice(plan, input.billing_cycle);

    // Get or create a Razorpay Plan for this plan + billing cycle
    const razorpayPlanId = await getOrCreateRazorpayPlan(plan, input.billing_cycle);

    // Check if driver has an existing active subscription (upgrade/downgrade scenario)
    const existingSub = await SubscriptionRepository.getActiveSubscription(driverId);
    let proratedCredit = 0;
    let isUpgrade = false;
    let isDowngrade = false;
    let oldPlanId: number | undefined;

    if (existingSub && existingSub.plan_id !== input.plan_id) {
      // ─── Proration Calculation ──────────────────────────────────────
      const oldPlan = await SubscriptionRepository.getPlanById(existingSub.plan_id);
      if (oldPlan) {
        const oldPlanPrice = getPlanPrice(oldPlan, existingSub.billing_cycle);
        const totalDays = daysBetween(new Date(existingSub.start_date), new Date(existingSub.expiry_date));
        const unusedDays = daysBetween(new Date(), new Date(existingSub.expiry_date));

        if (totalDays > 0 && unusedDays > 0) {
          proratedCredit = Math.round(((oldPlanPrice / totalDays) * unusedDays) * 100) / 100;
        }

        const durationValues: Record<string, number> = { day: 1, week: 7, month: 30 };
        const oldDuration = durationValues[existingSub.billing_cycle] || 0;
        const newDuration = durationValues[input.billing_cycle] || 0;

        const isTierDowngrade = plan.id < oldPlan.id;
        const isDurationDowngrade = newDuration < oldDuration;

        isDowngrade = isTierDowngrade || (plan.id === oldPlan.id && isDurationDowngrade);
        isUpgrade = !isDowngrade; // If it's not a downgrade (and we checked it's a different plan/duration earlier), it's an upgrade.
        
        if (isDowngrade) {
          throw new Error('Downgrading an active plan is not allowed. Please cancel auto-renewal and wait for your current plan to expire.');
        }

        oldPlanId = existingSub.plan_id;

        logger.info(
          `Plan change for driver ${driverId}: ${oldPlan.plan_name} → ${plan.plan_name}, ` +
          `unused ${unusedDays}/${totalDays} days, credit ₹${proratedCredit}`
        );
      }

      // Cancel the old Razorpay Subscription if it exists
      if (existingSub.razorpay_subscription_id) {
        try {
          await (razorpay.subscriptions as any).cancel(existingSub.razorpay_subscription_id);
          logger.info(`Cancelled old Razorpay subscription ${existingSub.razorpay_subscription_id}`);
        } catch (err: any) {
          logger.warn(`Failed to cancel old Razorpay subscription: ${err.message}`);
          // Continue anyway — the subscription may already be inactive on Razorpay
        }
      }
    }

    // ─── Create Razorpay Subscription ─────────────────────────────────
    const subscriptionOptions: any = {
      plan_id: razorpayPlanId,
      total_count: 120, // Max billing cycles (10 years for monthly)
      quantity: 1,
      customer_notify: 1,
      notes: {
        driver_id: driverId,
        plan_name: plan.plan_name,
        billing_cycle: input.billing_cycle,
      },
    };

    // If there's prorated credit, apply it as a one-time offer/addon
    // Razorpay supports addons with negative amounts (credits) on the first invoice
    if (proratedCredit > 0) {
      // Cap the credit to the new plan price (driver shouldn't get negative amount)
      const effectiveCredit = Math.min(proratedCredit, newPlanPrice);
      // Apply as a one-time addon with negative amount (credit)
      subscriptionOptions.addons = [
        {
          item: {
            name: `Prorated credit from previous plan`,
            amount: Math.round(effectiveCredit * 100), // paise
            currency: 'INR',
          },
          quantity: 1,
        },
      ];
      // Use "start_at" to not charge upfront, we will handle manually via addon
      // Actually, for immediate proration, we want the first charge NOW
      // The addon will appear as a separate line item on the first invoice
    }

    const razorpaySub = await (razorpay.subscriptions as any).create(subscriptionOptions);

    // Store a pending payment record
    const firstChargeAmount = Math.max(0, newPlanPrice - Math.min(proratedCredit, newPlanPrice));
    await SubscriptionRepository.createPayment({
      driver_id: driverId,
      plan_id: plan.id,
      billing_cycle: input.billing_cycle,
      amount: firstChargeAmount,
      currency: 'INR',
      razorpay_order_id: `sub_order_${razorpaySub.id}`,
      razorpay_subscription_id: razorpaySub.id,
      status: 'pending',
      prorated_credit: proratedCredit,
      is_upgrade: isUpgrade,
      is_downgrade: isDowngrade,
      payment_type: isUpgrade ? 'upgrade' : isDowngrade ? 'downgrade' : 'subscription_creation',
    });

    return {
      subscription_id: razorpaySub.id,
      razorpay_key: process.env.RAZORPAY_KEY_ID,
      amount: Math.round(firstChargeAmount * 100), // paise for frontend display
      currency: 'INR',
      plan_name: plan.plan_name,
      billing_cycle: input.billing_cycle,
      is_upgrade: isUpgrade,
      is_downgrade: isDowngrade,
      prorated_credit: proratedCredit,
      amount_to_pay: firstChargeAmount,
      new_plan_price: newPlanPrice,
    };
  },

  /**
   * Verify the first payment of a Razorpay Subscription checkout.
   * This is called after the driver completes the checkout on the frontend.
   */
  async verifySubscriptionPayment(driverId: string, input: VerifySubscriptionPaymentRequest) {
    const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = input;

    // 1. Verify Signature
    const body = razorpay_payment_id + '|' + razorpay_subscription_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET as string)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      logger.error(`Invalid subscription signature for ${razorpay_subscription_id} / driver ${driverId}`);
      throw new Error('Invalid payment signature');
    }

    // 2. Find the pending payment record
    const paymentResult = await query(
      "SELECT * FROM payments WHERE razorpay_subscription_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [razorpay_subscription_id]
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      throw new Error('Payment record not found or already processed');
    }

    // 3. Database Transaction
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Update payment status
      await client.query(
        `UPDATE payments SET status = 'completed', razorpay_payment_id = $1, razorpay_signature = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [razorpay_payment_id, razorpay_signature, payment.id]
      );

      // Cancel/expire old subscription
      await SubscriptionRepository.cancelActiveSubscription(driverId, client);

      // Calculate expiry date (new billing cycle starts NOW)
      const startDate = new Date();
      const expiryDate = new Date();
      if (payment.billing_cycle === 'day') expiryDate.setDate(expiryDate.getDate() + 1);
      else if (payment.billing_cycle === 'week') expiryDate.setDate(expiryDate.getDate() + 7);
      else if (payment.billing_cycle === 'month') expiryDate.setMonth(expiryDate.getMonth() + 1);

      // Create new subscription
      await SubscriptionRepository.createSubscription(
        {
          driver_id: driverId,
          plan_id: payment.plan_id,
          billing_cycle: payment.billing_cycle as any,
          start_date: startDate,
          expiry_date: expiryDate,
          status: 'active',
          auto_renew: true,
          razorpay_subscription_id: razorpay_subscription_id,
          previous_plan_id: payment.is_upgrade || payment.is_downgrade ? undefined : undefined,
          prorated_credit: Number(payment.prorated_credit || 0),
        },
        client
      );

      // Update driver subscription status
      await client.query(
        `UPDATE drivers 
         SET subscription_active = true, 
             onboarding_status = 'SUBSCRIPTION_ACTIVE',
             updated_at = NOW() 
         WHERE id = $1`,
        [driverId]
      );

      await client.query('COMMIT');

      // Send notifications
      try {
        const driverRes = await query('SELECT full_name, fcm_token FROM drivers WHERE id = $1', [driverId]);
        const planRes = await query('SELECT plan_name FROM recharge_plans WHERE id = $1', [payment.plan_id]);

        const driverName = driverRes.rows[0]?.full_name || 'A driver';
        const planName = planRes.rows[0]?.plan_name || 'a subscription plan';
        const fcmToken = driverRes.rows[0]?.fcm_token;

        const isUpgrade = payment.is_upgrade;
        const isDowngrade = payment.is_downgrade;

        if (fcmToken) {
          if (isUpgrade) {
            DriverNotifications.subscriptionUpgraded(fcmToken, planName)
              .catch(err => logger.error(`Push error: ${err.message}`));
          } else if (isDowngrade) {
            DriverNotifications.subscriptionDowngraded(fcmToken, planName)
              .catch(err => logger.error(`Push error: ${err.message}`));
          } else {
            DriverNotifications.subscriptionActivated(fcmToken, planName, false)
              .catch(err => logger.error(`Push error: ${err.message}`));
          }
        }

        // Admin webhook
        const eventType = isUpgrade ? 'SUBSCRIPTION_UPGRADED' : isDowngrade ? 'SUBSCRIPTION_DOWNGRADED' : 'SUBSCRIPTION_ACTIVATED';
        const webhookUrl = `${config.adminBackendUrl}/api/webhooks/driver-events`;
        axios
          .post(webhookUrl, {
            eventType,
            message: `Driver ${driverName} ${isUpgrade ? 'upgraded to' : isDowngrade ? 'downgraded to' : 'activated'} ${planName} (Auto-Subscription)`,
            data: { driverId, planId: payment.plan_id, driverName, planName, isUpgrade, isDowngrade, autoRenew: true },
          }, { headers: { 'x-api-key': config.internalServiceApiKey } })
          .catch(err => logger.error(`Webhook trigger failed: ${err.message}`));
      } catch (e) {
        // Ignore notification errors
      }
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Subscription verification transaction failed: ${error}`);
      throw error;
    } finally {
      client.release();
    }

    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════════════
  // NEW: Preview Plan Change (Show proration math to driver before upgrade)
  // ═══════════════════════════════════════════════════════════════════

  async previewPlanChange(driverId: string, newPlanId: number, newBillingCycle: string): Promise<PlanChangePreview | null> {
    const existingSub = await SubscriptionRepository.getActiveSubscription(driverId);
    if (!existingSub) {
      throw new Error('No active subscription found. Please subscribe first.');
    }

    const oldPlan = await SubscriptionRepository.getPlanById(existingSub.plan_id);
    const newPlan = await SubscriptionRepository.getPlanById(newPlanId);

    if (!oldPlan || !newPlan) {
      throw new Error('Invalid plan ID');
    }

    const oldPlanPrice = getPlanPrice(oldPlan, existingSub.billing_cycle);
    const newPlanPrice = getPlanPrice(newPlan, newBillingCycle);

    const totalDays = daysBetween(new Date(existingSub.start_date), new Date(existingSub.expiry_date));
    const unusedDays = daysBetween(new Date(), new Date(existingSub.expiry_date));

    let unusedCredit = 0;
    if (totalDays > 0 && unusedDays > 0) {
      unusedCredit = Math.round(((oldPlanPrice / totalDays) * unusedDays) * 100) / 100;
    }

    const durationValues: Record<string, number> = { day: 1, week: 7, month: 30 };
    const oldDuration = durationValues[existingSub.billing_cycle] || 0;
    const newDuration = durationValues[newBillingCycle] || 0;

    const isTierDowngrade = newPlan.id < oldPlan.id;
    const isDurationDowngrade = newDuration < oldDuration;

    const isDowngrade = isTierDowngrade || (newPlan.id === oldPlan.id && isDurationDowngrade);
    const isUpgrade = !isDowngrade;

    if (isDowngrade) {
      throw new Error('Downgrading an active plan is not allowed. Please cancel auto-renewal and wait for your current plan to expire.');
    }

    const amountToPay = Math.max(0, Math.round((newPlanPrice - unusedCredit) * 100) / 100);

    return {
      current_plan: {
        name: oldPlan.plan_name,
        price: oldPlanPrice,
        billing_cycle: existingSub.billing_cycle,
        start_date: existingSub.start_date,
        expiry_date: existingSub.expiry_date,
      },
      new_plan: {
        name: newPlan.plan_name,
        price: newPlanPrice,
        billing_cycle: newBillingCycle,
      },
      proration: {
        total_days: totalDays,
        unused_days: unusedDays,
        unused_credit: unusedCredit,
        new_plan_cost: newPlanPrice,
        amount_to_pay: amountToPay,
      },
      is_upgrade: newPlanPrice > oldPlanPrice,
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // NEW: Toggle Auto-Renew
  // ═══════════════════════════════════════════════════════════════════

  async toggleAutoRenew(driverId: string, autoRenew: boolean) {
    const existingSub = await SubscriptionRepository.getActiveSubscription(driverId);
    if (!existingSub) {
      throw new Error('No active subscription found');
    }

    if (!autoRenew && existingSub.razorpay_subscription_id) {
      // Driver is turning OFF auto-renew → cancel the Razorpay subscription
      // The current cycle stays active until expiry_date
      try {
        await (razorpay.subscriptions as any).cancel(existingSub.razorpay_subscription_id, true);
        logger.info(`Cancelled Razorpay subscription ${existingSub.razorpay_subscription_id} at cycle end for driver ${driverId}`);
      } catch (err: any) {
        logger.warn(`Failed to cancel Razorpay subscription: ${err.message}`);
      }
    }

    await SubscriptionRepository.updateSubscriptionAutoRenew(driverId, autoRenew);

    return { success: true, auto_renew: autoRenew };
  },

  // ═══════════════════════════════════════════════════════════════════
  // NEW: Razorpay Webhook Handler
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Handles Razorpay webhook events for subscription lifecycle.
   * Key events:
   *   - subscription.charged → Auto-renew: extend subscription expiry
   *   - subscription.cancelled → Mark subscription as cancelled
   *   - subscription.halted → Payment failed multiple times
   */
  async handleWebhook(eventId: string, eventType: string, payload: any) {
    // Idempotency check — skip if we've already processed this event
    const alreadyProcessed = await SubscriptionRepository.isEventProcessed(eventId);
    if (alreadyProcessed) {
      logger.info(`Webhook event ${eventId} already processed, skipping.`);
      return { success: true, skipped: true };
    }

    const subscriptionEntity = payload?.subscription?.entity;
    const paymentEntity = payload?.payment?.entity;
    const razorpaySubId = subscriptionEntity?.id;

    if (!razorpaySubId) {
      logger.warn(`Webhook ${eventType}: No subscription ID in payload`);
      return { success: false, reason: 'No subscription ID' };
    }

    switch (eventType) {
      case 'subscription.charged': {
        // Auto-renewal payment succeeded → Extend subscription
        const driverSub = await SubscriptionRepository.getSubscriptionByRazorpayId(razorpaySubId);
        if (!driverSub) {
          logger.warn(`Webhook: No active subscription found for Razorpay sub ${razorpaySubId}`);
          break;
        }

        const client = await getClient();
        try {
          await client.query('BEGIN');

          // Extend expiry date from the current expiry (not from now)
          const currentExpiry = new Date(driverSub.expiry_date);
          const newExpiry = new Date(currentExpiry);
          if (driverSub.billing_cycle === 'day') newExpiry.setDate(newExpiry.getDate() + 1);
          else if (driverSub.billing_cycle === 'week') newExpiry.setDate(newExpiry.getDate() + 7);
          else if (driverSub.billing_cycle === 'month') newExpiry.setMonth(newExpiry.getMonth() + 1);

          await client.query(
            `UPDATE driver_subscriptions 
             SET expiry_date = $1, start_date = $2, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $3`,
            [newExpiry, currentExpiry, driverSub.id]
          );

          // Record the renewal payment
          await SubscriptionRepository.createPayment({
            driver_id: driverSub.driver_id,
            plan_id: driverSub.plan_id,
            billing_cycle: driverSub.billing_cycle,
            amount: paymentEntity?.amount ? paymentEntity.amount / 100 : 0,
            currency: paymentEntity?.currency || 'INR',
            razorpay_order_id: paymentEntity?.order_id || `webhook_${razorpaySubId}_${Date.now()}`,
            razorpay_payment_id: paymentEntity?.id,
            razorpay_subscription_id: razorpaySubId,
            status: 'completed',
            payment_type: 'subscription_renewal',
          }, client);

          // Ensure driver stays active
          await client.query(
            `UPDATE drivers SET subscription_active = true, updated_at = NOW() WHERE id = $1`,
            [driverSub.driver_id]
          );

          await client.query('COMMIT');

          logger.info(`Auto-renewal successful for driver ${driverSub.driver_id}, new expiry: ${newExpiry.toISOString()}`);

          // Notify driver
          const driverRes = await query('SELECT fcm_token FROM drivers WHERE id = $1', [driverSub.driver_id]);
          const planRes = await query('SELECT plan_name FROM recharge_plans WHERE id = $1', [driverSub.plan_id]);
          if (driverRes.rows[0]?.fcm_token) {
            DriverNotifications.subscriptionAutoRenewed(
              driverRes.rows[0].fcm_token,
              planRes.rows[0]?.plan_name || 'your plan',
              newExpiry.toLocaleDateString('en-IN')
            ).catch(err => logger.error(`Push error: ${err.message}`));
          }

          // Admin webhook
          const driverNameRes = await query('SELECT full_name FROM drivers WHERE id = $1', [driverSub.driver_id]);
          const webhookUrl = `${config.adminBackendUrl}/api/webhooks/driver-events`;
          axios.post(webhookUrl, {
            eventType: 'SUBSCRIPTION_AUTO_RENEWED',
            message: `Driver ${driverNameRes.rows[0]?.full_name || 'Unknown'} auto-renewed ${planRes.rows[0]?.plan_name || 'plan'}`,
            data: { driverId: driverSub.driver_id, planId: driverSub.plan_id, newExpiry },
          }, { headers: { 'x-api-key': config.internalServiceApiKey } }).catch(() => {});
        } catch (error) {
          await client.query('ROLLBACK');
          logger.error(`Webhook subscription.charged failed: ${error}`);
          throw error;
        } finally {
          client.release();
        }
        break;
      }

      case 'subscription.cancelled': {
        const driverSub = await SubscriptionRepository.getSubscriptionByRazorpayId(razorpaySubId);
        if (driverSub) {
          // Don't expire immediately — let the current cycle finish
          await SubscriptionRepository.updateSubscriptionAutoRenew(driverSub.driver_id, false);
          logger.info(`Subscription ${razorpaySubId} cancelled for driver ${driverSub.driver_id}. Will expire at cycle end.`);
        }
        break;
      }

      case 'subscription.halted': {
        // Payment failed after all retries — Razorpay has stopped trying
        const driverSub = await SubscriptionRepository.getSubscriptionByRazorpayId(razorpaySubId);
        if (driverSub) {
          await SubscriptionRepository.cancelActiveSubscription(driverSub.driver_id);
          await query(
            `UPDATE drivers SET subscription_active = false, updated_at = NOW() WHERE id = $1`,
            [driverSub.driver_id]
          );
          logger.warn(`Subscription halted for driver ${driverSub.driver_id} — payment failed after retries`);

          // Notify driver
          const driverRes = await query('SELECT fcm_token FROM drivers WHERE id = $1', [driverSub.driver_id]);
          if (driverRes.rows[0]?.fcm_token) {
            DriverNotifications.subscriptionPaymentFailed(driverRes.rows[0].fcm_token)
              .catch(err => logger.error(`Push error: ${err.message}`));
          }
        }
        break;
      }

      default:
        logger.info(`Unhandled webhook event type: ${eventType}`);
    }

    // Record the event for idempotency
    await SubscriptionRepository.recordEvent({
      razorpay_event_id: eventId,
      event_type: eventType,
      razorpay_subscription_id: razorpaySubId,
      razorpay_payment_id: paymentEntity?.id,
      payload,
    });

    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════════════
  // EXISTING: Queries (unchanged)
  // ═══════════════════════════════════════════════════════════════════

  async getMySubscription(driverId: string) {
    const subscription = await SubscriptionRepository.getActiveSubscription(driverId);
    if (!subscription) return null;

    const plan = await SubscriptionRepository.getPlanById(subscription.plan_id);
    return {
      subscription: {
        ...subscription,
        plan: plan,
      },
    };
  },

  async getAllActiveSubscriptions() {
    return await SubscriptionRepository.getAllActiveSubscriptions();
  },

  async sendExpiryWarnings() {
    logger.info('Fetching subscriptions expiring in the next 24-48 hours...');
    const expiringSubs = await SubscriptionRepository.getExpiringSubscriptions(24, 48);
    
    let sentCount = 0;
    for (const sub of expiringSubs) {
      if (sub.fcm_token) {
        await DriverNotifications.subscriptionExpiringSoon(sub.fcm_token, sub.plan_name)
          .catch(err => logger.error(`Failed to send expiry warning to driver ${sub.driver_id}: ${err.message}`));
        sentCount++;
      }
    }
    
    logger.info(`Successfully sent ${sentCount} subscription expiry warnings.`);
  },
};
