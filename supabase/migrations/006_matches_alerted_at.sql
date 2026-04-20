-- Track when a high-relevance alert email was sent for a match.
-- NULL means no alert sent yet. Used by the hourly-alert cron to avoid
-- re-alerting on the same match across multiple hourly runs.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS alerted_at timestamptz DEFAULT NULL;
