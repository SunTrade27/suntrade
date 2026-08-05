-- Add type_image columns to products table
-- Each type can have its own image that shows when the type is selected on the product page
-- Run this in Supabase SQL Editor

ALTER TABLE products ADD COLUMN IF NOT EXISTS type_image TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS type_image2 TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS type_image3 TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS type_image4 TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS type_image5 TEXT DEFAULT '';
