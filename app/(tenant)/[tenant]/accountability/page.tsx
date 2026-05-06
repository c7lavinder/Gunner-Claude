// app/(tenant)/[tenant]/accountability/page.tsx
// Admin accountability dashboard — data quality + user performance
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { isRoleAtLeast } from '@/types/roles'
import type { UserRole } from '@/types/roles'
import { redirect } from 'next/navigation'
import { getCentralDayBounds } from '@/lib/dates'
import { AccountabilityClient } from './accountability-client'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'

// Status → which milestones should exist for a property at that status
const STATUS_MILESTONES: Record<string, string[]> = {
  CONTACTED: ['LEAD'],
  APPOINTMENT_SET: ['LEAD', 'APPOINTMENT_SET'],
  APPOINTMENT_COMPLETED: ['LEAD', 'APPOINTMENT_SET'],
  OFFER_MADE: ['LEAD', 'APPOINTMENT_SET', 'OFFER_MADE'],
  UNDER_CONTRACT: ['LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT'],
  IN_DISPOSITION: ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW'],
  DISPO_PUSHED: ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW', 'DISPO_PUSHED'],
  DISPO_OFFERS: ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED'],
  DISPO_CONTRACTED: ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED', 'DISPO_CONTRACTED'],
  DISPO_CLOSED: ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED', 'DISPO_CONTRACTED', 'DISPO_CLOSED'],
  SOLD: ['LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT', 'CLOSED'],
  FOLLOW_UP: ['LEAD'],
}

