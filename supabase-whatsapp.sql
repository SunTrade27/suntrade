-- Web Chat System Tables
-- Run this in Supabase SQL Editor

-- Chat conversations
CREATE TABLE IF NOT EXISTS wa_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  customer_lang TEXT DEFAULT 'en',
  status TEXT DEFAULT 'ai' CHECK (status IN ('ai', 'human', 'closed')),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_conv_customer ON wa_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON wa_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON wa_messages(created_at DESC);

-- RLS
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access to wa_conversations" ON wa_conversations
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Admin full access to wa_messages" ON wa_messages
  FOR ALL USING (auth.role() = 'authenticated');

-- Allow public insert/select for chat widget (customer side)
CREATE POLICY "Public can manage own conversation" ON wa_conversations
  FOR ALL WITH CHECK (true);

CREATE POLICY "Public can manage own messages" ON wa_messages
  FOR ALL WITH CHECK (true);
