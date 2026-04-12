-- Add AI reason column to matches table
-- Stores the one-liner explanation from Claude about why a tender matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS ai_reason TEXT DEFAULT NULL;
