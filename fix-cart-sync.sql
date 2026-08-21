-- Add cart_data column to profiles table for cross-device cart sync
-- Run this in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cart_data JSONB DEFAULT '[]'::jsonb;
