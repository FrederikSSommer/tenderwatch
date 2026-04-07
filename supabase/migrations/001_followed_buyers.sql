-- Followed buyers table
CREATE TABLE IF NOT EXISTS followed_buyers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    buyer_name TEXT NOT NULL,
    buyer_country TEXT,
    ted_search_term TEXT, -- distinctive keyword for TED FT~ search
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, buyer_name)
);

ALTER TABLE followed_buyers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own data" ON followed_buyers FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_followed_buyers_user ON followed_buyers (user_id);
