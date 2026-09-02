// api/migrate-db.js — Auto-add missing columns to Supabase products table
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const COLUMNS = [
    { name: 'sale_price', type: 'NUMERIC' },
    { name: 'before_image', type: 'TEXT' },
    { name: 'after_image', type: 'TEXT' },
    { name: 'before_title', type: 'TEXT' },
    { name: 'before_desc', type: 'TEXT' },
  ];

  // Check which columns already exist
  const existingCols = [];
  const missingCols = [];

  for (const col of COLUMNS) {
    try {
      const { error } = await supabase
        .from('products')
        .select(col.name)
        .limit(1);
      if (error && error.message && 
          (error.message.includes("column") || error.message.includes("does not exist") || error.code === '42703')) {
        missingCols.push(col);
      } else {
        existingCols.push(col.name);
      }
    } catch (e) {
      missingCols.push(col);
    }
  }

  if (missingCols.length === 0) {
    return res.status(200).json({ 
      success: true, 
      message: 'All columns already exist!',
      existing: existingCols,
      missing: []
    });
  }

  const sqlStatements = missingCols.map(col =>
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`
  ).join('\n');

  // Method 1: Try Supabase Management API
  try {
    const projectRef = process.env.SUPABASE_URL
      .replace('https://', '')
      .split('.')[0];
    
    const sqlResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ query: sqlStatements })
    });

    if (sqlResp.ok) {
      const result = await sqlResp.json();
      // Verify columns were added
      const verified = [];
      for (const col of missingCols) {
        try {
          const { error } = await supabase.from('products').select(col.name).limit(1);
          if (!error || (!error.message?.includes("column") && error.code !== '42703')) {
            verified.push(col.name);
          }
        } catch (e) { /* still missing */ }
      }
      return res.status(200).json({
        success: verified.length > 0,
        message: verified.length > 0 
          ? `Successfully added ${verified.length} columns!` 
          : 'SQL executed but columns may not be verified yet.',
        added: verified,
        remaining: missingCols.filter(c => !verified.includes(c.name)).map(c => c.name),
        existing: existingCols
      });
    }
  } catch (e) {
    // Management API failed, continue to fallback
  }

  // Method 2: Return SQL for manual execution
  return res.status(200).json({
    success: false,
    message: 'Auto-migration not available. Please run this SQL in Supabase Dashboard → SQL Editor:',
    sql: sqlStatements,
    missing: missingCols.map(c => c.name),
    existing: existingCols,
    dashboardUrl: `https://supabase.com/dashboard/project/${process.env.SUPABASE_URL.replace('https://', '').split('.')[0]}/sql/new`
  });
};
