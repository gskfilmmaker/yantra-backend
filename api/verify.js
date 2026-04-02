// ═══════════════════════════════════════════════════
//  YANTRA VERIFY ENDPOINT
//  Sends a test message to confirm phone/email works
//  POST /api/verify
//  © GSK Productions Inc — Yantra™
// ═══════════════════════════════════════════════════

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

  const { phone, email } = req.body;
  const results = {};

  if (phone) {
    try {
      const cleanPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
      const telnyxRes = await fetch('https://api.telnyx.com/v2/messages', {
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
      results.whatsapp = telnyxRes.ok ? 'verified' : 'failed';
    } catch {
      results.whatsapp = 'error';
    }
  }

  if (email) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
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
              <p>You will receive updates at <strong>${email}</strong> whenever Yantra completes a task.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
              <p style="font-size:12px;color:#999;">Yantra™ by GSK Productions Inc · © 2024–2026 All Rights Reserved</p>
            </div>
          `
        })
      });
      results.email = resendRes.ok ? 'verified' : 'failed';
    } catch {
      results.email = 'error';
    }
  }

  return res.status(200).json({ success: true, results });
}
