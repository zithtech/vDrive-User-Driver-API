export interface IRazorpayOrderResponse {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface IVerifyPaymentRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface IPayment {
  id?: number;
  driver_id: string;
  plan_id: number;
  billing_cycle: string;
  amount: number;
  currency?: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  status: 'pending' | 'completed' | 'failed';
  created_at?: Date;
  updated_at?: Date;
}

export interface ICreatePaymentInput {
  driver_id: string;
  plan_id: number;
  billing_cycle: string;
  amount: number;
  currency?: string;
  razorpay_order_id: string;
  status: 'pending';
}
