-- Add `paid` column to ads table
-- Unpaid ads should NEVER appear on the site
ALTER TABLE ads ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false;

-- Set existing active ads as paid (they were manually activated by admin)
UPDATE ads SET paid = true WHERE active = true;
