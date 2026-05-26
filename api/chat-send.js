// Admin sends reply to customer
// Translates from Kazakh to customer's language using Gemini (FREE)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function translate(text, fromLang, toLang) {
  if (fromLang === toLang) return text;
  const langNames = {
    en: 'English', ru: 'Russian', kz: 'Kazakh', de: 'German', fr: 'French',
    es: 'Spanish', it: 'Italian', tr: 'Turkish', pt: 'Portuguese',
    nl: 'Dutch', pl: 'Polish', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean'
  };
  const fromName = langNames[fromLang] || fromLang;
  const toName = langNames[toLang] || toLang;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `Translate from ${fromName} to ${toName}. Reply ONLY with the translation, nothing else.` }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.3 }
      })
    }
  );
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || text;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { conversationId, message } = req.body;
    if (!conversationId || !message) {
      return res.status(400).json({ error: 'Missing conversationId or message' });
    }

    // Get conversation
    const { data: conversation } = await supabase
      .from('wa_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Translate admin's Kazakh message to customer's language
    const translated = await translate(message, 'kz', conversation.customer_lang);

    // Save message
    await supabase.from('wa_messages').insert({
      conversation_id: conversationId,
      direction: 'out',
      sender: 'admin',
      original_text: message,
      translated_text: translated,
      original_lang: conversation.customer_lang
    });

    // Update last message time
    await supabase
      .from('wa_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return res.status(200).json({ success: true, translated });

  } catch (err) {
    console.error('Chat send error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
