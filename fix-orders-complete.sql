-- ============================================================
-- ТОЛЫҚ ТҮЗЕТУ: orders және order_items кестелері
-- Мәселе: "Менің тапсырыстарым" бос, save-order API INSERT қателігі
-- Себеп: orders кестесінде user_id/locale бағандары жоқ, RLS шектеулі
-- Шешім: осы файлды Supabase SQL Editor-де БІР РЕТ орындаңыз
-- ============================================================

-- ============================================================
-- 1) orders кестесіне БАРЛЫҚ қажетті бағандарды қосу
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address_line1 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address_line2 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_postal_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_country TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================================
-- 2) order_items кестесіне user_id бағанын қосу
-- ============================================================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 3) Индекстер (тез іздеу үшін)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_locale ON orders(locale);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_order_items_user_id ON order_items(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ============================================================
-- 4) Status check constraint (барлық статустар)
-- ============================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'accepted', 'packing', 'shipped', 'delivered', 'cancelled'));

-- ============================================================
-- 5) orders RLS — толық қайта жасау
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Allow order creation" ON orders;
DROP POLICY IF EXISTS "Admin full access to orders" ON orders;
DROP POLICY IF EXISTS "Service role bypass orders" ON orders;

-- Админ: барлық тапсырысты көре алады
CREATE POLICY "Admin full access to orders" ON orders
  FOR ALL USING (public.is_admin());

-- Service role (webhook + save-order API) — RLS bypass
-- Бірақ service_role key-мен жұмыс істейтін API-ге RLS қолданылмайды,
-- сондықтан бұл қосымша INSERT/UPDATE/DELETE рұқсаты
CREATE POLICY "Service role can do anything" ON orders
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Қолданушы: тек өзінің тапсырысын көреді (user_id немесе email бойынша)
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (
    user_id = auth.uid()
    OR customer_email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

-- Қолданушы өзі жасай алады (егер бір себептен API жұмыс істемесе)
CREATE POLICY "Users can create own orders" ON orders
  FOR INSERT WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- ============================================================
-- 6) order_items RLS — толық қайта жасау
-- ============================================================
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own order items" ON order_items;
DROP POLICY IF EXISTS "Allow order_items creation" ON order_items;
DROP POLICY IF EXISTS "Admin full access to order_items" ON order_items;
DROP POLICY IF EXISTS "Service role bypass order_items" ON order_items;

-- Админ: барлығын көреді
CREATE POLICY "Admin full access to order_items" ON order_items
  FOR ALL USING (public.is_admin());

-- Service role: барлығын жасай алады
CREATE POLICY "Service role can do anything" ON order_items
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Қолданушы: тек өзінің order_items-тарын көреді
CREATE POLICY "Users can view own order items" ON order_items
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (
        orders.user_id = auth.uid()
        OR orders.customer_email = (SELECT email FROM profiles WHERE id = auth.uid())
      )
    )
  );

-- ============================================================
-- 7) Бұрынғы тапсырыстарды email бойынша user_id-мен байланыстыру
-- ============================================================
UPDATE orders o
SET user_id = p.id
FROM profiles p
WHERE o.user_id IS NULL
  AND p.email IS NOT NULL
  AND LOWER(o.customer_email) = LOWER(p.email);

UPDATE order_items oi
SET user_id = o.user_id
FROM orders o
WHERE oi.user_id IS NULL
  AND oi.order_id = o.id
  AND o.user_id IS NOT NULL;

-- ============================================================
-- 8) Orders кестесінің құрылымын көрсету (тексеру үшін)
-- ============================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================
-- ✅ АЯҚТАЛДЫ!
-- Осы файлды Supabase SQL Editor-де RUN басыңыз.
-- Кейін test-save-order.html арқылы тексеріңіз.
-- ============================================================
SELECT '✅ Orders толық түзетілді! user_id + locale + RLS + service_role қосылды' AS result;
