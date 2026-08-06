-- Adds an option_groups JSONB column to hold Alibaba-style option
-- groups per product. Shape:
--
--   [
--     {
--       "name": "Color",
--       "type": "color" | "text",
--       "options": [
--         { "label": "Black",          "price_mod": 0,    "color_hex": "#0F1115", "image": null },
--         { "label": "White",          "price_mod": +5.0, "color_hex": "#F4F4F4", "image": null },
--         { "label": "Stainless Pink", "price_mod": +8.0, "color_hex": "#E5B7B7", "image": null }
--       ]
--     },
--     {
--       "name": "Plug",
--       "type": "text",
--       "options": [
--         { "label": "EU",  "price_mod": 0,    "color_hex": null, "image": null },
--         { "label": "AU",  "price_mod": 0,    "color_hex": null, "image": null },
--         { "label": "UK",  "price_mod": 0,    "color_hex": null, "image": null },
--         { "label": "US",  "price_mod": 0,    "color_hex": null, "image": null }
--       ]
--     },
--     {
--       "name": "Accessories",
--       "type": "text",
--       "options": [
--         { "label": "Bags",  "price_mod": 0,    "color_hex": null, "image": null },
--         { "label": "Cables","price_mod": +3.0, "color_hex": null, "image": null }
--       ]
--     }
--   ]
--
-- price_mod adds to the base price when this option is selected on
-- the buyer-side variant selector.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS option_groups JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Sanity check: jsonb array; each entry must have name + options array.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_option_groups_shape_chk'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_option_groups_shape_chk
      CHECK (
        jsonb_typeof(option_groups) = 'array'
        AND (
          SELECT bool_and(
            (e ? 'name') AND (e ? 'options')
            AND jsonb_typeof(e->'options') = 'array'
            AND (SELECT bool_and(op ? 'label') FROM jsonb_array_elements(e->'options') op)
          )
          FROM jsonb_array_elements(option_groups) AS e
        )
      );
  END IF;
END$$;

-- GIN index for any future "give me all products with a group called Plug" lookup.
CREATE INDEX IF NOT EXISTS products_option_groups_gin_idx
  ON products USING GIN (option_groups);
