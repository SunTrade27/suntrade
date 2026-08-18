-- Allow AVIF product images in Supabase Storage.
-- Run this once in the Supabase SQL Editor for the live project.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif'
]
WHERE id = 'product-images';
