-- Add `paid` column to ads table
-- Unpaid ads should NEVER appear on the site
ALTER TABLE ads ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false;

-- Add `product_image_url` for product-page ad (separate from navbar image)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS product_image_url TEXT DEFAULT '';

-- Set existing active ads as paid (they were manually activated by admin)
UPDATE ads SET paid = true WHERE active = true;
