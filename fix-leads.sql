-- ===== 1. Create visitor_events table (if not exists) =====
CREATE TABLE IF NOT EXISTS visitor_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'add_to_cart', 'checkout', 'purchase')),
  product_id UUID,
  product_name TEXT,
  product_price DECIMAL(10,2),
  product_image TEXT,
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  session_id TEXT,
  phone TEXT DEFAULT '',
  utm_source TEXT DEFAULT '',
  utm_medium TEXT DEFAULT '',
  utm_campaign TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor ON visitor_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_events_product ON visitor_events(product_id);
CREATE INDEX IF NOT EXISTS idx_visitor_events_type ON visitor_events(event_type);
CREATE INDEX IF NOT EXISTS idx_visitor_events_created ON visitor_events(created_at DESC);

-- Enable RLS
ALTER TABLE visitor_events ENABLE ROW LEVEL SECURITY;

-- Drop old restrictive policies if they exist
DROP POLICY IF EXISTS "Admin can read all visitor events" ON visitor_events;
DROP POLICY IF EXISTS "Allow anonymous event tracking" ON visitor_events;
DROP POLICY IF EXISTS "Anyone can read visitor events" ON visitor_events;

-- Anyone can insert (anonymous tracking)
CREATE POLICY "Allow anonymous event tracking" ON visitor_events
  FOR INSERT WITH CHECK (true);

-- Anyone can read (data is anonymous)
CREATE POLICY "Anyone can read visitor events" ON visitor_events
  FOR SELECT USING (true);

-- ===== 2. Fix ads table RLS =====
DROP POLICY IF EXISTS "Public can view active ads" ON ads;
DROP POLICY IF EXISTS "Admin full access on ads" ON ads;
DROP POLICY IF EXISTS "Anyone can read ads" ON ads;
DROP POLICY IF EXISTS "Anyone can insert ads" ON ads;
DROP POLICY IF EXISTS "Anyone can update ads" ON ads;
DROP POLICY IF EXISTS "Anyone can delete ads" ON ads;

CREATE POLICY "Anyone can read ads" ON ads
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert ads" ON ads
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update ads" ON ads
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete ads" ON ads
  FOR DELETE USING (true);
