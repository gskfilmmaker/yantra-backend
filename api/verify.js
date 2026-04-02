// ═══════════════════════════════════════════════════
//  YANTRA VERIFY ENDPOINT
//  Sends a test message to confirm phone/email works
//  POST /api/verify
//  © GSK Productions Inc — Yantra™
// ═══════════════════════════════════════════════════

// Fix #2: HTML escape to prevent XSS
const escape = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#x27;');

// Fix #9: Fetch with timeout
async function fetchWithTimeout(url, options, ms = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Fix #10: E.164 phone validation
function validatePhone(phone) {
  const clean = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
  if (!/^\+\d{7,15}$/.test(clean)) return null;
  return clean;
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

  // Fix #7: Validate env vars
  const missingEnv = [];
  if (!process.env.TELNYX_API_KEY) missingEnv.push('TELNYX_API_KEY');
  if (!process.env.TELNYX_FROM_NUMBER) missingEnv.push('TELNYX_WHATSAPP_NUMBER');
  if (!process.env.RESEND_API_KEY) missingEnv.push('RESEND_API_KEY');
  if (!process.env.RESEND_FROM_EMAIL) missingEnv.push('RESEND_FROM_EMAIL');
  if (missingEnv.length > 0) {
    return res.status(500).json({ error: `Missing env vars: ${missingEnv.join(', ')}` });
  }

  // Fix #6: Safe body destructure
  const body = req.body || {};
  const { phone, email } = body;

  if (!phone && !email) {
    return res.status(400).json({ error: 'At least one of phone or email is required' });
  }

  const results = {};
  const errors = [];

  // ── VERIFY WHATSAPP ─────────────────────────────
  if (phone) {
    // Fix #10: Validate phone
    const cleanPhone = validatePhone(phone);
    if (!cleanPhone) {
      errors.push('WhatsApp: Invalid phone number format (must be E.164 e.g. +16478613970)');
      results.whatsapp = 'failed';
    } else {
      try {
        // Fix #9: Timeout fetch
        const telnyxRes = await fetchWithTimeout('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`
          },
          body: JSON.stringify({
            from: process.env.TELNYX_FROM_NUMBER,
            to: cleanPhone,
            type: 'whatsapp',
            text: `🌀 *Yantra Verified!*\n\nYour WhatsApp notifications are now active.\n\nYou will receive updates here whenever Yantra completes a task.\n\n— Yantra AI by GSK Productions Inc`
          })
        });

        // Fix #8: Extract Telnyx error details
        if (telnyxRes.ok) {
          results.whatsapp = 'verified';
        } else {
          const telnyxData = await telnyxRes.json();
          const detail = telnyxData.errors?.[0]?.detail || 'Unknown error';
          errors.push(`WhatsApp: ${detail}`);
          results.whatsapp = 'failed';
        }
      } catch (err) {
        errors.push(`WhatsApp: ${err.name === 'AbortError' ? 'Request timed out' : err.message}`);
        results.whatsapp = 'error';
      }
    }
  }

  // ── VERIFY EMAIL ────────────────────────────────
  if (email) {
    try {
      // Fix #2: Escape email before inserting into HTML
      const safeEmail = escape(email);

      // Fix #9: Timeout fetch
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
              <p>You will receive updates at <strong>${safeEmail}</strong> whenever Yantra completes a task.</p>
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

  // Fix #5: Return proper success/failure based on results
  const attempted = Object.values(results);
  const allFailed = attempted.length > 0 && attempted.every(v => v === 'failed' || v === 'error');

  return res.status(allFailed ? 500 : 200).json({
    success: !allFailed,
    results,
    errors: errors.length > 0 ? errors : undefined
  });
}
