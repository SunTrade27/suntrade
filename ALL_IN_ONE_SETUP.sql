-- ============================================================
-- SunTrade: ТОЛЫҚ SQL ОРНАТУ (БАРЛЫҒЫ БІР ФАЙЛДА)
-- Supabase SQL Editor-де осы файлдың БАРЛЫҒЫН көшіріп, орындаңыз
-- ============================================================

-- ============================================================
-- 1-БӨЛІМ: КЕСТЕЛЕР (егер әлі жоқ болса)
-- ============================================================

-- User Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  zip TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
CREATE POLICY "Users can delete own profile" ON profiles FOR DELETE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Allow profile creation on signup" ON profiles;
CREATE POLICY "Allow profile creation on signup" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
-- is_admin() функциясы (RLS-ті айналып өтеді, рекурсия жоқ)
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

DROP POLICY IF EXISTS "Admin can view all profiles" ON profiles;
CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (public.is_admin());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email IN ('serjanyelemesov@gmail.com', 'sundetofficial@gmail.com') THEN true ELSE false END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_en TEXT, name_kz TEXT, name_ru TEXT, name_de TEXT,
  name_fr TEXT, name_es TEXT, name_it TEXT, name_tr TEXT,
  name_pt TEXT, name_nl TEXT, name_pl TEXT, name_ar TEXT,
  slug TEXT UNIQUE, icon TEXT DEFAULT 'package',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view categories" ON categories;
CREATE POLICY "Public can view categories" ON categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin full access to categories" ON categories;
CREATE POLICY "Admin full access to categories" ON categories FOR ALL USING (public.is_admin());

-- Products
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_kz TEXT, name_ru TEXT, name_de TEXT, name_fr TEXT, name_es TEXT,
  name_it TEXT, name_tr TEXT, name_pt TEXT, name_nl TEXT, name_pl TEXT, name_ar TEXT,
  desc_en TEXT, desc_kz TEXT, desc_ru TEXT, desc_de TEXT, desc_fr TEXT, desc_es TEXT,
  desc_it TEXT, desc_tr TEXT, desc_pt TEXT, desc_nl TEXT, desc_pl TEXT, desc_ar TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  images TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active products" ON products;
CREATE POLICY "Public can view active products" ON products FOR SELECT USING (active = true);
DROP POLICY IF EXISTS "Admin full access to products" ON products;
CREATE POLICY "Admin full access to products" ON products FOR ALL USING (public.is_admin());

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  shipping_name TEXT,
  shipping_address TEXT,
  shipping_address_line1 TEXT,
  shipping_address_line2 TEXT,
  shipping_city TEXT,
  shipping_postal_code TEXT,
  shipping_country TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  stripe_session_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'accepted', 'packing', 'shipped', 'delivered', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to orders" ON orders;
CREATE POLICY "Admin full access to orders" ON orders FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Allow order creation" ON orders;
CREATE POLICY "Allow order creation" ON orders FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (
  customer_email = (SELECT email FROM profiles WHERE id = auth.uid())
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_image TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own order items" ON order_items;
CREATE POLICY "Users can view own order items" ON order_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
    AND orders.customer_email = (SELECT email FROM profiles WHERE id = auth.uid())
  )
);
DROP POLICY IF EXISTS "Admin full access to order_items" ON order_items;
CREATE POLICY "Admin full access to order_items" ON order_items FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Allow order_items creation" ON order_items;
CREATE POLICY "Allow order_items creation" ON order_items FOR INSERT WITH CHECK (true);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_avatar TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  images TEXT[] DEFAULT '{}',
  verified BOOLEAN DEFAULT false,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view approved reviews" ON reviews;
CREATE POLICY "Public can view approved reviews" ON reviews FOR SELECT USING (approved = true);
DROP POLICY IF EXISTS "Anyone can insert reviews" ON reviews;
CREATE POLICY "Anyone can insert reviews" ON reviews FOR INSERT WITH CHECK (approved = false);
DROP POLICY IF EXISTS "Admin full access to reviews" ON reviews;
CREATE POLICY "Admin full access to reviews" ON reviews FOR ALL USING (public.is_admin());

-- Review Requests
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed BOOLEAN DEFAULT false
);
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to review_requests" ON review_requests;
CREATE POLICY "Admin full access to review_requests" ON review_requests FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Allow review request creation" ON review_requests;
CREATE POLICY "Allow review request creation" ON review_requests FOR INSERT WITH CHECK (true);

