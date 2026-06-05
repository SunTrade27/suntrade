-- ============================================================
-- SunTrade: Storage RLS (Row Level Security) Fix
-- Run this in Supabase SQL Editor
-- This fixes the error: "new row violates row-level security policy"
-- when uploading images from admin.html
-- ============================================================

-- ===== 1. Ensure storage buckets exist and are PUBLIC =====
-- We need to create buckets only if they don't exist.
-- In Supabase, buckets are in storage.buckets table.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 10485760, ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-images', 'review-images', true, 10485760, ARRAY['image/png','image/jpeg','image/jpg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/png','image/jpeg','image/jpg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ===== 2. Clean up old (potentially broken) storage policies =====
-- Drop all existing storage policies so we start fresh.
-- This is safe — Supabase recreates them below.

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;


-- ===== 3. product-images bucket policies =====
-- 3a) Public read — anyone (including anonymous site visitors) can view images
CREATE POLICY "Public can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- 3b) Admin can insert — only logged-in admin users can upload
CREATE POLICY "Admin can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 3c) Admin can update (overwrite) their images
CREATE POLICY "Admin can update product images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 3d) Admin can delete
CREATE POLICY "Admin can delete product images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );


-- ===== 4. review-images bucket policies =====
CREATE POLICY "Public can view review images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-images');

CREATE POLICY "Anyone can upload review images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-images');

CREATE POLICY "Admin can delete review images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'review-images'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );


-- ===== 5. avatars bucket policies =====
-- 5a) Public read
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- 5b) Authenticated users can upload their own avatar
-- Path format: avatar_<userId>_<timestamp>.<ext>
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
  );

-- 5c) Users can update their own avatar
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
  );

-- 5d) Users can delete their own avatar
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
  );


-- ===== 6. Verify: show all storage policies =====
SELECT
  policyname AS policy_name,
  cmd AS command,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname, cmd;
