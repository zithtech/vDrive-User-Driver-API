import { Request, Response } from 'express';
import { PaymentService } from '../payments/payment.service';
import { logger } from '../../shared/logger';

export const PaymentController = {
   async createOrder(req: Request, res: Response): Promise<Response> {
    const { amount, driver_id, plan_id, billing_cycle } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ message: 'Valid amount is required.' });
    }

    if (!driver_id || !plan_id || !billing_cycle) {
      return res.status(400).json({ message: 'driver_id, plan_id, and billing_cycle are required.' });
    }

    try {
      const order = await PaymentService.createRazorpayOrder(driver_id, plan_id, billing_cycle, amount);
      return res.status(200).json({
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency
      });
    } catch (error) {
      logger.error(`Controller Error (createOrder): ${error}`);
      return res.status(500).json({ message: 'Failed to create Razorpay order.' });
    }
  },

  async verifyPayment(req: Request, res: Response): Promise<Response> {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment verification credentials.' });
    }

    try {
      const isValid = await PaymentService.verifySignature(req.body);

      if (isValid) {
        return res.status(200).json({ success: true, message: 'Payment verified successfully.' });
      } else {
        return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
      }
    } catch (error) {
      logger.error(`Controller Error (verifyPayment): ${error}`);
      return res.status(500).json({ message: 'Internal server error during verification.' });
    }
  },

  async createRideOrder(req: Request, res: Response): Promise<Response> {
    const { amount } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ message: 'Valid amount is required.' });
    }

    try {
      const order = await PaymentService.createRazorpayRideOrder(amount);
      return res.status(200).json({
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency
      });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to create Razorpay order.' });
    }
  },
};