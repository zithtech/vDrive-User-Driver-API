-- ================================================================
-- Support System Migration
-- Creates support_faqs and support_tickets tables
-- Run this against your PostgreSQL database
-- ================================================================

-- 1. Support FAQs Table
CREATE TABLE IF NOT EXISTS support_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Support Tickets Table
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  admin_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Support Messages Table (for live chat)
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL, -- Driver ID or Admin ID
  sender_type VARCHAR(10) NOT NULL, -- 'driver' or 'admin'
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_support_faqs_category ON support_faqs(category);
CREATE INDEX IF NOT EXISTS idx_support_faqs_active ON support_faqs(is_active);
CREATE INDEX IF NOT EXISTS idx_support_tickets_driver ON support_tickets(driver_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);

-- 3. Seed some default FAQs for immediate use
INSERT INTO support_faqs (question, answer, category, sort_order) VALUES
  ('How do I upload my documents?', 'Go to the Document Verification screen and tap on the document you want to upload. Make sure the image is clear and all details are visible.', 'documents', 1),
  ('Why was my document rejected?', 'Documents are usually rejected if they are blurry, expired, or if the details do not match your profile. Please re-upload a clear copy.', 'documents', 2),
  ('How long does approval take?', 'Approval typically takes 24 to 48 hours after all documents are uploaded. You will receive a notification once verified.', 'onboarding', 3),
  ('Can I drive while my profile is pending?', 'No, you must wait for your profile and documents to be approved before you can start receiving ride requests.', 'onboarding', 4),
  ('How do I accept a ride?', 'Toggle your status to Online on the home screen. When a ride request appears, tap Accept. Then follow the navigation to the pickup location.', 'rides', 5),
  ('How do payouts work?', 'Your earnings are calculated after every completed trip. Payouts are processed weekly directly to your registered bank account.', 'earnings', 6),
  ('What if a rider cancels?', 'If a rider cancels after you have been driving toward them for a certain time, you will receive a cancellation fee automatically.', 'rides', 7),
  ('What do I do if the app freezes?', 'Try force-closing the app and reopening it. Make sure you have a stable internet connection. If the issue persists, contact support.', 'app_issues', 8),
  ('How do I contact support?', 'You can reach our support team via the Help Center in the app, or by calling/WhatsApp at the numbers provided.', 'general', 9),
  ('How is my commission calculated?', 'VDrive charges a small platform fee on each trip. The exact percentage is shown in your Earnings breakdown after every trip.', 'earnings', 10)
ON CONFLICT DO NOTHING;
