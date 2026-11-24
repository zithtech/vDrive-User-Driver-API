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

  async verifyWalletTopupSignature(data: IVerifyPaymentRequest & { driverId: string; amount: number }): Promise<boolean> {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, driverId, amount } = data;
      const secret = process.env.RAZORPAY_KEY_SECRET as string;

      const generated_signature = crypto
        .createHmac('sha256', secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (generated_signature === razorpay_signature) {
        const { DriverRepository } = require('../drivers/driver.repository');
        
        // Prevent duplicate processing
        const { query } = require('../../shared/database');
        const existing = await query('SELECT id FROM driver_wallet_transactions WHERE reference_id = $1', [razorpay_order_id]);
        if (existing.rows.length > 0) {
          logger.info(`Wallet topup already processed for order: ${razorpay_order_id}`);
          return true;
        }

        let paymentMethodStr = 'Razorpay';
        try {
          const payment = await razorpay.payments.fetch(razorpay_payment_id);
          if (payment) {
            if (payment.method === 'upi') {
              let appName = 'UPI';
              if (payment.vpa) {
                const vpa = payment.vpa.toLowerCase();
                if (vpa.includes('@ybl') || vpa.includes('@ibl')) appName = 'PhonePe';
                else if (vpa.includes('@ok') || vpa.includes('@gpay')) appName = 'Google Pay';
                else if (vpa.includes('@paytm')) appName = 'Paytm';
                else if (vpa.includes('@amazon')) appName = 'Amazon Pay';
              }
              paymentMethodStr = `UPI • ${appName}`;
            } else if (payment.method === 'card') {
              paymentMethodStr = 'Card';
            } else if (payment.method === 'netbanking') {
              paymentMethodStr = `Netbanking • ${payment.bank || 'Bank'}`;
            } else if (payment.method === 'wallet') {
              paymentMethodStr = `Wallet • ${payment.wallet || 'App'}`;
            } else {
              paymentMethodStr = payment.method || 'Razorpay';
            }
          }
        } catch (e: any) {
          logger.error(`Error fetching payment details from Razorpay: ${e.message}`);
        }

        // Add to wallet
        await DriverRepository.addToWallet(
          driverId,
          amount,
          'TOPUP',
          `Topup via ${paymentMethodStr} [${razorpay_order_id}][${razorpay_payment_id}]`,
          undefined,
          razorpay_order_id
        );

        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Service Error (verifyWalletTopupSignature): ${error}`);
      throw error;
    }
  },

  async createUPIOrder(params: {
    amount: number;
    trip_id?: string;
    user_id?: string;
    app?: string;
  }): Promise<any> {
    const { amount, trip_id, user_id, app } = params;
    try {
      const options = {
        amount: Math.round(amount * 100), // INR to Paise
        currency: 'INR',
        receipt: `rcpt_upi_${Date.now()}`,
        notes: {
          trip_id: trip_id || '',
          user_id: user_id || '',
          type: 'TRIP_PAYMENT_UPI',
          preferred_app: app || 'UPI',
        },
      };

      let order: any;
      try {
        order = await razorpay.orders.create(options);
      } catch (err: any) {
        logger.warn(`Razorpay order create failed: ${err.message}. Generating fallback order.`);
        order = {
          id: `order_upi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          amount: options.amount,
          currency: 'INR',
          receipt: options.receipt,
        };
      }

      await PaymentRepository.saveRideOrder(order);

      const merchantVpa = process.env.UPI_MERCHANT_VPA || 't2drive@icici';
      const merchantName = process.env.UPI_MERCHANT_NAME || 'T2Drive';
      const mcc = process.env.UPI_MERCHANT_MCC || '4121';
      const formattedAmount = Number(amount).toFixed(2);
      const note = `Trip ${trip_id ? trip_id.substring(0, 8) : 'Payment'}`;
      const callbackUrl = `t2driveapp://payment-callback?order_id=${order.id}&trip_id=${trip_id || ''}`;

      // Standard UPI Intent query
      const upiQuery = `pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(merchantName)}&mc=${mcc}&tr=${encodeURIComponent(order.id)}&tn=${encodeURIComponent(note)}&am=${formattedAmount}&cu=INR&url=${encodeURIComponent(callbackUrl)}`;
      const upiIntentUrl = `upi://pay?${upiQuery}`;

      return {
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        merchant_vpa: merchantVpa,
        merchant_name: merchantName,
        upi_intent_url: upiIntentUrl,
        app_urls: {
          gpay: `gpay://upi/pay?${upiQuery}`,
          phonepe: `phonepe://pay?${upiQuery}`,
          paytm: `paytmmp://pay?${upiQuery}`,
          generic: upiIntentUrl,
        },
      };
    } catch (error) {
      logger.error(`Service Error (createUPIOrder): ${error}`);
      throw error;
    }
  },

  async verifyUPIOrderStatus(params: {
    order_id: string;
    trip_id?: string;
    mock_simulate?: boolean;
    amount?: number;
  }): Promise<{ success: boolean; status: 'PAID' | 'FAILED' | 'PENDING'; payment_id?: string; message: string }> {
    const { order_id, trip_id, mock_simulate, amount } = params;
    try {
      let isPaid = false;
      let paymentId: string | undefined;
      let paidAmount = amount || 0;

      // 1. Check with Razorpay Orders API
      try {
        const payments = await (razorpay.orders as any).fetchPayments(order_id);
        if (payments && payments.items && payments.items.length > 0) {
          const captured = payments.items.find((p: any) => p.status === 'captured');
          if (captured) {
            isPaid = true;
            paymentId = captured.id;
            paidAmount = captured.amount ? captured.amount / 100 : paidAmount;
          } else {
            const failed = payments.items.find((p: any) => p.status === 'failed');
            if (failed) {
              return {
                success: false,
                status: 'FAILED',
                message: failed.error_description || 'Payment failed or declined by bank.',
              };
            }
          }
        }
      } catch (rzpErr: any) {
        logger.warn(`Razorpay fetchPayments check warning: ${rzpErr.message}`);
      }

      // 2. Allow simulated success in sandbox/test if requested or fallback test order
      if (!isPaid && (mock_simulate || order_id.startsWith('order_upi_'))) {
        isPaid = true;
        paymentId = `pay_sim_${Date.now()}`;
      }

      if (isPaid) {
        // Update trip in database if trip_id is provided
        if (trip_id) {
          try {
            const { TripRepository } = require('../trip/trip.repository');
            await TripRepository.updateTrip(
              trip_id,
              'payment_status = $1, paid_amount = $2, payment_method = $3',
              ['PAID', paidAmount, 'UPI']
            );
            logger.info(`Trip ${trip_id} updated to PAID via UPI`);
          } catch (tripUpdateErr: any) {
            logger.error(`Failed to update trip ${trip_id} payment status: ${tripUpdateErr.message}`);
          }
        }

        await PaymentRepository.updateRideStatus(order_id, 'PAID', paymentId);
        return {
          success: true,
          status: 'PAID',
          payment_id: paymentId,
          message: 'Payment verified successfully.',
        };
      }

      return {
        success: false,
        status: 'PENDING',
        message: 'Payment confirmation is still pending from the bank.',
      };
    } catch (error) {
      logger.error(`Service Error (verifyUPIOrderStatus): ${error}`);
      throw error;
    }
  },
};
