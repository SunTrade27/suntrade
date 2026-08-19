// Visitor Count API - Vercel Serverless Function
// Returns the number of unique visitors from the last N months.
// Uses service role key to bypass RLS.

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[visitor-count] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return res.status(500).json({ error: 'Server config missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Default: last 2 months
    const months = parseInt(req.query.months) || 2;
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const { data, error } = await supabase
      .from('visitor_events')
      .select('visitor_id')
      .eq('event_type', 'page_view')
      .gte('created_at', since.toISOString());

    if (error) {
      console.error('[visitor-count] Query error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Count unique visitor_ids
    const uniqueVisitors = new Set((data || []).map(r => r.visitor_id));

    return res.status(200).json({
      count: uniqueVisitors.size,
      months: months,
      since: since.toISOString()
    });
  } catch (err) {
    console.error('[visitor-count] Error:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
