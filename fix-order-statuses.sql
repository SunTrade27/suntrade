-- Migration: Update orders status check to allow new statuses
-- Run this in Supabase SQL Editor

-- Drop the existing check constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the new check constraint with all statuses
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'accepted', 'packing', 'shipped', 'delivered', 'cancelled'));

-- Update the default status for new orders
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';

-- Add an index for status filtering
CREATE INDEX IF NOT EXISTS idx_orders_status_updated ON orders(status, updated_at DESC);
