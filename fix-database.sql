-- ===== FIX 1: Create profiles table (if not exists) =====
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

-- Policies (use DO block to avoid "already exists" errors)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own profile' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own profile' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can delete own profile" ON profiles FOR DELETE USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow profile creation on signup' AND tablename = 'profiles') THEN
    CREATE POLICY "Allow profile creation on signup" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin can view all profiles' AND tablename = 'profiles') THEN
    CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    );
  END IF;
END $$;

-- Auto-create profile on signup trigger
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===== FIX 2: Add Beauty category (if not exists) =====
INSERT INTO categories (name_en, name_kz, name_ru, name_de, name_fr, name_es, name_it, name_tr, slug, icon)
VALUES ('Beauty', 'Сұлулық', 'Красота', 'Schönheit', 'Beauté', 'Bellezza', 'Güzellik', 'Güzellik', 'beauty', 'sparkle')
ON CONFLICT (slug) DO UPDATE SET
  name_kz = 'Сұлулық',
  name_ru = 'Красота',
  icon = 'sparkle';


-- ===== FIX 3: Chat tables for AI consultant =====
CREATE TABLE IF NOT EXISTS wa_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'ai' CHECK (status IN ('ai', 'human', 'closed')),
  customer_lang TEXT DEFAULT 'en',
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES wa_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  sender TEXT DEFAULT 'customer' CHECK (sender IN ('customer', 'ai', 'admin')),
  original_text TEXT NOT NULL,
  translated_text TEXT,
  original_lang TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_conv ON wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_customer ON wa_conversations(customer_id);

-- RLS (API uses service key, so these are permissive)
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service can manage wa_conversations' AND tablename = 'wa_conversations') THEN
    CREATE POLICY "Service can manage wa_conversations" ON wa_conversations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service can manage wa_messages' AND tablename = 'wa_messages') THEN
    CREATE POLICY "Service can manage wa_messages" ON wa_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ===== FIX 4: Backfill profiles for existing users =====
INSERT INTO public.profiles (id, email, is_admin)
SELECT
  au.id,
  au.email,
  CASE WHEN au.email IN ('serjanyelemesov@gmail.com', 'sundetofficial@gmail.com') THEN true ELSE false END
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
