// Get WhatsApp conversations list for admin
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
    const { data: conversations, error } = await supabase
      .from('wa_conversations')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    // Get last message for each conversation
    const result = [];
    for (const conv of conversations || []) {
      const { data: lastMsg } = await supabase
        .from('wa_messages')
        .select('original_text, sender, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Count unread (customer messages after last admin/ai reply)
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
};
