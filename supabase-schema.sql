-- SunTrade Database Schema for Supabase
-- Run this in Supabase SQL Editor

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
  icon TEXT DEFAULT '📦',
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

-- Policies: Authenticated admin can do everything
CREATE POLICY "Admin full access to products" ON products
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Admin full access to categories" ON categories
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Admin full access to orders" ON orders
  FOR ALL USING (auth.role() = 'authenticated');

-- Allow webhook to insert orders
CREATE POLICY "Allow order creation" ON orders
  FOR INSERT WITH CHECK (true);

-- Insert sample categories
INSERT INTO categories (name_en, name_kz, name_ru, name_de, name_fr, name_es, name_it, name_tr, slug, icon) VALUES
  ('Electronics', 'Электроника', 'Электроника', 'Elektronik', 'Électronique', 'Electrónica', 'Elettronica', 'Elektronik', 'electronics', '📱'),
  ('Fashion', 'Сән', 'Мода', 'Mode', 'Mode', 'Moda', 'Moda', 'Moda', 'fashion', '👗'),
  ('Home & Garden', 'Үй және бақша', 'Дом и сад', 'Haus & Garten', 'Maison & Jardin', 'Hogar y Jardín', 'Casa e Giardino', 'Ev & Bahçe', 'home-garden', '🏠'),
  ('Sports', 'Спорт', 'Спорт', 'Sport', 'Sport', 'Deportes', 'Sport', 'Spor', 'sports', '⚽'),
  ('Toys', 'Ойыншықтар', 'Игрушки', 'Spielzeug', 'Jouets', 'Juguetesi', 'Giochi', 'Oyuncaklar', 'toys', '🧸'),
  ('Beauty', 'Сұлулық', 'Красота', 'Schönheit', 'Beauté', 'Bellezza', 'Bellezza', 'Güzellik', 'beauty', '💄'),
  ('Automotive', 'Автомобиль', 'Автомобили', 'Auto', 'Auto', 'Automóvil', 'Auto', 'Otomotiv', 'automotive', '🚗'),
  ('Tools', 'Құралдар', 'Инструменты', 'Werkzeuge', 'Outils', 'Herramientas', 'Attrezzi', 'Aletler', 'tools', '🔧');

-- Storage bucket for product images
-- Create this manually in Supabase Dashboard > Storage > New Bucket
-- Name: product-images
-- Public: true
