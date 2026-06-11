-- Track send outcome on the notification log so failed digests are visible
-- (previously failures were only console.error'd in Vercel logs).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS error TEXT;
