-- ============================================================
-- ТҮЗЕТУ: Reviews RLS саясаттары
-- Мәселе: "new row violates row-level security policy for table reviews" (403)
-- Шешім: Барлық eski саясаттарды жою + дұрыс саясаттарды қайта жасау
-- ============================================================

-- 1) is_admin() функциясы болуы керек (бұрын жасалған болуы мүмкін)
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

-- 2) Reviews кестесіндегі БАРЛЫҚ eski саясаттарды жою
DROP POLICY IF EXISTS "Public can view approved reviews" ON reviews;
DROP POLICY IF EXISTS "Anyone can insert reviews" ON reviews;
DROP POLICY IF EXISTS "Admin full access to reviews" ON reviews;
DROP POLICY IF EXISTS "Users can view own reviews" ON reviews;

-- 3) Reviews RLS міндетті түрде қосулы болуы керек
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 4) approved столбцының default мәнін тексеру
ALTER TABLE reviews ALTER COLUMN approved SET DEFAULT false;

-- 5) ЖАҢА саясаттар:

-- Кез келген адам (anon/authenticated) approved=false деп пікір қоса алады
CREATE POLICY "Anyone can insert reviews" ON reviews
  FOR INSERT
  WITH CHECK (approved = false);

-- Барлық адамдар approved пікірлерді көре алады
CREATE POLICY "Public can view approved reviews" ON reviews
  FOR SELECT
  USING (approved = true);

-- Admin барлығын көре, өзгерте, жоя алады
CREATE POLICY "Admin full access to reviews" ON reviews
  FOR ALL
  USING (public.is_admin());

-- 5) review_requests кестесін де түзету (егер қажет болса)
DROP POLICY IF EXISTS "Admin full access to review_requests" ON review_requests;
DROP POLICY IF EXISTS "Allow review request creation" ON review_requests;

ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow review request creation" ON review_requests
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admin full access to review_requests" ON review_requests
  FOR ALL
  USING (public.is_admin());

-- ============================================================
-- ✅ АЯҚТАЛДЫ!
-- Supabase Dashboard > SQL Editor-де осы SQL-ді орындаңыз:
-- 1. Supabase Dashboard-ға кіріңіз
-- 2. SQL Editor бөліміне өтіңіз
-- 3. Осы файлдың мазмұнын көшіріп, жапсырыңыз
-- 4. "Run" батырмасын басыңыз
-- ============================================================
SELECT '✅ Reviews RLS саясаттары түзетілді!' AS result;
