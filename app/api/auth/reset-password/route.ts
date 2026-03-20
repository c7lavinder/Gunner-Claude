// app/api/auth/reset-password/route.ts
// Password reset — generates temp password and sends via email
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const schema = z.object({ email: z.string().email() })

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, tenantId: true },
  })

  // Always return success to prevent email enumeration
  if (!user) return NextResponse.json({ status: 'success' })

  // Generate temp password
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const tempPassword = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  const hashedPassword = await bcrypt.hash(tempPassword, 12)

  await db.user.update({
    where: { id: user.id },
    data: { hashedPassword },
  })

  // Send email with temp password
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Gunner AI <noreply@gunnerai.com>'

  if (RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: parsed.data.email,
        subject: 'Your Gunner AI password has been reset',
        html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:40px 20px;background:#0f1117;color:white">
          <h2 style="margin:0 0 16px">Password Reset</h2>
          <p style="color:#9ca3af;font-size:14px">Your temporary password is:</p>
          <p style="font-size:24px;font-weight:bold;color:#f97316;font-family:monospace;letter-spacing:2px;margin:16px 0">${tempPassword}</p>
          <p style="color:#6b7280;font-size:12px">Log in and change your password in Settings.</p>
        </div>`,
      }),
    }).catch(() => {})
  } else {
    console.log(`[Password Reset] Temp password for ${parsed.data.email}: ${tempPassword}`)
  }

  await db.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'user.password_reset',
      resource: 'user',
      source: 'SYSTEM',
      severity: 'WARNING',
      payload: { email: parsed.data.email },
    },
  })

  return NextResponse.json({ status: 'success' })
}
