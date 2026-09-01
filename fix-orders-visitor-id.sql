-- 1. Add phone column to visitor_events (if not exists)
ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';

-- 2. Add visitor_id column to orders (enables matching orders to visitors)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS visitor_id TEXT DEFAULT '';

-- 3. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_visitor ON orders(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_events_phone ON visitor_events(phone);

-- 4. Backfill phone from orders to visitor_events (by product_id match)
UPDATE visitor_events ve
SET phone = sub.customer_phone
FROM (
  SELECT DISTINCT ON (o.product_id)
    o.product_id,
    o.customer_phone
  FROM orders o
  WHERE o.customer_phone IS NOT NULL AND o.customer_phone != ''
) sub
WHERE ve.product_id = sub.product_id
  AND (ve.phone IS NULL OR ve.phone = '');
