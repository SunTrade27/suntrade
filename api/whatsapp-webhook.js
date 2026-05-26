// WhatsApp Webhook - Twilio incoming message handler
// Uses OpenAI for AI consultation + auto-translation
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM; // whatsapp:+14155238886

const SITE_URL = process.env.SITE_URL || 'https://www.suntrade.store';

// SunTrade product catalog context for AI
async function getProductContext() {
  try {
    const { data: products } = await supabase
      .from('products')
      .select('name_en, name_ru, name_kz, desc_en, price, stock, categories(name_en)')
      .eq('active', true)
      .limit(30);
    if (!products || products.length === 0) return 'No products in catalog yet.';
    return products.map(p =>
      `- ${p.name_en} (${p.name_ru || ''}) — €${p.price}, stock: ${p.stock}${p.categories ? ', category: ' + p.categories.name_en : ''}`
    ).join('\n');
  } catch { return ''; }
}

// Call OpenAI
async function callOpenAI(messages) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.7
    })
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// Detect language and translate to Kazakh
async function detectAndTranslate(text) {
  const result = await callOpenAI([
    { role: 'system', content: 'Detect the language of the text and translate it to Kazakh. Reply ONLY in JSON format: {"lang":"<detected_lang_code>","translated":"<kazakh_translation>"}' },
    { role: 'user', content: text }
  ]);
  try {
    return JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
  } catch {
    return { lang: 'en', translated: text };
  }
}

// Translate from Kazakh to target language
async function translateFromKazakh(text, targetLang) {
  if (targetLang === 'kz') return text;
  const result = await callOpenAI([
    { role: 'system', content: `Translate the following Kazakh text to ${targetLang}. Reply ONLY with the translation, nothing else.` },
    { role: 'user', content: text }
  ]);
  return result || text;
}

// AI consultant response
async function getAIResponse(customerMessage, conversationHistory, customerLang) {
  const productContext = await getProductContext();
  const historyMessages = conversationHistory.map(m => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: m.original_text
  }));

  const systemPrompt = `You are a friendly AI consultant for SunTrade (suntrade.store) — an online store selling Chinese goods with delivery worldwide.

PRODUCT CATALOG:
${productContext}

YOUR ROLE:
- Help customers find products, answer questions about prices, delivery, returns
- Be warm, helpful, and professional
- If you can't answer or the customer wants to talk to a human, say: "OPERATOR_REQUEST" at the start of your message
- Keep responses concise (2-3 sentences max)
- Always respond in the SAME LANGUAGE as the customer's message

IMPORTANT:
- For order issues, complex complaints, or when customer insists → include "OPERATOR_REQUEST"
- Delivery to Kazakhstan typically takes 7-15 business days
- Payment via Stripe (card payments)
- Returns within 14 days`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages.slice(-10),
    { role: 'user', content: customerMessage }
  ];

  return await callOpenAI(messages);
}

// Send WhatsApp message via Twilio
async function sendWhatsApp(to, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams();
  params.append('From', TWILIO_FROM);
  params.append('To', `whatsapp:${to}`);
  params.append('Body', body);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  return resp.ok;
}

// Parse form-encoded body (Twilio sends x-www-form-urlencoded)
function parseFormBody(rawBody) {
  if (typeof rawBody === 'object') return rawBody;
  const params = new URLSearchParams(rawBody);
  const result = {};
  for (const [key, value] of params) result[key] = value;
  return result;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    // Parse Twilio webhook body
    const body = parseFormBody(req.body);
    const from = body.From?.replace('whatsapp:', '') || '';
    const messageText = body.Body || '';
    const profileName = body.ProfileName || '';

    if (!from || !messageText) {
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Get or create conversation
    let { data: conversation } = await supabase
      .from('wa_conversations')
      .select('*')
      .eq('phone', from)
      .single();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('wa_conversations')
        .insert({ phone: from, customer_name: profileName, status: 'ai' })
        .select()
        .single();
      conversation = newConv;
    }

    // Detect language and translate to Kazakh
    const { lang, translated } = await detectAndTranslate(messageText);

    // Update customer language
    if (lang !== conversation.customer_lang) {
      await supabase
        .from('wa_conversations')
        .update({ customer_lang: lang })
        .eq('id', conversation.id);
    }

    // Save incoming message
    await supabase.from('wa_messages').insert({
      conversation_id: conversation.id,
      direction: 'in',
      sender: 'customer',
      original_text: messageText,
      translated_text: translated,
      original_lang: lang
    });

    // Update last message time
    await supabase
      .from('wa_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id);

    // If human operator mode — don't auto-reply
    if (conversation.status === 'human') {
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Get conversation history for AI
    const { data: history } = await supabase
      .from('wa_messages')
      .select('direction, original_text')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(20);

    // Get AI response
    const aiResponse = await getAIResponse(messageText, history || [], lang);

    // Check if AI wants to transfer to operator
    if (aiResponse.includes('OPERATOR_REQUEST')) {
      const cleanResponse = aiResponse.replace('OPERATOR_REQUEST', '').trim();
      const fallbackMsg = cleanResponse || 'I\'m connecting you with our manager who will help you shortly. Please wait a moment.';

      // AI already responds in customer language, so just use it directly
      await sendWhatsApp(from, fallbackMsg);

      // Save AI message
      await supabase.from('wa_messages').insert({
        conversation_id: conversation.id,
        direction: 'out',
        sender: 'ai',
        original_text: fallbackMsg,
        translated_text: fallbackMsg,
        original_lang: lang
      });

      // Switch to human mode
      await supabase
        .from('wa_conversations')
        .update({ status: 'human' })
        .eq('id', conversation.id);

      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // AI responds in customer language already
    const finalResponse = aiResponse;

    // Send response
    await sendWhatsApp(from, finalResponse);

    // Save AI message
    await supabase.from('wa_messages').insert({
      conversation_id: conversation.id,
      direction: 'out',
      sender: 'ai',
      original_text: aiResponse,
      translated_text: finalResponse,
      original_lang: lang
    });

    // Twilio expects TwiML response
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
};
