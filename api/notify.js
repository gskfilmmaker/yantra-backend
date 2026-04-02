// ═══════════════════════════════════════════════════
//  YANTRA NOTIFICATION BACKEND
//  Vercel Serverless Function
//  Routes: POST /api/notify
//  Powers: Telnyx WhatsApp + Resend Email
//  © GSK Productions Inc — Yantra™
// ═══════════════════════════════════════════════════

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

  const missingEnv = ['YANTRA_MASTER_KEY', 'TELNYX_API_KEY', 'TELNYX_WHATSAPP_NUMBER', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL']
    .filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    return res.status(500).json({ error: `Missing environment variables: ${missingEnv.join(', ')}` });
  }

  const yantraKey = req.headers['x-yantra-key'];
  if (!yantraKey || yantraKey !== process.env.YANTRA_MASTER_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { phone, email, title, message, type } = req.body || {};

  if (!title || !message) {
    return res.status(400).json({ error: 'title and message are required' });
  }

  if (!phone && !email) {
    return res.status(400).json({ error: 'At least one of phone or email is required' });
  }

  const results = {};
  const errors = [];

  if (phone) {
    try {
      const cleanPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
      if (!/^\+\d{7,15}$/.test(cleanPhone)) {
        errors.push('WhatsApp: Invalid phone number format (must be E.164, e.g. +14155550123)');
        results.whatsapp = 'failed';
      } else {
        const waMessage = `🌀 *Yantra — ${title}*\n\n${message}\n\n_${new Date().toLocaleString()}_\n\n— Yantra AI\nby GSK Productions Inc`;

        const telnyxRes = await fetchWithTimeout('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`
          },
          body: JSON.stringify({
            from: process.env.TELNYX_WHATSAPP_NUMBER,
            to: cleanPhone,
            type: 'whatsapp',
            text: waMessage
          })
        });

        const telnyxData = await telnyxRes.json();
        if (telnyxRes.ok) {
          results.whatsapp = 'sent';
        } else {
          errors.push(`WhatsApp: ${telnyxData.errors?.[0]?.detail || 'Failed'}`);
          results.whatsapp = 'failed';
        }
      }
    } catch (err) {
      errors.push(`WhatsApp: ${err.name === 'AbortError' ? 'Request timed out' : err.message}`);
      results.whatsapp = 'error';
    }
  }

  if (email) {
    try {
      const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="font-family:-apple-system,sans-serif;background:#f8f8f8;margin:0;padding:20px;">
        <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
          <div style="background:#0e1117;padding:24px 28px;">
            <div style="color:#a78bfa;font-size:18px;font-weight:700;">🌀 Yantra</div>
            <div style="color:#606880;font-size:11px;margin-top:2px;">by GSK Productions Inc</div>
          </div>
          <div style="padding:28px;">
            <h2 style="margin:0 0 12px;font-size:18px;color:#111;">${escape(title)}</h2>
            <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.6;">${escape(message)}</p>
            <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px;font-size:13px;color:#666;">
              <strong>Time:</strong> ${new Date().toLocaleString()}<br>
              <strong>Type:</strong> ${escape(type || 'notification')}
            </div>
          </div>
          <div style="border-top:1px solid #f0f0f0;padding:16px 28px;background:#fafafa;">
            <p style="margin:0;font-size:11px;color:#999;">Yantra™ · © 2024–2026 GSK Productions Inc. All Rights Reserved.</p>
          </div>
        </div>
      </body></html>`;

      const resendRes = await fetchWithTimeout('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL,
          to: [email],
          subject: `🌀 Yantra — ${title}`,
          html: htmlBody
        })
      });

      const resendData = await resendRes.json();
      if (resendRes.ok) {
        results.email = 'sent';
      } else {
        errors.push(`Email: ${resendData.message || 'Failed'}`);
        results.email = 'failed';
      }
    } catch (err) {
      errors.push(`Email: ${err.name === 'AbortError' ? 'Request timed out' : err.message}`);
      results.email = 'error';
    }
  }

  const sentChannels = Object.values(results);
  const allFailed = sentChannels.length > 0 && sentChannels.every(v => v === 'failed' || v === 'error');
  return res.status(allFailed ? 500 : 200).json({
    success: !allFailed,
    results,
    errors: errors.length > 0 ? errors : undefined
  });
}
