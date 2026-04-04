-- TenderWatch Database Schema
-- Run this in Supabase SQL Editor to set up the database

-- User profiles / company info
CREATE TABLE companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    industry TEXT,
    country_code TEXT DEFAULT 'DK',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription tracking
CREATE TABLE subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT CHECK (plan IN ('free', 'starter', 'professional', 'team')) DEFAULT 'free',
    status TEXT CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')) DEFAULT 'active',
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitoring profiles (what to watch for)
CREATE TABLE monitoring_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My profile',
    cpv_codes TEXT[] NOT NULL DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    exclude_keywords TEXT[] DEFAULT '{}',
    countries TEXT[] DEFAULT '{DK}',
    min_value_eur DECIMAL(14,2),
    max_value_eur DECIMAL(14,2),
    procedure_types TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT TRUE,
    notify_email BOOLEAN DEFAULT TRUE,
    notify_push BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenders (ingested from TED + MitUdbud)
CREATE TABLE tenders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source TEXT NOT NULL CHECK (source IN ('ted', 'mitudbud')),
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    buyer_name TEXT,
    buyer_country TEXT,
    cpv_codes TEXT[] DEFAULT '{}',
    procedure_type TEXT,
    tender_type TEXT,
    estimated_value_eur DECIMAL(14,2),
    currency TEXT DEFAULT 'EUR',
    submission_deadline TIMESTAMPTZ,
    publication_date DATE NOT NULL,
    document_url TEXT,
    ted_url TEXT,
    language TEXT DEFAULT 'EN',
    ai_summary TEXT,
    ai_summary_generated_at TIMESTAMPTZ,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source, external_id)
);

-- Full-text search index
CREATE INDEX idx_tenders_fts ON tenders
    USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- CPV code index for array matching
CREATE INDEX idx_tenders_cpv ON tenders USING GIN (cpv_codes);

-- Publication date index
CREATE INDEX idx_tenders_pub_date ON tenders (publication_date DESC);

-- Tender-profile matches
CREATE TABLE matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tender_id UUID REFERENCES tenders(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES monitoring_profiles(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    relevance_score DECIMAL(5,2),
    matched_cpv TEXT[],
    matched_keywords TEXT[],
    notified BOOLEAN DEFAULT FALSE,
    notified_at TIMESTAMPTZ,
    seen BOOLEAN DEFAULT FALSE,
    bookmarked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tender_id, profile_id)
);

-- Notification log
CREATE TABLE notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT CHECK (channel IN ('email', 'push')),
    tender_count INTEGER,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own data" ON companies FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON subscriptions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON monitoring_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON matches FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON notifications FOR ALL USING (auth.uid() = user_id);

-- Tenders are publicly readable
CREATE POLICY "Tenders are public" ON tenders FOR SELECT USING (true);
CREATE POLICY "System inserts tenders" ON tenders FOR INSERT WITH CHECK (true);
CREATE POLICY "System updates tenders" ON tenders FOR UPDATE USING (true);
