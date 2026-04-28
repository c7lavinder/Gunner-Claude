// app/api/diagnostics/dial-counts/route.ts
//
// Token-gated diagnostic. Returns dial counts for any tenant + date by
// running the SAME helpers the UI calls (lib/kpis/dial-counts.ts), so a
// verifier in any environment can compare to the SQL ground truth without
// session cookies, View-As cookies, or rendered-page scraping.
//
// Auth: Authorization: Bearer <DIAGNOSTIC_TOKEN env var>. 401 if missing
// or unset. The endpoint deliberately stays inert (always 401) when
// DIAGNOSTIC_TOKEN is unset on the server — a missing env var is a no-op,
// not an open door.
//
// Use:
//   GET /api/diagnostics/dial-counts?tenant=<slug>[&date=YYYY-MM-DD]
//
// See docs/OPERATIONS.md "Diagnostic endpoints" for the example curl.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getCentralDayBounds } from '@/lib/dates'
import { countDialsInRange } from '@/lib/kpis/dial-counts'

export async function GET(req: Request) {
  const token = process.env.DIAGNOSTIC_TOKEN
  const auth = req.headers.get('authorization') ?? ''
  // Constant-time-ish: compare only after both sides are known. If env is
  // unset, fail closed regardless of what the caller sent.
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const tenantSlug = url.searchParams.get('tenant')
  const dateParam = url.searchParams.get('date') // YYYY-MM-DD, optional
  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenant query param required' }, { status: 400 })
  }
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: `tenant ${tenantSlug} not found` }, { status: 404 })
  }

  const { dayStart, dayEnd } = getCentralDayBounds(dateParam ?? undefined)
  const lmUsers = await db.user.findMany({
    where: { tenantId: tenant.id, role: 'LEAD_MANAGER' },
    select: { id: true, name: true },
  })
  const lmUserIds = lmUsers.map(u => u.id)

  const [tenantDials, lmDials] = await Promise.all([
    countDialsInRange({ kind: 'all', tenantId: tenant.id }, { gte: dayStart, lte: dayEnd }),
    countDialsInRange(
      { kind: 'users', tenantId: tenant.id, userIds: lmUserIds },
      { gte: dayStart, lte: dayEnd },
    ),
  ])

  return NextResponse.json({
    tenant: tenant.slug,
    tenantName: tenant.name,
    date: dateParam ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()),
    centralDayBounds: {
      gte: dayStart.toISOString(),
      lte: dayEnd.toISOString(),
    },
    counts: {
      tenantDials,
      lmDials,
      lmUserIds,
      lmUserNames: lmUsers.map(u => u.name),
    },
    sources: {
      tenantDials: 'lib/kpis/dial-counts.ts countDialsInRange scope=all',
      lmDials: 'lib/kpis/dial-counts.ts countDialsInRange scope=users + LM userIds',
    },
  })
}
