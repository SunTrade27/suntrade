// ============================================================
// БІРІКТІРІЛГЕН ЧАТ API
// /api/chat?action=list      — чат тізімін алу (admin)
// /api/chat?action=messages  — хабарламаларды алу
// /api/chat?action=message   — клиент хабарлама жіберу (AI)
// /api/chat?action=send      — admin жауап жіберу
// /api/chat?action=toggle    — чат статусын өзгерту (ai/human/closed)
// ============================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// ============================================================
// ORTAK ФУНКЦИЯЛАР
// ============================================================
async function translate(text, fromLang, toLang) {
  if (fromLang === toLang) return text;
  if (!GEMINI_KEY) return text;
  const langNames = {
    en: 'English', ru: 'Russian', kz: 'Kazakh', de: 'German', fr: 'French',
    es: 'Spanish', it: 'Italian', tr: 'Turkish', pt: 'Portuguese',
    nl: 'Dutch', pl: 'Polish', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean'
  };
  const fromName = langNames[fromLang] || fromLang;
  const toName = langNames[toLang] || toLang;
  try {
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
  } catch (e) {
    console.error('Translate error:', e);
    return text;
  }
}

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

async function callGemini(systemPrompt, userMessage, history) {
  const contents = [];
  if (history && history.length > 0) {
    history.forEach(m => {
      contents.push({
        role: m.direction === 'in' ? 'user' : 'model',
        parts: [{ text: m.original_text }]
      });
    });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
        })
      }
    );

    // Rate limit / quota check
    if (resp.status === 429 || resp.status === 503) {
      console.error('Gemini rate limited:', resp.status);
      return { text: '', rateLimited: true };
    }

    const data = await resp.json();

    if (data.error) {
      console.error('Gemini API error:', data.error);
      const isQuota = data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED';
      return { text: '', rateLimited: isQuota };
    }

    // Safety block / no candidates
    if (!data.candidates || data.candidates.length === 0) {
      console.error('Gemini no candidates:', data);
      return { text: '', rateLimited: false };
    }

    const text = data.candidates[0]?.content?.parts?.[0]?.text || '';
    return { text, rateLimited: false };
  } catch (e) {
    console.error('Gemini error:', e);
    return { text: '', rateLimited: false };
  }
}

async function detectLanguage(text) {
  if (!GEMINI_KEY) return 'en';
  const result = await callGemini(
    'Detect the language of the text. Reply ONLY with the 2-letter language code (e.g., en, ru, kz, de, fr, es, tr, zh, ar, it, pt, nl, pl, ja, ko). Nothing else.',
    text,
    []
  );
  return (result.text || '').trim().toLowerCase().replace(/[^a-z]/g, '').substring(0, 2) || 'en';
}

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

  const result = await callGemini(systemPrompt, message, history);
  return result.text;
}

