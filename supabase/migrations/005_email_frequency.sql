-- Add email_frequency to subscriptions: 'daily', 'weekly', 'off'
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS email_frequency TEXT DEFAULT 'daily';
