// Toggle conversation status (ai/human/closed)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
};
