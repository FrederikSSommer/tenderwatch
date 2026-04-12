-- Add description column to monitoring_profiles
-- Stores the company/profile description for better AI matching context
ALTER TABLE monitoring_profiles ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;
