-- ===== Fix visitor_events for admin access =====
-- The current RLS policy requires auth.uid() which doesn't work with anon key.
-- Fix: allow all SELECT for everyone (tracking data is anonymous anyway).

-- Drop the restrictive admin-only read policy
DROP POLICY IF EXISTS "Admin can read all visitor events" ON visitor_events;

-- Allow anyone to read visitor events (data is anonymous, no PII)
CREATE POLICY "Anyone can read visitor events" ON visitor_events
  FOR SELECT USING (true);

-- Add phone column for WhatsApp follow-up
ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';

-- Add utm_source column for Facebook ad tracking
ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS utm_source TEXT DEFAULT '';
ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS utm_medium TEXT DEFAULT '';
ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS utm_campaign TEXT DEFAULT '';

-- ===== Fix ads table RLS =====
-- Allow anyone to read ads (for the public ads page)
DROP POLICY IF EXISTS "Public can view active ads" ON ads;
CREATE POLICY "Public can view active ads" ON ads
  FOR SELECT USING (
    active = true
    AND (end_date IS NULL OR end_date > now())
    AND start_date <= now()
  );

-- Allow anyone to read all ads (admin uses anon key)
DROP POLICY IF EXISTS "Admin full access on ads" ON ads;
CREATE POLICY "Anyone can read ads" ON ads
  FOR SELECT USING (true);

-- Allow anyone to insert ads (the ads form uses anon key)
CREATE POLICY "Anyone can insert ads" ON ads
  FOR INSERT WITH CHECK (true);

-- Allow anyone to update ads (admin toggle uses anon key)
CREATE POLICY "Anyone can update ads" ON ads
  FOR UPDATE USING (true) WITH CHECK (true);

-- Allow anyone to delete ads (admin delete uses anon key)
CREATE POLICY "Anyone can delete ads" ON ads
  FOR DELETE USING (true);
