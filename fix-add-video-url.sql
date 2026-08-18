-- ============================================================
-- Product video + variants + option groups: add missing columns
-- Run this ONCE in the Supabase SQL editor (Database → SQL Editor).
--
-- The admin panel silently drops any field whose column does not
-- exist yet (self-heal), so until these are applied the product
-- video, variants (types) and option groups are NOT stored.
-- ============================================================

-- 1) Optional product video link (YouTube / Vimeo / MP4)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2) Variants list: [{label, price, stock, image}, ...]
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS types JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3) Alibaba-style option groups: [{name, type, options:[...]}, ...]
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS option_groups JSONB NOT NULL DEFAULT '[]'::jsonb;
