// Vercel Serverless Function: Remove image background using remove.bg API
// Requires REMOVE_BG_API_KEY environment variable
// Free tier: 50 images/month at remove.bg

const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!REMOVE_BG_API_KEY) return res.status(500).json({ error: 'REMOVE_BG_API_KEY not configured' });

  try {
    const { imageUrl, imageBase64 } = req.body;
    const form = new FormData();

    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, 'base64');
      const blob = new Blob([buffer], { type: 'image/png' });
      form.append('image_file', blob, 'image.png');
    } else if (imageUrl) {
      form.append('image_url', imageUrl);
    } else {
      return res.status(400).json({ error: 'Provide imageUrl or imageBase64' });
    }

    form.append('size', 'auto');
    form.append('format', 'png');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': REMOVE_BG_API_KEY },
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'remove.bg API error: ' + errText });
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    return res.status(200).json({ success: true, imageUrl: dataUrl });
  } catch (err) {
    console.error('remove-bg error:', err);
    return res.status(500).json({ error: err.message });
  }
};
