/* ================================================================
   Support Models — FAQs & Tickets
   ================================================================ */

export interface SupportFaq {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface SupportTicket {
  id: string;
  driver_id: string;
  subject: string;
  description: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  admin_notes?: string;
  resolved_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserSupportTicket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  admin_notes?: string;
  resolved_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserSupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: 'user' | 'admin';
  message: string;
  is_read: boolean;
  created_at: Date;
}

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum FaqCategory {
  ONBOARDING = 'onboarding',
  DOCUMENTS = 'documents',
  RIDES = 'rides',
  EARNINGS = 'earnings',
  APP_ISSUES = 'app_issues',
  ACCOUNT = 'account',
  GENERAL = 'general',
}
