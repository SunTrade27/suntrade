INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-videos', 'product-videos', true, 209715200, ARRAY['video/mp4','video/webm','video/ogg','video/quicktime'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Public can view product videos" ON storage.objects FOR SELECT USING (bucket_id = 'product-videos');

CREATE POLICY "Admin can upload product videos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-videos' AND public.is_admin());

CREATE POLICY "Admin can update product videos" ON storage.objects FOR UPDATE USING (bucket_id = 'product-videos' AND public.is_admin());

CREATE POLICY "Admin can delete product videos" ON storage.objects FOR DELETE USING (bucket_id = 'product-videos' AND public.is_admin());
