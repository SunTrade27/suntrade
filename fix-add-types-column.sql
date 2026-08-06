-- Adds a JSONB array column to `products` so the admin form can store
-- multiple variants per product (Type 1, Type 2, Type 3, ...) with
-- independent price + stock. Each entry shape:
--   [{ "label": "Size", "price": 89.99, "stock": 55 }, ...]
--
-- The legacy `type`, `price`, and `stock` columns are kept. saveProduct()
-- mirrors the first array entry into them so existing pages (product.html,
-- catalog.html, cart, checkout) keep working without changes.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS types JSONB NOT NULL DEFAULT '[]'::jsonb;

-- A sanity-check constraint — every entry must have a price and stock.
-- We accept null/blank labels but require non-negative price and stock.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_types_shape_chk'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_types_shape_chk
      CHECK (
        jsonb_typeof(types) = 'array'
        AND (
          SELECT bool_and(
            (e ? 'price') AND (e ? 'stock')
            AND (e->>'price')::numeric >= 0
            AND (e->>'stock')::int >= 0
          )
          FROM jsonb_array_elements(types) AS e
        )
      );
  END IF;
END$$;

-- Index to make any future per-variant lookups cheap.
CREATE INDEX IF NOT EXISTS products_types_gin_idx
  ON products USING GIN (types);
