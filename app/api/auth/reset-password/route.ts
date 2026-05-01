// app/api/auth/reset-password/route.ts
// Password reset — generates temp password and sends via email
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { sendPasswordReset } from '@/lib/email'

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

  await sendPasswordReset({ toEmail: parsed.data.email, tempPassword })

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
