-- SunTrade Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- ===== User Profiles (must be created first - other tables reference it) =====
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

-- Index
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Users can delete their own profile
CREATE POLICY "Users can delete own profile" ON profiles
  FOR DELETE USING (auth.uid() = id);

-- Allow insert on signup (trigger)
CREATE POLICY "Allow profile creation on signup" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin can view all profiles
CREATE POLICY "Admin can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Function: auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email IN ('serjanyelemesov@gmail.com', 'sundetofficial@gmail.com') THEN true ELSE false END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fire on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_en TEXT,
  name_kz TEXT,
  name_ru TEXT,
  name_de TEXT,
  name_fr TEXT,
  name_es TEXT,
  name_it TEXT,
  name_tr TEXT,
  name_pt TEXT,
  name_nl TEXT,
  name_pl TEXT,
  name_ar TEXT,
  slug TEXT UNIQUE,
  icon TEXT DEFAULT 'package',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_kz TEXT,
  name_ru TEXT,
  name_de TEXT,
  name_fr TEXT,
  name_es TEXT,
  name_it TEXT,
  name_tr TEXT,
  name_pt TEXT,
  name_nl TEXT,
  name_pl TEXT,
  name_ar TEXT,
  desc_en TEXT,
  desc_kz TEXT,
  desc_ru TEXT,
  desc_de TEXT,
  desc_fr TEXT,
  desc_es TEXT,
  desc_it TEXT,
  desc_tr TEXT,
  desc_pt TEXT,
  desc_nl TEXT,
  desc_pl TEXT,
  desc_ar TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  images TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  shipping_address TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  stripe_session_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policies: Public read for products and categories
CREATE POLICY "Public can view active products" ON products
  FOR SELECT USING (active = true);

CREATE POLICY "Public can view categories" ON categories
  FOR SELECT USING (true);

-- Policies: Authenticated admin can do everything (checks is_admin in profiles)
CREATE POLICY "Admin full access to products" ON products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admin full access to categories" ON categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admin full access to orders" ON orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Allow webhook to insert orders
CREATE POLICY "Allow order creation" ON orders
  FOR INSERT WITH CHECK (true);

-- Orders: allow users to view their own orders by email
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (
    customer_email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

-- Insert sample categories
INSERT INTO categories (name_en, name_kz, name_ru, name_de, name_fr, name_es, name_it, name_tr, slug, icon) VALUES
  ('Electronics', 'Электроника', 'Электроника', 'Elektronik', 'Électronique', 'Electrónica', 'Elettronica', 'Elektronik', 'electronics', 'phone'),
  ('Fashion', 'Сән', 'Мода', 'Mode', 'Mode', 'Moda', 'Moda', 'Moda', 'fashion', 'heart'),
  ('Home & Garden', 'Үй және бақша', 'Дом и сад', 'Haus & Garten', 'Maison & Jardin', 'Hogar y Jardín', 'Casa e Giardino', 'Ev & Bahçe', 'home-garden', 'home'),
  ('Sports', 'Спорт', 'Спорт', 'Sport', 'Sport', 'Deportes', 'Sport', 'Spor', 'sports', 'heart'),
  ('Toys', 'Ойыншықтар', 'Игрушки', 'Spielzeug', 'Jouets', 'Juguetesi', 'Giochi', 'Oyuncaklar', 'toys', 'heart'),
  ('Automotive', 'Автомобиль', 'Автомобили', 'Auto', 'Auto', 'Automóvil', 'Auto', 'Otomotiv', 'automotive', 'truck'),
  ('Tools', 'Құралдар', 'Инструменты', 'Werkzeuge', 'Outils', 'Herramientas', 'Attrezzi', 'Aletler', 'tools', 'edit');

-- Reviews table
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

-- Review email tracking table
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed BOOLEAN DEFAULT false
);

-- Enable Row Level Security for reviews
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;

-- Public can view approved reviews
CREATE POLICY "Public can view approved reviews" ON reviews
  FOR SELECT USING (approved = true);

-- Anyone can insert reviews but must set approved=false
CREATE POLICY "Anyone can insert reviews" ON reviews
  FOR INSERT WITH CHECK (approved = false);

-- Admin full access to reviews
CREATE POLICY "Admin full access to reviews" ON reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admin full access to review_requests
CREATE POLICY "Admin full access to review_requests" ON review_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Allow webhook to insert review_requests
CREATE POLICY "Allow review request creation" ON review_requests
  FOR INSERT WITH CHECK (true);

-- Storage bucket for product images
-- Create this manually in Supabase Dashboard > Storage > New Bucket
-- Name: product-images
-- Public: true

-- Storage bucket for review images
-- Create this manually in Supabase Dashboard > Storage > New Bucket
-- Name: review-images
-- Public: true

-- Storage bucket for avatars
-- Create this manually in Supabase Dashboard > Storage > New Bucket
-- Name: avatars
-- Public: true