export default async function AccountabilityPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  if (!isRoleAtLeast(session.role as UserRole, 'ADMIN')) redirect(`/${params.tenant}/day-hub`)

  const tenantId = session.tenantId
  const { dayStart, dayEnd } = getCentralDayBounds()

  // ── All users ──
  const users = await db.user.findMany({
    where: { tenantId, role: { notIn: ['ADMIN', 'OWNER'] } },
    select: { id: true, name: true, role: true, ghlUserId: true },
    orderBy: { name: 'asc' },
  })
  const userMap = new Map(users.map(u => [u.id, u]))

  // ── Parallel data fetch ──
  const [
    missingMarket, missingSource, missingAddress,
    propertiesWithMilestones,
    firstCallsRaw,
    callsToday,
    overdueTasks,
  ] = await Promise.all([
    // Data quality counts — exclude terminal (closed in either lane) and dead (longterm)
    db.property.count({ where: { tenantId, marketId: null, acqStatus: { not: 'CLOSED' }, dispoStatus: { not: 'CLOSED' }, longtermStatus: { not: 'DEAD' } } }),
    db.property.count({ where: { tenantId, leadSource: null, acqStatus: { not: 'CLOSED' }, dispoStatus: { not: 'CLOSED' }, longtermStatus: { not: 'DEAD' } } }),
    db.property.count({ where: { tenantId, address: '', acqStatus: { not: 'CLOSED' }, dispoStatus: { not: 'CLOSED' }, longtermStatus: { not: 'DEAD' } } }),

    // Properties with their milestones for gap detection — exclude brand-new acq leads + dead
    db.property.findMany({
      where: { tenantId, acqStatus: { not: 'NEW_LEAD' }, longtermStatus: { not: 'DEAD' } },
      select: {
        id: true, address: true, city: true, state: true,
        ...PROPERTY_LANE_SELECT,
        milestones: { select: { type: true } },
      },
    }),

    // First call per user today
    db.call.groupBy({
      by: ['assignedToId'],
      where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd }, assignedToId: { not: null } },
      _min: { calledAt: true },
    }),

    // All calls today for heat map
    db.call.findMany({
      where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd }, assignedToId: { not: null } },
      select: { assignedToId: true, calledAt: true },
    }),

    // Overdue tasks where the property has no call today
    db.task.findMany({
      where: {
        tenantId,
        dueAt: { lt: dayStart },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      select: {
        id: true, title: true, dueAt: true,
        assignedTo: { select: { id: true, name: true } },
        property: { select: { id: true, address: true, city: true, ghlContactId: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: 100,
    }),
  ])

  // ── Compute milestone gaps ──
  const milestoneGaps = propertiesWithMilestones
    .map(p => {
      const status = effectiveStatus(p)
      const required = STATUS_MILESTONES[status] ?? []
      const existing = new Set(p.milestones.map(m => m.type as string))
      const missing = required.filter(m => !existing.has(m))
      return { id: p.id, address: `${p.address}, ${p.city} ${p.state}`, status, missing }
    })
    .filter(p => p.missing.length > 0)

  // ── Compute first call times ──
  const firstCalls = firstCallsRaw
    .filter(r => r.assignedToId && r._min.calledAt)
    .map(r => ({
      userId: r.assignedToId!,
      userName: userMap.get(r.assignedToId!)?.name ?? 'Unknown',
      firstCallAt: r._min.calledAt!.toISOString(),
    }))
    .sort((a, b) => a.firstCallAt.localeCompare(b.firstCallAt))

  // Add users who haven't called yet
  const calledUserIds = new Set(firstCalls.map(c => c.userId))
  const noCalls = users
    .filter(u => !calledUserIds.has(u.id))
    .map(u => ({ userId: u.id, userName: u.name, firstCallAt: null as string | null }))

  // ── Compute heat maps ──
  const heatMaps: Array<{ userId: string; userName: string; role: string; hours: number[]; total: number }> = []
  const heatData = new Map<string, number[]>()
  for (const call of callsToday) {
    if (!call.assignedToId || !call.calledAt) continue
    if (!heatData.has(call.assignedToId)) heatData.set(call.assignedToId, Array(24).fill(0))
    const hour = call.calledAt.getHours()
    heatData.get(call.assignedToId)![hour]++
  }
  for (const user of users) {
    heatMaps.push({
      userId: user.id,
      userName: user.name,
      role: user.role ?? '',
      hours: heatData.get(user.id) ?? Array(24).fill(0),
      total: (heatData.get(user.id) ?? []).reduce((a, b) => a + b, 0),
    })
  }

  // ── Filter overdue tasks: only those where contact has no call today ──
  const contactIdsWithCallsToday = new Set(
    callsToday.map(c => c.assignedToId).filter(Boolean) // We'd need ghlContactId, but approximate with assignedToId check
  )
  // Get contacts that received calls today
  const contactsCalledToday = await db.call.findMany({
    where: { tenantId, calledAt: { gte: dayStart, lte: dayEnd }, ghlContactId: { not: null } },
    select: { ghlContactId: true },
    distinct: ['ghlContactId'],
  })
  const calledContactIds = new Set(contactsCalledToday.map(c => c.ghlContactId))

  const overdueWithoutCalls = overdueTasks.filter(t => {
    if (!t.property?.ghlContactId) return true // no contact linked = hasn't been called
    return !calledContactIds.has(t.property.ghlContactId)
  }).map(t => ({
    id: t.id,
    title: t.title,
    dueAt: t.dueAt?.toISOString() ?? null,
    assignedTo: t.assignedTo?.name ?? 'Unassigned',
    property: t.property ? `${t.property.address}, ${t.property.city}` : 'No property',
    daysOverdue: t.dueAt ? Math.floor((dayStart.getTime() - t.dueAt.getTime()) / (1000 * 60 * 60 * 24)) : 0,
  }))

  // ── Unread counts per user (GHL API) ──
  const unreadByUser: Array<{ userId: string; userName: string; unread: number }> = []
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlAccessToken: true, ghlLocationId: true },
    })
    if (tenant?.ghlAccessToken) {
      const headers = { Authorization: `Bearer ${tenant.ghlAccessToken}`, Version: '2021-07-28' }
      for (const user of users) {
        if (!user.ghlUserId) { unreadByUser.push({ userId: user.id, userName: user.name, unread: 0 }); continue }
        try {
          const res = await fetch(
            `https://services.leadconnectorhq.com/conversations/search?locationId=${tenant.ghlLocationId}&assignedTo=${user.ghlUserId}&limit=100`,
            { headers },
          )
          if (res.ok) {
            const data = await res.json() as { conversations?: Array<{ unreadCount?: number }> }
            const total = (data.conversations ?? []).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)
            unreadByUser.push({ userId: user.id, userName: user.name, unread: total })
          } else {
            unreadByUser.push({ userId: user.id, userName: user.name, unread: 0 })
          }
        } catch {
          unreadByUser.push({ userId: user.id, userName: user.name, unread: 0 })
        }
      }
    }
  } catch {
    // GHL unavailable — show 0s
    for (const u of users) unreadByUser.push({ userId: u.id, userName: u.name, unread: 0 })
  }

  return (
    <AccountabilityClient
      tenantSlug={params.tenant}
      dataQuality={{
        missingMarket,
        missingSource,
        missingAddress,
        milestoneGaps: milestoneGaps.length,
      }}
      milestoneGapList={milestoneGaps.slice(0, 50)}
      firstCalls={[...firstCalls, ...noCalls]}
      unreadByUser={unreadByUser}
      overdueWithoutCalls={overdueWithoutCalls.slice(0, 50)}
      heatMaps={heatMaps}
    />
  )
}
