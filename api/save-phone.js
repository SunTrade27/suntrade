// Save customer phone to visitor_events — enables WhatsApp button in admin panel
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { visitor_id, phone } = req.body;
    if (!visitor_id || !phone) {
      return res.status(400).json({ error: 'visitor_id and phone required' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Update all visitor_events for this visitor_id that don't have a phone yet
    const { data, error } = await supabase
      .from('visitor_events')
      .update({ phone: phone })
      .eq('visitor_id', visitor_id)
      .is('phone', '');

    if (error) throw error;

    return res.status(200).json({ success: true, updated: data?.length || 0 });
  } catch (err) {
    console.error('[save-phone] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
