// app/api/tenants/invite/route.ts
import { NextResponse } from 'next/server'
import { getSession, forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
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

export const POST = withTenant(async (request, ctx) => {
  if (!hasPermission(ctx.userRole as UserRole, 'users.invite')) return forbiddenResponse()

  // QUEUED CLEANUP: TenantContext doesn't yet expose userName — retained
  // getSession() re-fetch for `session.name` (used as inviterName in the
  // invite email). To be removed when TenantContext is extended at end of
  // Wave 3 (cleanup item #2).
  const session = await getSession()
  const inviterName = session?.name ?? 'A teammate'

  const body = await request.json()
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Fetch tenant name for invite email (fixes bug #8: empty companyName).
  // Tenant.id IS the tenant boundary — id-only WHERE is structurally safe.
  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  })
  const companyName = tenant?.name ?? ctx.tenantSlug

  const results = []

  for (const invite of parsed.data.invites) {
    // Check if email already exists anywhere in the system.
    // Deliberate global lookup — email is unique across all tenants;
    // the result is just a status flag, no user data is leaked.
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
        tenantId: ctx.tenantId,
        email: invite.email,
        name: invite.name ?? invite.email.split('@')[0],
        role: invite.role as any,
        hashedPassword,
      },
    })

    // Send invite email (non-blocking — don't fail the invite if email fails)
    const emailResult = await sendTeamInvite({
      toEmail: invite.email,
      inviterName,
      companyName,
      tenantSlug: ctx.tenantSlug,
      role: invite.role,
      tempPassword,
    })

    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
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
})

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
