// ═══════════════════════════════════════════════════
//  YANTRA — WhatsApp via CallMeBot (Free)
//  POST /api/whatsapp
//  © GSK Productions Inc — Yantra™
// ═══════════════════════════════════════════════════

async function fetchWithTimeout(url, options, ms = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-yantra-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const yantraKey = req.headers['x-yantra-key'];
  if (!yantraKey || yantraKey !== process.env.YANTRA_MASTER_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const { phone, message, title } = body;

  // Use custom phone or fall back to owner's number from env
  const targetPhone = phone || process.env.CMB_PHONE;
  const apiKey = process.env.CMB_APIKEY;

  if (!targetPhone || !apiKey) {
    return res.status(500).json({ error: 'CallMeBot not configured' });
  }

  if (!message && !title) {
    return res.status(400).json({ error: 'message or title required' });
  }

  const fullMessage = title
    ? `🌀 Yantra — ${title}\n\n${message || ''}\n\n${new Date().toLocaleString()}\n— GSK Productions Inc`
    : message;

  try {
    const encoded = encodeURIComponent(fullMessage);
    // Remove non-digits from phone for CallMeBot
    const cleanPhone = targetPhone.replace(/[^\d]/g, '');
    const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encoded}&apikey=${apiKey}`;

    const response = await fetchWithTimeout(url, {}, 10000);

    if (response.ok) {
      return res.status(200).json({ success: true, channel: 'callmebot' });
    } else {
      const text = await response.text();
      return res.status(500).json({ success: false, error: text });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.name === 'AbortError' ? 'Request timed out' : err.message
    });
  }
}
