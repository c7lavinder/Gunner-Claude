// app/api/tenants/register/route.ts
// Self-registration endpoint — creates tenant + owner user in one step

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const registerSchema = z.object({
  companyName: z.string().min(2).max(100),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { companyName, name, email, password } = parsed.data

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 },
      )
    }

    // Generate a unique slug from company name
    const baseSlug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50)

    const slug = await generateUniqueSlug(baseSlug)

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create tenant + owner user in one transaction
    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          slug,
          onboardingStep: 1,
          onboardingCompleted: false,
          // Seed default call types — tenant can customize
          callTypes: ['Inbound lead', 'Outbound cold call', 'Follow-up', 'Appointment confirmation'],
          callResults: ['Interested', 'Not interested', 'Call back', 'Appointment set', 'Wrong number', 'No answer'],
        },
      })

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name,
          email,
          hashedPassword,
          role: 'OWNER',
        },
      })

      // Seed default role configs for the tenant
      await seedDefaultRoleConfigs(tx, tenant.id)

      return { tenant, user }
    })

    await db.auditLog.create({
      data: {
        tenantId: result.tenant.id,
        userId: result.user.id,
        action: 'tenant.registered',
        resource: 'tenant',
        resourceId: result.tenant.id,
        source: 'USER',
        severity: 'INFO',
        payload: { companyName, slug, email },
      },
    })

    return NextResponse.json({
      success: true,
      tenantSlug: slug,
      message: 'Account created — proceed to onboarding',
    })
  } catch (err) {
    console.error('[Register] Error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function generateUniqueSlug(base: string): Promise<string> {
  let slug = base
  let attempt = 0

  while (true) {
    const exists = await db.tenant.findUnique({ where: { slug } })
    if (!exists) return slug
    attempt++
    slug = `${base}-${attempt}`
  }
}

async function seedDefaultRoleConfigs(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], tenantId: string) {
  const roles = [
    'OWNER', 'ADMIN', 'TEAM_LEAD',
    'LEAD_MANAGER', 'ACQUISITION_MANAGER', 'DISPOSITION_MANAGER',
  ] as const

  const defaultConfigs = {
    OWNER: {
      defaultKpis: ['total_revenue', 'deals_closed', 'team_call_volume', 'avg_call_score'],
      allowedKpis: ['total_revenue', 'deals_closed', 'team_call_volume', 'avg_call_score', 'leads_in_pipeline', 'appointments_set'],
      permissions: { canViewAll: true },
      taskCategories: ['Follow-up', 'Research', 'Admin', 'Outreach'],
    },
    ADMIN: {
      defaultKpis: ['total_revenue', 'deals_closed', 'team_call_volume', 'avg_call_score'],
      allowedKpis: ['total_revenue', 'deals_closed', 'team_call_volume', 'avg_call_score', 'leads_in_pipeline'],
      permissions: { canViewAll: true },
      taskCategories: ['Follow-up', 'Research', 'Admin', 'Outreach'],
    },
    TEAM_LEAD: {
      defaultKpis: ['deals_closed', 'team_call_volume', 'avg_call_score', 'appointments_set'],
      allowedKpis: ['deals_closed', 'team_call_volume', 'avg_call_score', 'appointments_set', 'leads_in_pipeline'],
      permissions: {},
      taskCategories: ['Follow-up', 'Research', 'Outreach', 'Check-in'],
    },
    LEAD_MANAGER: {
      defaultKpis: ['calls_made', 'leads_contacted', 'appointments_set', 'avg_call_score'],
      allowedKpis: ['calls_made', 'leads_contacted', 'appointments_set', 'avg_call_score'],
      permissions: {},
      taskCategories: ['Call', 'Follow-up', 'Research'],
    },
    ACQUISITION_MANAGER: {
      defaultKpis: ['calls_made', 'appointments_set', 'contracts_signed', 'avg_call_score'],
      allowedKpis: ['calls_made', 'appointments_set', 'contracts_signed', 'avg_call_score', 'leads_in_pipeline'],
      permissions: {},
      taskCategories: ['Appointment', 'Offer', 'Follow-up', 'Due diligence'],
    },
    DISPOSITION_MANAGER: {
      defaultKpis: ['properties_in_inventory', 'deals_sent', 'deals_closed', 'avg_days_to_close'],
      allowedKpis: ['properties_in_inventory', 'deals_sent', 'deals_closed', 'avg_days_to_close', 'buyer_responses'],
      permissions: {},
      taskCategories: ['Send deal', 'Follow-up buyer', 'Close deal', 'Research buyer'],
    },
  }

  for (const role of roles) {
    await tx.roleConfig.create({
      data: {
        tenantId,
        role,
        ...defaultConfigs[role],
      },
    })
  }
}