// ============================================================
// ACTION: list — чат тізімі (admin үшін)
// ============================================================
async function handleList(req, res) {
  try {
    const { data: conversations, error } = await supabase
      .from('wa_conversations')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    const result = [];
    for (const conv of conversations || []) {
      const { data: lastMsg } = await supabase
        .from('wa_messages')
        .select('original_text, sender, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const { count } = await supabase
        .from('wa_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('direction', 'in')
        .gt('created_at', lastMsg?.sender !== 'customer' ? lastMsg?.created_at || conv.created_at : conv.created_at);

      result.push({
        ...conv,
        last_message: lastMsg?.original_text || '',
        last_message_sender: lastMsg?.sender || '',
        unread: count || 0
      });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('Chat list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================
// ACTION: messages — хабарламаларды алу
// ============================================================
async function handleMessages(req, res) {
  try {
    const { customerId, conversationId } = req.query;
    if (!customerId && !conversationId) {
      return res.status(400).json({ error: 'Missing customerId or conversationId' });
    }

    let conversation;
    if (conversationId) {
      const { data } = await supabase
        .from('wa_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();
      conversation = data;
    } else {
      const { data } = await supabase
        .from('wa_conversations')
        .select('*')
        .eq('customer_id', customerId)
        .single();
      conversation = data;
    }

    if (!conversation) {
      return res.status(200).json({ conversation: null, messages: [] });
    }

    const { data: messages, error } = await supabase
      .from('wa_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return res.status(200).json({ conversation, messages: messages || [] });
  } catch (err) {
    console.error('Chat messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================
// ACTION: message — клиент хабарлама жібереді (AI жауап береді)
// ============================================================
async function handleMessage(req, res) {
  try {
    const { customerId, message } = req.body;
    if (!customerId || !message) {
      return res.status(400).json({ error: 'Missing customerId or message' });
    }

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

    const lang = await detectLanguage(message);
    const translatedToKz = await translate(message, lang, 'kz');

    if (lang !== conversation.customer_lang) {
      await supabase
        .from('wa_conversations')
        .update({ customer_lang: lang })
        .eq('id', conversation.id);
    }

    await supabase.from('wa_messages').insert({
      conversation_id: conversation.id,
      direction: 'in',
      sender: 'customer',
      original_text: message,
      translated_text: translatedToKz,
      original_lang: lang
    });

    await supabase
      .from('wa_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id);

    if (conversation.status === 'human') {
      return res.status(200).json({
        success: true,
        status: 'human',
        message: 'Your message has been sent. Please wait for our manager to respond.'
      });
    }

    if (conversation.status === 'closed') {
      await supabase
        .from('wa_conversations')
        .update({ status: 'ai' })
        .eq('id', conversation.id);
    }

    const { data: history } = await supabase
      .from('wa_messages')
      .select('direction, original_text')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(20);

    const productContext = await getProductContext();
    const aiResult = await callGemini(
      `You are a friendly manager/consultant at SunTrade (suntrade.store) — an online store selling Chinese goods with worldwide delivery.

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

Delivery to Kazakhstan: 7-15 business days. Payment: Stripe (card). Returns: within 14 days.`,
      message,
      history || []
    );

    const aiResponse = aiResult.text;

    // AI unavailable (rate limit, safety block, network) → WhatsApp fallback
    if (!aiResponse || !aiResponse.trim()) {
      const fallbackTexts = {
        kz: 'Кешіріңіз, чат-бот уақытша қолжетімсіз (лимит таусылған болуы мүмкін). WhatsApp-қа жазыңыз:',
        ru: 'Извините, чат-бот временно недоступен (возможно, лимит исчерпан). Напишите в WhatsApp:',
        en: 'Sorry, the chat bot is temporarily unavailable (limit may be reached). Please contact via WhatsApp:',
        de: 'Entschuldigung, der Chat-Bot ist vorübergehend nicht verfügbar (Limit möglicherweise erreicht). Bitte kontaktieren Sie uns per WhatsApp:',
        fr: 'Désolé, le chat bot est temporairement indisponible (limite peut-être atteinte). Contactez-nous sur WhatsApp :',
        es: 'Disculpe, el chat bot no está disponible temporalmente (límite posiblemente alcanzado). Contacte por WhatsApp:',
        tr: 'Üzgünüz, sohbet botu şu anda kullanılamıyor (limit dolmuş olabilir). Lütfen WhatsApp ile iletişime geçin:',
        it: 'Spiacenti, il chat bot è temporaneamente non disponibile (limite potrebbe essere raggiunto). Contattaci su WhatsApp:',
        pt: 'Desculpe, o chat bot está temporariamente indisponível (limite possivelmente atingido). Contate via WhatsApp:',
        nl: 'Sorry, de chatbot is tijdelijk niet beschikbaar (limiet mogelijk bereikt). Neem contact op via WhatsApp:',
        pl: 'Przepraszamy, chatbot jest tymczasowo niedostępny (limit mógł zostać osiągnięty). Skontaktuj się przez WhatsApp:',
        ar: 'عذرًا، روبوت الدردشة غير متاح مؤقتًا (ربما تم الوصول إلى الحد). يرجى التواصل عبر WhatsApp:',
        zh: '抱歉，聊天机器人暂时不可用（可能已达限额）。请通过 WhatsApp 联系：',
        ja: '申し訳ありませんが、チャットボットは一時的に利用できません（上限に達した可能性があります）。WhatsAppでお問い合わせください：',
        ko: '죄송합니다. 챗봇을 일시적으로 사용할 수 없습니다(한도 도달 가능). WhatsApp으로 문의하세요:'
      };
      const fallbackText = fallbackTexts[lang] || fallbackTexts.en;

      await supabase.from('wa_messages').insert({
        conversation_id: conversation.id,
        direction: 'out',
        sender: 'ai',
        original_text: fallbackText,
        original_lang: lang
      });

      return res.status(200).json({
        success: true,
        status: 'fallback',
        reply: fallbackText,
        fallback: true,
        whatsapp: '77021379248',
        lang
      });
    }

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
}

// ============================================================
// ACTION: send — admin жауап жібереді
// ============================================================
async function handleSend(req, res) {
  try {
    const { conversationId, message } = req.body;
    if (!conversationId || !message) {
      return res.status(400).json({ error: 'Missing conversationId or message' });
    }

    const { data: conversation } = await supabase
      .from('wa_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const translated = await translate(message, 'kz', conversation.customer_lang);

    await supabase.from('wa_messages').insert({
      conversation_id: conversationId,
      direction: 'out',
      sender: 'admin',
      original_text: message,
      translated_text: translated,
      original_lang: conversation.customer_lang
    });

    await supabase
      .from('wa_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return res.status(200).json({ success: true, translated });
  } catch (err) {
    console.error('Chat send error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================
// ACTION: toggle — чат статусын өзгерту
// ============================================================
async function handleToggle(req, res) {
  try {
    const { conversationId, status } = req.body;
    if (!conversationId || !['ai', 'human', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const { error } = await supabase
      .from('wa_conversations')
      .update({ status })
      .eq('id', conversationId);

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Chat toggle error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================
// MAIN ROUTER
// ============================================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // action параметрін алу (GET — query, POST — body)
  let action;
  if (req.method === 'GET') {
    action = req.query.action;
  } else {
    // POST үшін body-ден алу
    try {
      const body = req.body || {};
      action = body.action;
    } catch (e) {}
    // POST body-де action жоқ болса, request-тен іздеу (URL-де де болуы мүмкін)
    if (!action && req.url) {
      try {
        const url = new URL(req.url, 'http://localhost');
        action = url.searchParams.get('action');
      } catch (e) {}
    }
  }

  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter. Use ?action=list|messages|message|send|toggle' });
  }

  // Action-ға байланысты handler шақыру
  switch (action) {
    case 'list':
      if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });
      return handleList(req, res);
    case 'messages':
      if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });
      return handleMessages(req, res);
    case 'message':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
      return handleMessage(req, res);
    case 'send':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
      return handleSend(req, res);
    case 'toggle':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
      return handleToggle(req, res);
    default:
      return res.status(400).json({ error: 'Unknown action: ' + action });
  }
};
