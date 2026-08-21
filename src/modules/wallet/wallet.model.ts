export interface WalletAutoReloadSettings {
  id?: string;
  user_id: string;
  enabled: boolean;
  threshold_amount: number;
  reload_amount: number;
  payment_method_id?: string;
  daily_limit: number;
  monthly_limit: number;
  push_notification: boolean;
  email_notification: boolean;
  sms_notification: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface WalletAutoReloadHistory {
  id?: string;
  user_id: string;
  amount: number;
  status: 'SUCCESS' | 'FAILED';
  payment_transaction_id?: string;
  failure_reason?: string;
  created_at?: Date;
}
