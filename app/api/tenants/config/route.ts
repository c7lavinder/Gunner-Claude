import { getSession, unauthorizedResponse } from '@/lib/auth/session'
// app/api/tenants/config/route.ts
import { NextRequest, NextResponse } from 'next/server'


import { db } from '@/lib/db/client'
import { z } from 'zod'

const configSchema = z.object({
  propertyPipelineId: z.string().optional(),
  propertyTriggerStage: z.string().optional(),
  onboardingStep: z.number().optional(),
  onboardingCompleted: z.boolean().optional(),
  callTypes: z.array(z.string()).optional(),
  callResults: z.array(z.string()).optional(),
  config: z.record(z.unknown()).optional(),
})

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const tenantId = session.tenantId
  const body = await request.json()
  const parsed = configSchema.safeParse(body)

  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const updated = await db.tenant.update({
    where: { id: tenantId },
    data: parsed.data,
  })

  return NextResponse.json({ tenant: { id: updated.id, slug: updated.slug, onboardingStep: updated.onboardingStep } })
}
