import { getSession, unauthorizedResponse } from '@/lib/auth/session'
// app/api/ai/coach/route.ts
import { NextRequest, NextResponse } from 'next/server'


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

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const userId = session.userId
  const tenantId = session.tenantId
  const userRole = (session.role) as UserRole
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
}
