import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentRepository } from '../payments/payment.repository';
import { IRazorpayOrderResponse, IVerifyPaymentRequest } from '../payments/payment.model';
import { logger } from '../../shared/logger';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID as string,
  key_secret: process.env.RAZORPAY_KEY_SECRET as string,
});

export const PaymentService = {
  async createRazorpayRideOrder(amount: number): Promise<IRazorpayOrderResponse> {
    try {
      const options = {
        amount: Math.round(amount * 100), // INR to Paise
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`,
      };

      const order = await razorpay.orders.create(options);

      // Persist in DB
      await PaymentRepository.saveRideOrder(order);

      return order as IRazorpayOrderResponse;
    } catch (error) {
      logger.error(`Service Error (createOrder): ${error}`);
      throw error;
    }
  },

  async verifyRideSignature(data: IVerifyPaymentRequest): Promise<boolean> {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data;
      const secret = process.env.RAZORPAY_KEY_SECRET as string;

      const generated_signature = crypto
        .createHmac('sha256', secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (generated_signature === razorpay_signature) {
        await PaymentRepository.updateRideStatus(razorpay_order_id, 'PAID', razorpay_payment_id);
        return true;
      }

      await PaymentRepository.updateRideStatus(razorpay_order_id, 'FAILED');
      return false;
    } catch (error) {
      logger.error(`Service Error (verifySignature): ${error}`);
      throw error;
    }
  },
  async createRazorpayOrder(
    driverId: string,
    planId: number,
    billingCycle: string,
    amount: number
  ): Promise<IRazorpayOrderResponse> {
    try {
      const options = {
        amount: Math.round(amount * 100), // INR to Paise
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`,
      };

      const order = await razorpay.orders.create(options);

      // Persist in DB
      await PaymentRepository.saveOrder({
        driver_id: driverId,
        plan_id: planId,
        billing_cycle: billingCycle,
        amount: amount,
        currency: 'INR',
        razorpay_order_id: order.id,
        status: 'pending',
      });

      return order as IRazorpayOrderResponse;
    } catch (error) {
      logger.error(`Service Error (createOrder): ${error}`);
      throw error;
    }
  },

  async verifySignature(data: IVerifyPaymentRequest): Promise<boolean> {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data;
      const secret = process.env.RAZORPAY_KEY_SECRET as string;

      const generated_signature = crypto
        .createHmac('sha256', secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (generated_signature === razorpay_signature) {
        /**
         * REDESIGN: ONBOARDING STATE MACHINE
         * After successful payment verification:
         * 1. Update order status to completed.
         * 2. Transition driver to 'SUBSCRIPTION_ACTIVE'.
         * 3. Set 'subscription_active' flag to true for Dashboard gating.
         */
        await PaymentRepository.updateStatus(
          razorpay_order_id,
          'completed',
          razorpay_payment_id,
          razorpay_signature
        );

        // Find driverId associated with this order
        const order = await PaymentRepository.getOrder(razorpay_order_id);
        if (order && order.driver_id) {
          const { DriverService } = require('../drivers/driver.service');
          await DriverService.updateDriver(order.driver_id, {
            onboarding_status: 'SUBSCRIPTION_ACTIVE',
            subscription_active: true,
          });
        }

        return true;
      }

      await PaymentRepository.updateStatus(
        razorpay_order_id,
        'failed',
        razorpay_payment_id,
        razorpay_signature
      );
      return false;
    } catch (error) {
      logger.error(`Service Error (verifySignature): ${error}`);
      throw error;
    }
  },
};
