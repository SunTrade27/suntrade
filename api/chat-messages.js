// Get messages for a chat conversation
// Supports both customerId (widget) and conversationId (admin)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { customerId, conversationId } = req.query;

    if (!customerId && !conversationId) {
      return res.status(400).json({ error: 'Missing customerId or conversationId' });
    }

    // Find conversation
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
};
