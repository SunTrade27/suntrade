// Customer sends a message via web chat widget
// Uses Google Gemini (FREE) for AI consultation + translation
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Get product catalog for AI context
async function getProductContext() {
  try {
    const { data: products } = await supabase
      .from('products')
      .select('name_en, name_ru, name_kz, desc_en, price, stock, categories(name_en)')
      .eq('active', true)
      .limit(30);
    if (!products || products.length === 0) return 'No products yet.';
    return products.map(p =>
      `- ${p.name_en} (${p.name_ru || ''}) — €${p.price}, stock: ${p.stock}${p.categories ? ', category: ' + p.categories.name_en : ''}`
    ).join('\n');
  } catch { return ''; }
}

// Call Google Gemini API (FREE)
async function callGemini(systemPrompt, userMessage, history) {
  const contents = [];

  // Add conversation history
  if (history && history.length > 0) {
    history.forEach(m => {
      contents.push({
        role: m.direction === 'in' ? 'user' : 'model',
        parts: [{ text: m.original_text }]
      });
    });
  }

  // Add current message
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7
        }
      })
    }
  );

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Simple Gemini call for translations
async function translateCall(systemPrompt, text) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.3 }
      })
    }
  );
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Detect language
async function detectLanguage(text) {
  const result = await translateCall(
    'Detect the language of the text. Reply ONLY with the 2-letter language code (e.g., en, ru, kz, de, fr, es, tr, zh, ar, it, pt, nl, pl, ja, ko). Nothing else.',
    text
  );
  return result.trim().toLowerCase().replace(/[^a-z]/g, '').substring(0, 2) || 'en';
}

// Translate text
async function translate(text, fromLang, toLang) {
  if (fromLang === toLang) return text;
  const langNames = {
    en: 'English', ru: 'Russian', kz: 'Kazakh', de: 'German', fr: 'French',
    es: 'Spanish', it: 'Italian', tr: 'Turkish', pt: 'Portuguese',
    nl: 'Dutch', pl: 'Polish', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean'
  };
  const fromName = langNames[fromLang] || fromLang;
  const toName = langNames[toLang] || toLang;
  return await translateCall(
    `Translate from ${fromName} to ${toName}. Reply ONLY with the translation, nothing else.`,
    text
  ) || text;
}

// AI consultant (acts as a real person, not AI)
async function getAIResponse(message, history, productContext) {
  const systemPrompt = `You are a friendly manager/consultant at SunTrade (suntrade.store) — an online store selling Chinese goods with worldwide delivery.

PRODUCT CATALOG:
${productContext}

CRITICAL RULES:
- You are a REAL PERSON, a store manager. NEVER say you are an AI, bot, or assistant.
- NEVER mention "AI", "artificial intelligence", "machine learning" or anything like that.
- Introduce yourself as a store manager/consultant if asked.
- Help customers find products, answer about prices, delivery, returns.
- Be warm, helpful, professional — like a real shop assistant.
- Keep responses SHORT (2-3 sentences max).
- ALWAYS respond in the SAME LANGUAGE as the customer's message.

WHEN TO ESCALATE TO HUMAN OPERATOR:
- Customer explicitly asks to talk to a human/manager/supervisor
- Customer has a complaint or order problem you can't solve
- Complex custom order requests
When escalating: start your message with "OPERATOR:" followed by a brief explanation for the operator (in English), then a friendly message to the customer in their language.

Delivery to Kazakhstan: 7-15 business days. Payment: Stripe (card). Returns: within 14 days.`;

  return await callGemini(systemPrompt, message, history);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { customerId, message } = req.body;
    if (!customerId || !message) {
      return res.status(400).json({ error: 'Missing customerId or message' });
    }

    // Get or create conversation
    let { data: conversation } = await supabase
      .from('wa_conversations')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('wa_conversations')
        .insert({ customer_id: customerId, status: 'ai' })
        .select()
        .single();
      conversation = newConv;
    }

    // Detect language
    const lang = await detectLanguage(message);

    // Translate to Kazakh for admin
    const translatedToKz = await translate(message, lang, 'kz');

    // Update customer language
    if (lang !== conversation.customer_lang) {
      await supabase
        .from('wa_conversations')
        .update({ customer_lang: lang })
        .eq('id', conversation.id);
    }

    // Save customer message
    await supabase.from('wa_messages').insert({
      conversation_id: conversation.id,
      direction: 'in',
      sender: 'customer',
      original_text: message,
      translated_text: translatedToKz,
      original_lang: lang
    });

    // Update last message time
    await supabase
      .from('wa_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id);

    // If human mode — don't auto-reply
    if (conversation.status === 'human') {
      return res.status(200).json({
        success: true,
        status: 'human',
        message: 'Your message has been sent. Please wait for our manager to respond.'
      });
    }

    // If closed — reopen as AI
    if (conversation.status === 'closed') {
      await supabase
        .from('wa_conversations')
        .update({ status: 'ai' })
        .eq('id', conversation.id);
    }

    // Get conversation history
    const { data: history } = await supabase
      .from('wa_messages')
      .select('direction, original_text')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(20);

    const productContext = await getProductContext();

    // Get AI response
    const aiResponse = await getAIResponse(message, history || [], productContext);

    // Check if AI wants to escalate
    if (aiResponse.startsWith('OPERATOR:')) {
      const parts = aiResponse.split('\n');
      const operatorNote = parts[0].replace('OPERATOR:', '').trim();
      const customerMsg = parts.slice(1).join('\n').trim() ||
        'I\'m connecting you with our manager. Please wait a moment.';

      await supabase.from('wa_messages').insert({
        conversation_id: conversation.id,
        direction: 'out',
        sender: 'ai',
        original_text: customerMsg,
        translated_text: `[Operator note: ${operatorNote}] ${customerMsg}`,
        original_lang: lang
      });

      await supabase
        .from('wa_conversations')
        .update({ status: 'human' })
        .eq('id', conversation.id);

      return res.status(200).json({ success: true, status: 'human', reply: customerMsg, lang });
    }

    // Save AI response
    const aiTranslatedToKz = await translate(aiResponse, lang, 'kz');

    await supabase.from('wa_messages').insert({
      conversation_id: conversation.id,
      direction: 'out',
      sender: 'ai',
      original_text: aiResponse,
      translated_text: aiTranslatedToKz,
      original_lang: lang
    });

    return res.status(200).json({ success: true, status: 'ai', reply: aiResponse, lang });

  } catch (err) {
    console.error('Chat message error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
