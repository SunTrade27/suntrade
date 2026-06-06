-- ============================================================
-- ТҮЗЕТУ: RLS "infinite recursion" қатесі
-- Мәселе: profiles кестесіндегі SELECT саясаты өз-өзіне сілтеме жасайды
-- Шешім: SECURITY DEFINER функция арқылы admin тексеру
-- ============================================================

-- 1) Қауіпсіз admin тексеру функциясы (RLS-ті айналып өтеді)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- 2) Барлық рекурсивті саясаттарды жою
DROP POLICY IF EXISTS "Admin can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admin full access to categories" ON categories;
DROP POLICY IF EXISTS "Admin full access to products" ON products;
DROP POLICY IF EXISTS "Admin full access to orders" ON orders;
DROP POLICY IF EXISTS "Admin full access to order_items" ON order_items;
DROP POLICY IF EXISTS "Admin full access to reviews" ON reviews;
DROP POLICY IF EXISTS "Admin full access to review_requests" ON review_requests;

-- 3) Жаңа, рекурсиясыз саясаттар (is_admin() функциясын қолданады)

-- profiles
CREATE POLICY "Admin can view all profiles" ON profiles
  FOR SELECT USING (public.is_admin());

-- categories
CREATE POLICY "Admin full access to categories" ON categories
  FOR ALL USING (public.is_admin());

-- products
CREATE POLICY "Admin full access to products" ON products
  FOR ALL USING (public.is_admin());

-- orders
CREATE POLICY "Admin full access to orders" ON orders
  FOR ALL USING (public.is_admin());

-- order_items
CREATE POLICY "Admin full access to order_items" ON order_items
  FOR ALL USING (public.is_admin());

-- reviews
CREATE POLICY "Admin full access to reviews" ON reviews
  FOR ALL USING (public.is_admin());

-- review_requests
CREATE POLICY "Admin full access to review_requests" ON review_requests
  FOR ALL USING (public.is_admin());

-- 4) Storage саясаттары да profiles-ке сілтеме жасайды — оларды да түзету
DROP POLICY IF EXISTS "Admin can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete review images" ON storage.objects;

CREATE POLICY "Admin can upload product images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY "Admin can update product images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY "Admin can delete product images" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND public.is_admin());

CREATE POLICY "Admin can delete review images" ON storage.objects
  FOR DELETE USING (bucket_id = 'review-images' AND public.is_admin());

-- ============================================================
-- ✅ АЯҚТАЛДЫ! Supabase SQL Editor-де осы файлды орындаңыз.
-- Орындалғаннан кейін сайттағы санаттар мен тауарлар қайта көрінеді.
-- ============================================================
SELECT '✅ RLS рекурсиясы түзетілді!' AS result;
