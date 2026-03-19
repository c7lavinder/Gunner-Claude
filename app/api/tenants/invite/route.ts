// app/api/tenants/invite/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { sendTeamInvite } from '@/lib/email'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const inviteSchema = z.object({
  invites: z.array(z.object({
    email: z.string().email(),
    role: z.string(),
    name: z.string().optional(),
  })).min(1).max(20),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'users.invite')) return forbiddenResponse()

  const body = await request.json()
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const results = []

  for (const invite of parsed.data.invites) {
    // Check if email already exists anywhere in the system
    const existing = await db.user.findUnique({ where: { email: invite.email } })
    if (existing) {
      results.push({ email: invite.email, status: 'already_exists' })
      continue
    }

    // Generate temp password — user must change on first login
    const tempPassword = generateTempPassword()
    const hashedPassword = await bcrypt.hash(tempPassword, 12)

    await db.user.create({
      data: {
        tenantId: session.tenantId,
        email: invite.email,
        name: invite.name ?? invite.email.split('@')[0],
        role: invite.role as any,
        hashedPassword,
      },
    })

    // Send invite email (non-blocking — don't fail the invite if email fails)
    const emailResult = await sendTeamInvite({
      toEmail: invite.email,
      inviterName: session.name,
      companyName: '', // fetched below if needed
      tenantSlug: session.tenantSlug,
      role: invite.role,
      tempPassword,
    })

    await db.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'user.invited',
        resource: 'user',
        source: 'USER',
        severity: 'INFO',
        payload: { email: invite.email, role: invite.role, emailSent: emailResult.success },
      },
    })

    results.push({
      email: invite.email,
      status: 'invited',
      emailSent: emailResult.success,
    })
  }

  return NextResponse.json({ results })
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
