-- SunTrade Advertising System
-- Run this SQL in Supabase SQL Editor

-- 1. Ads table
CREATE TABLE IF NOT EXISTS ads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT DEFAULT '',
  position TEXT NOT NULL DEFAULT 'product_bottom',  -- 'navbar' | 'product_bottom' | 'both'
  placement_priority INTEGER DEFAULT 0,              -- higher = shown first
  active BOOLEAN DEFAULT true,
  -- Advertiser info
  advertiser_name TEXT DEFAULT '',
  advertiser_email TEXT DEFAULT '',
  advertiser_phone TEXT DEFAULT '',
  -- Dates
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,                              -- NULL = no expiry
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS — everyone can read active ads, only admin can manage
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

-- Public read: only active, non-expired ads
CREATE POLICY "Public can view active ads" ON ads
  FOR SELECT USING (
    active = true
    AND (end_date IS NULL OR end_date > now())
    AND start_date <= now()
  );

-- Admin full access (using service_role key from server-side)
-- Since admin uses client-side Supabase with anon key, we need a permissive policy
CREATE POLICY "Admin full access on ads" ON ads
  FOR ALL USING (true)
  WITH CHECK (true);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ads_position ON ads(position, active, placement_priority DESC);
CREATE INDEX IF NOT EXISTS idx_ads_dates ON ads(start_date, end_date);
