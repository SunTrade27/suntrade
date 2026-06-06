-- ============================================================
-- ТҮЗЕТУ: Тапсырыстар user_id бойынша байланыстыру + RLS
-- Мәселе: "Менің тапсырыстарым" бос көрінеді, себебі:
--   1) orders кестесінде user_id жоқ
--   2) RLS тек customer_email бойынша сәйкестендіреді
-- Шешім: user_id бағанын қосу, RLS-ті user_id + email бойынша жаңарту
-- ============================================================

-- 1) orders кестесіне user_id бағанын қосу
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2) orders кестесіне locale бағанын қосу (email тілін анықтау үшін)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_locale ON orders(locale);

-- 3) order_items кестесіне де user_id қосу (RLS-ті оңайлату үшін)
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_user_id ON order_items(user_id);

-- 4) Бар RLS саясаттарын тазалау
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can view own order items" ON order_items;

-- 5) ЖАҢА саясат: user_id немесе customer_email бойынша көру
-- (аутентификацияланған пайдаланушы өзінің user_id-мен немесе email-мен тапсырысты көре алады)
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (
    -- Логин арқылы тапсырыс берілген
    user_id = auth.uid()
    -- Немесе email сәйкес келеді (guest тапсырыс)
    OR customer_email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

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

-- 6) Қауіпсіздік: INSERT/UPDATE тек service_role (webhook) арқылы
DROP POLICY IF EXISTS "Allow order creation" ON orders;
DROP POLICY IF EXISTS "Allow order_items creation" ON order_items;

-- Webhook service_key-мен жұмыс істейтіндіктен, anon-ға INSERT ашпаймыз
-- Бірақ RLS bypass үшін service_role key қолданылады (API кодта)

-- 7) Бұрынғы тапсырыстарды email бойынша user_id-мен байланыстыру
-- (егер клиент email-мен тіркелген болса, бұрынғы тапсырыстары да көрінеді)
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
-- ✅ АЯҚТАЛДЫ!
-- Supabase SQL Editor-де осы файлды орындаңыз.
-- Орындалғаннан кейін:
--   • Логин арқылы тапсырыс берген клиенттер — тапсырыстары "Менің тапсырыстарым" бөлімінде көрінеді
--   • Email сәйкес келетін бұрынғы тапсырыстар да көрінеді
-- ============================================================
SELECT '✅ Orders RLS + user_id түзетілді!' AS result;
