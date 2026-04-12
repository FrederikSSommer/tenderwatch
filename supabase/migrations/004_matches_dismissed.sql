-- Add dismissed column to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS dismissed BOOLEAN DEFAULT FALSE;
