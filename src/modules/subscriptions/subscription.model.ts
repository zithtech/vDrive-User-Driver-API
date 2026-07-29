export interface SubscriptionPlan {
  id: number;
  name: string;
  plan_name: string;
  description?: string;
  plan_type?: string;
  ride_limit?: number;
  validity_days?: number;
  price?: number;
  daily_price: number;
  weekly_price: number;
  monthly_price: number;
  features: any;
  promo_code?: string;
  promo_discount?: number;
  first_recharge_discount?: number;
  is_active: boolean;
  // Razorpay Plan IDs (auto-created and cached per billing cycle)
  razorpay_plan_id_daily?: string;
  razorpay_plan_id_weekly?: string;
  razorpay_plan_id_monthly?: string;
  created_at: Date;
  updated_at?: Date;
}

export interface DriverSubscription {
  id: number;
  driver_id: string;
  plan_id: number;
  billing_cycle: 'day' | 'week' | 'month';
  start_date: Date;
  expiry_date: Date;
  status: 'active' | 'expired' | 'cancelled';
  auto_renew: boolean;
  razorpay_subscription_id?: string;
  previous_plan_id?: number;
  prorated_credit?: number;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRecord {
  id: number;
  driver_id: string;
  plan_id: number;
  billing_cycle: string;
  amount: number;
  currency: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  razorpay_subscription_id?: string;
  status: 'pending' | 'completed' | 'failed';
  applied_promo_id?: number;
  discount_amount?: number;
  reward_amount_used?: number;
  prorated_credit?: number;
  is_upgrade?: boolean;
  is_downgrade?: boolean;
  payment_type?: 'one_time' | 'subscription_creation' | 'subscription_renewal' | 'upgrade' | 'downgrade';
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionEvent {
  id: number;
  razorpay_event_id: string;
  event_type: string;
  razorpay_subscription_id?: string;
  razorpay_payment_id?: string;
  payload?: any;
  processed_at: Date;
}

export interface CreateOrderRequest {
  plan_id: number;
  billing_cycle: 'day' | 'week' | 'month';
  promo_code?: string;
  use_reward_balance?: boolean;
  auto_renew?: boolean;
}

export interface VerifyPaymentRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifySubscriptionPaymentRequest {
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface PlanChangePreview {
  current_plan: {
    name: string;
    price: number;
    billing_cycle: string;
    start_date: Date;
    expiry_date: Date;
  };
  new_plan: {
    name: string;
    price: number;
    billing_cycle: string;
  };
  proration: {
    total_days: number;
    unused_days: number;
    unused_credit: number;
    new_plan_cost: number;
    amount_to_pay: number;
  };
  is_upgrade: boolean;
}
