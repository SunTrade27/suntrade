-- Add type2, type3, type4, type5 columns to products table
-- (for products that have multiple variant dimensions like Size, Color, Material, etc.)
-- Run this in Supabase SQL Editor

ALTER TABLE products ADD COLUMN IF NOT EXISTS type2 TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS type3 TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS type4 TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS type5 TEXT DEFAULT '';
