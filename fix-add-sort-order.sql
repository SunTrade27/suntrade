-- Add sort_order column to products table
-- Run this in Supabase SQL Editor

-- Add sort_order column (default 0, so existing products work fine)
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Create index for fast sorting
CREATE INDEX IF NOT EXISTS idx_products_sort_order ON products(sort_order);

-- Initialize sort_order for existing products based on created_at (newest first gets highest number)
UPDATE products SET sort_order = (
  SELECT COUNT(*) FROM products p2 
  WHERE p2.created_at >= products.created_at
) WHERE sort_order = 0 OR sort_order IS NULL;
