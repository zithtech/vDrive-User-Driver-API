import Razorpay from 'razorpay';
import crypto from 'crypto';
import { SubscriptionRepository } from './subscription.repository';
import { DriverRepository } from '../drivers/driver.repository';
import { PromoService } from '../promos/promo.service';
import { CreateOrderRequest, VerifyPaymentRequest } from './subscription.model';
import { query, getClient } from '../../shared/database';
import axios from 'axios';
import config from '../../config';
import { logger } from '../../shared/logger';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID as string,
  key_secret: process.env.RAZORPAY_KEY_SECRET as string,
});

export const SubscriptionService = {
  async createOrder(driverId: string, input: CreateOrderRequest) {
    const plan = await SubscriptionRepository.getPlanById(input.plan_id);
    if (!plan) {
      throw new Error('Invalid plan ID or plan is not active');
    }

    let amount = 0;
    if (input.billing_cycle === 'day') amount = Number(plan.daily_price);
    else if (input.billing_cycle === 'week') amount = Number(plan.weekly_price);
    else if (input.billing_cycle === 'month') amount = Number(plan.monthly_price);
    else throw new Error('Invalid billing cycle');

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
        // Apply whichever is higher between existing discount and first recharge discount
        // But if rewards are used, we should probably stick to them or add them.
        // For consistency with original code, we use Math.max for this specific first recharge logic.
        discountAmount = Math.max(discountAmount, firstDiscount);
      }
    }

    amount = Math.max(0, amount - discountAmount);

    // If amount is now 0 (fully covered by rewards/promos), we still need an order_id for the UI flow
    // unless we refactor the whole frontend. For now, we'll create a 1 INR order if it's 0 to keep Razorpay happy,
    // OR return a special flag for "FREE" purchase.
    // Let's stick to a full Razorpay order for >= 1 INR.

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
        const driverRes = await client.query('SELECT full_name FROM drivers WHERE id = $1', [
          driverId,
        ]);
        const planRes = await client.query('SELECT plan_name FROM recharge_plans WHERE id = $1', [
          payment.plan_id,
        ]);

        const driverName = driverRes.rows[0]?.full_name || 'A driver';
        const planName = planRes.rows[0]?.plan_name || 'a subscription plan';

        const actionText = isRenewal ? 'renewed' : 'activated';

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
};
