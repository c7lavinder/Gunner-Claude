// GET /api/admin/ai-logs/[id] — fetch full AI log detail
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const log = await db.aiLog.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  })

  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ log })
}
