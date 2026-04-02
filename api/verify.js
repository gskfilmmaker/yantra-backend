// ═══════════════════════════════════════════════════
//  YANTRA VERIFY ENDPOINT
//  Sends a test message to confirm phone/email works
//  POST /api/verify
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

  const { phone, email } = req.body || {};
  const results = {};
  const errors = [];

  if (phone) {
    try {
      const cleanPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
      if (!/^\+\d{7,15}$/.test(cleanPhone)) {
        errors.push('WhatsApp: Invalid phone number format (must be E.164, e.g. +14155550123)');
        results.whatsapp = 'failed';
      } else {
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
            text: `🌀 *Yantra Verified!*\n\nYour WhatsApp notifications are now active.\n\nYou will receive updates here whenever Yantra completes a task.\n\n— Yantra AI by GSK Productions Inc`
          })
        });
        if (telnyxRes.ok) {
          results.whatsapp = 'verified';
        } else {
          const telnyxData = await telnyxRes.json();
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
      const resendRes = await fetchWithTimeout('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL,
          to: [email],
          subject: '🌀 Yantra — Notifications Activated',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              <h2 style="color:#7c6fef;">🌀 Yantra Notifications Active!</h2>
              <p>Your email notifications are confirmed and working.</p>
              <p>You will receive updates at <strong>${escape(email)}</strong> whenever Yantra completes a task.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
              <p style="font-size:12px;color:#999;">Yantra™ by GSK Productions Inc · © 2024–2026 All Rights Reserved</p>
            </div>
          `
        })
      });
      if (resendRes.ok) {
        results.email = 'verified';
      } else {
        const resendData = await resendRes.json();
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