-- ============================================================
-- 2-БӨЛІМ: ЧАТ ЖҮЙЕСІ (wa_conversations, wa_messages)
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  customer_lang TEXT DEFAULT 'en',
  status TEXT DEFAULT 'ai' CHECK (status IN ('ai', 'human', 'closed')),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES wa_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'ai', 'admin')),
  original_text TEXT NOT NULL,
  translated_text TEXT,
  original_lang TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_conv_customer ON wa_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON wa_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON wa_messages(created_at DESC);
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to wa_conversations" ON wa_conversations;
CREATE POLICY "Admin full access to wa_conversations" ON wa_conversations FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin full access to wa_messages" ON wa_messages;
CREATE POLICY "Admin full access to wa_messages" ON wa_messages FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Public can manage own conversation" ON wa_conversations;
CREATE POLICY "Public can manage own conversation" ON wa_conversations FOR ALL WITH CHECK (true);
DROP POLICY IF EXISTS "Public can manage own messages" ON wa_messages;
CREATE POLICY "Public can manage own messages" ON wa_messages FOR ALL WITH CHECK (true);

-- ============================================================
-- 3-БӨЛІМ: STORAGE BUCKETS (product-images, review-images, avatars)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 10485760, ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-images', 'review-images', true, 10485760, ARRAY['image/png','image/jpeg','image/jpg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/png','image/jpeg','image/jpg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies (тазалау + қайта жасау)
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- product-images
CREATE POLICY "Public can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Admin can upload product images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'product-images' AND public.is_admin()
);
CREATE POLICY "Admin can update product images" ON storage.objects FOR UPDATE USING (
  bucket_id = 'product-images' AND public.is_admin()
);
CREATE POLICY "Admin can delete product images" ON storage.objects FOR DELETE USING (
  bucket_id = 'product-images' AND public.is_admin()
);

-- review-images
CREATE POLICY "Public can view review images" ON storage.objects FOR SELECT USING (bucket_id = 'review-images');
CREATE POLICY "Anyone can upload review images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'review-images');
CREATE POLICY "Admin can delete review images" ON storage.objects FOR DELETE USING (
  bucket_id = 'review-images' AND public.is_admin()
);

-- avatars
CREATE POLICY "Public can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND auth.uid() IS NOT NULL
);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE USING (
  bucket_id = 'avatars' AND auth.uid() IS NOT NULL
);
CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE USING (
  bucket_id = 'avatars' AND auth.uid() IS NOT NULL
);

-- ============================================================
-- 4-БӨЛІМ: SAMPLE CATEGORIES (бірінші рет орнатқанда)
-- ============================================================
INSERT INTO categories (name_en, name_kz, name_ru, name_de, name_fr, name_es, name_it, name_tr, slug, icon) VALUES
  ('Electronics', 'Электроника', 'Электроника', 'Elektronik', 'Électronique', 'Electrónica', 'Elettronica', 'Elektronik', 'electronics', 'phone'),
  ('Fashion', 'Сән', 'Мода', 'Mode', 'Mode', 'Moda', 'Moda', 'Moda', 'fashion', 'heart'),
  ('Home & Garden', 'Үй және бақша', 'Дом и сад', 'Haus & Garten', 'Maison & Jardin', 'Hogar y Jardín', 'Casa e Giardino', 'Ev & Bahçe', 'home-garden', 'home'),
  ('Sports', 'Спорт', 'Спорт', 'Sport', 'Sport', 'Deportes', 'Sport', 'Spor', 'sports', 'heart'),
  ('Toys', 'Ойыншықтар', 'Игрушки', 'Spielzeug', 'Jouets', 'Juguetes', 'Giochi', 'Oyuncaklar', 'toys', 'heart'),
  ('Automotive', 'Автомобиль', 'Автомобили', 'Auto', 'Auto', 'Automóvil', 'Auto', 'Otomotiv', 'automotive', 'truck'),
  ('Tools', 'Құралдар', 'Инструменты', 'Werkzeuge', 'Outils', 'Herramientas', 'Attrezzi', 'Aletler', 'tools', 'edit'),
  ('Beauty', 'Сұлулық', 'Красота', 'Schönheit', 'Beauté', 'Bellezza', 'Güzellik', 'Güzellik', 'beauty', 'heart')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- ✅ АЯҚТАЛДЫ!
-- Барлық кестелер, constraint-тер, RLS, storage, чат жүйесі орнатылды
-- ============================================================
SELECT '✅ Барлық кестелер сәтті орнатылды!' AS result;
