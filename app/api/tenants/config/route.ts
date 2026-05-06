// app/api/tenants/config/route.ts
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

// Phase 1 commit 2: pipeline config moved out of tenants. Listening
// pipelines now live in tenant_ghl_pipelines via the dedicated CRUD at
// /api/tenants/ghl-pipelines. This route handles only the remaining
// tenant-config blob (callTypes, gradingMaterials, etc.).
const configSchema = z.object({
  onboardingStep: z.number().optional(),
  onboardingCompleted: z.boolean().optional(),
  callTypes: z.array(z.string()).optional(),
  callResults: z.union([z.array(z.string()), z.record(z.array(z.string()))]).optional(),
  gradingMaterials: z.string().optional(),
  config: z.record(z.unknown()).optional(),
})

export const GET = withTenant(async (_req, ctx) => {
  // Tenant.id IS the tenant boundary — id-only WHERE is structurally safe.
  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      id: true, slug: true,
      callTypes: true, callResults: true, gradingMaterials: true,
      config: true,
    },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  return NextResponse.json({ tenant })
})

export const PATCH = withTenant(async (request, ctx) => {
  const body = await request.json()
  const parsed = configSchema.safeParse(body)

  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { config, ...rest } = parsed.data
  // Tenant.id IS the tenant boundary — id-only WHERE is structurally safe.
  const updated = await db.tenant.update({
    where: { id: ctx.tenantId },
    data: {
      ...rest,
      ...(config !== undefined && {
        config: JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue,
      }),
    },
  })

  return NextResponse.json({ tenant: { id: updated.id, slug: updated.slug, onboardingStep: updated.onboardingStep } })
})
