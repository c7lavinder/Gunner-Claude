// app/api/ai/coach/route.ts
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getSession } from '@/lib/auth/session'
import { getCoachResponse } from '@/lib/ai/coach'
import type { UserRole } from '@/types/roles'
import { z } from 'zod'

const schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1),
  propertyId: z.string().optional(),
  currentRoute: z.string().optional(),
})

export const POST = withTenant(async (request, ctx) => {
  const userId = ctx.userId
  const tenantId = ctx.tenantId
  const userRole = ctx.userRole as UserRole
  // ctx doesn't expose userName — re-fetch session for it. Same tax as the
  // resolveEffectiveUser pattern; queued for end-of-Wave-3 ctx extension.
  const session = (await getSession())!
  const userName = session.name

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  try {
    const reply = await getCoachResponse(tenantId, userId, userRole, userName, parsed.data.messages, parsed.data.propertyId)
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[AI Coach] Error:', err)
    return NextResponse.json({ error: 'Coach unavailable' }, { status: 500 })
  }
})
