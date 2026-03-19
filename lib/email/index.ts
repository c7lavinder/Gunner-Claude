// lib/email/index.ts
// Transactional email via Resend (resend.com)
// Add to package.json: "resend": "^3.0.0"
// Set RESEND_API_KEY in .env.local

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Gunner AI <noreply@gunnerai.com>'
const APP_URL = process.env.NEXTAUTH_URL ?? 'https://gunnerai.com'

interface SendResult {
  success: boolean
  error?: string
}

async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    // Dev mode - log instead of send
    console.log(`[Email DEV] To: ${to} | Subject: ${subject}`)
    return { success: true }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Email] Resend error:', err)
      return { success: false, error: err }
    }

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Email] Send failed:', msg)
    return { success: false, error: msg }
  }
}

// ─── Team invite email ────────────────────────────────────────────────────────

export async function sendTeamInvite({
  toEmail,
  inviterName,
  companyName,
  tenantSlug,
  role,
  tempPassword,
}: {
  toEmail: string
  inviterName: string
  companyName: string
  tenantSlug: string
  role: string
  tempPassword: string
}): Promise<SendResult> {
  const loginUrl = `${APP_URL}/login`
  const roleLabel = role.replace(/_/g, ' ').toLowerCase()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:40px 20px">

  <div style="text-align:center;margin-bottom:32px">
    <div style="display:inline-flex;align-items:center;gap:10px">
      <div style="width:32px;height:32px;background:#f97316;border-radius:8px;display:inline-flex;align-items:center;justify-content:center">
        <span style="color:white;font-weight:700;font-size:14px;line-height:1">G</span>
      </div>
      <span style="color:white;font-weight:600;font-size:18px">Gunner AI</span>
    </div>
  </div>

  <div style="background:#1a1d27;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px">
    <h1 style="color:white;font-size:20px;font-weight:600;margin:0 0 8px">You've been invited</h1>
    <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;line-height:1.6">
      <strong style="color:white">${inviterName}</strong> has added you to <strong style="color:white">${companyName}</strong> on Gunner AI as a <strong style="color:#f97316">${roleLabel}</strong>.
    </p>

    <div style="background:#0f1117;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px">
      <p style="color:#6b7280;font-size:12px;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em">Your login credentials</p>
      <div style="margin-bottom:8px">
        <span style="color:#6b7280;font-size:12px">Email</span>
        <p style="color:white;font-size:14px;font-weight:500;margin:2px 0 0">${toEmail}</p>
      </div>
      <div>
        <span style="color:#6b7280;font-size:12px">Temporary password</span>
        <p style="color:#f97316;font-size:16px;font-weight:600;font-family:monospace;margin:2px 0 0;letter-spacing:0.1em">${tempPassword}</p>
      </div>
    </div>

    <a href="${loginUrl}" style="display:block;background:#f97316;color:white;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600;font-size:14px">
      Sign in to Gunner AI
    </a>

    <p style="color:#4b5563;font-size:12px;margin:20px 0 0;text-align:center;line-height:1.6">
      Change your password after first login in Settings.<br>
      Questions? Reply to this email.
    </p>
  </div>

  <p style="color:#374151;font-size:11px;text-align:center;margin-top:24px">
    Gunner AI &mdash; Real estate wholesaling command center
  </p>
</div>
</body>
</html>`

  return sendEmail(
    toEmail,
    `${inviterName} invited you to ${companyName} on Gunner AI`,
    html,
  )
}

// ─── Call graded notification (future use) ────────────────────────────────────

export async function sendCallGradedNotification({
  toEmail,
  userName,
  score,
  callId,
  tenantSlug,
}: {
  toEmail: string
  userName: string
  score: number
  callId: string
  tenantSlug: string
}): Promise<SendResult> {
  const callUrl = `${APP_URL}/${tenantSlug}/calls/${callId}`
  const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444'
  const scoreLabel = score >= 80 ? 'Great call' : score >= 60 ? 'Good effort' : 'Needs work'

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:40px 20px">
  <div style="background:#1a1d27;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;text-align:center">
    <p style="color:#9ca3af;font-size:13px;margin:0 0 16px">Your call was graded, ${userName.split(' ')[0]}</p>
    <div style="font-size:56px;font-weight:700;color:${scoreColor};margin-bottom:4px">${score}</div>
    <div style="font-size:13px;color:${scoreColor};margin-bottom:24px">${scoreLabel}</div>
    <a href="${callUrl}" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:13px">
      View feedback
    </a>
  </div>
</div>
</body>
</html>`

  return sendEmail(toEmail, `Your call score: ${score}/100 — ${scoreLabel}`, html)
}
