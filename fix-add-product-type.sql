-- Add `type` column to products table (for products that have variants like "Color", "Size", "Material", etc.)
-- Run this in Supabase SQL Editor

ALTER TABLE products ADD COLUMN IF NOT EXISTS type TEXT DEFAULT '';
