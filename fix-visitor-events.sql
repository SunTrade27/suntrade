-- ===== Visitor Events (Lead Tracking) =====
-- Tracks anonymous visitor behavior for abandoned-cart / lead recovery.
-- Each visitor gets a random ID stored in localStorage (visitor_tracker_id).
-- Events: page_view, add_to_cart, checkout, purchase

CREATE TABLE IF NOT EXISTS visitor_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id TEXT NOT NULL,          -- random ID from localStorage
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'add_to_cart', 'checkout', 'purchase')),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  product_price DECIMAL(10,2),
  product_image TEXT,
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,                      -- SHA-256 hash of IP (for dedup, not PII)
  session_id TEXT,                   -- groups events from same visit
  metadata JSONB DEFAULT '{}',       -- extra data: variant, qty, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor ON visitor_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_events_product ON visitor_events(product_id);
CREATE INDEX IF NOT EXISTS idx_visitor_events_type ON visitor_events(event_type);
CREATE INDEX IF NOT EXISTS idx_visitor_events_created ON visitor_events(created_at DESC);

-- Enable RLS
ALTER TABLE visitor_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (anonymous tracking)
CREATE POLICY "Allow anonymous event tracking" ON visitor_events
  FOR INSERT WITH CHECK (true);

-- Admin can read all events
CREATE POLICY "Admin can read all visitor events" ON visitor_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Auto-cleanup: delete events older than 90 days (run via pg_cron or manual)
-- CREATE OR REPLACE FUNCTION cleanup_old_visitor_events()
-- RETURNS void AS $$
-- BEGIN
--   DELETE FROM visitor_events WHERE created_at < NOW() - INTERVAL '90 days';
-- END;
-- $$ LANGUAGE plpgsql;
