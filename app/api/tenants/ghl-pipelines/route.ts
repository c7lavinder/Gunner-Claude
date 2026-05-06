// app/api/tenants/ghl-pipelines/route.ts
// CRUD for tenant_ghl_pipelines — the listening-pipelines registry.
// Replaces the legacy Tenant.{property,dispo}_{pipeline_id,trigger_stage}
// columns dropped in Phase 1 commit 2.
//
// READ BY: components/settings/settings-client.tsx → Pipeline tab
// READ BY: lib/ghl/webhooks.ts → getTrackForPipeline()

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const TRACKS = ['acquisition', 'disposition', 'longterm'] as const
const trackSchema = z.enum(TRACKS)

const addPipelineSchema = z.object({
  ghlPipelineId: z.string().min(1),
  track: trackSchema,
  isActive: z.boolean().optional(),
})

export const GET = withTenant(async (_req, ctx) => {
  const rows = await db.tenantGhlPipeline.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ track: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      ghlPipelineId: true,
      track: true,
      isActive: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ pipelines: rows })
})

export const POST = withTenant(async (req, ctx) => {
  const body = await req.json()
  const parsed = addPipelineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { ghlPipelineId, track, isActive } = parsed.data

  // Upsert by (tenantId, ghlPipelineId) — same pipeline can only register
  // under one track. Re-adding flips isActive back to true and updates the
  // track if changed.
  const row = await db.tenantGhlPipeline.upsert({
    where: { tenantId_ghlPipelineId: { tenantId: ctx.tenantId, ghlPipelineId } },
    create: {
      tenantId: ctx.tenantId,
      ghlPipelineId,
      track,
      isActive: isActive ?? true,
    },
    update: {
      track,
      isActive: isActive ?? true,
    },
    select: { id: true, ghlPipelineId: true, track: true, isActive: true },
  })

  return NextResponse.json({ pipeline: row }, { status: 201 })
})
