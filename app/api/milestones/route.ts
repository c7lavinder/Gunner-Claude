// app/api/milestones/route.ts
// CRUD for PropertyMilestone — used by Day Hub KPI ledger + property detail
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { z } from 'zod'
import { MilestoneType } from '@prisma/client'
import { getCentralDayBounds } from '@/lib/dates'

const MILESTONE_TYPES = [
  'LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT', 'CLOSED',
  'DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED', 'DISPO_CONTRACTED', 'DISPO_CLOSED',
] as const

const createSchema = z.object({
  propertyId: z.string().min(1),
  type: z.enum(MILESTONE_TYPES),
  notes: z.string().optional(),
  date: z.string().optional(), // ISO date string for backdating (e.g. '2026-03-15')
  loggedById: z.string().optional(), // who carried out this milestone
})

const updateSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  date: z.string().optional(),
  propertyId: z.string().optional(),
  loggedById: z.string().optional(),
})

const deleteSchema = z.object({
  id: z.string().min(1),
})

// POST — create milestone (manual, source = MANUAL)
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { propertyId, type, notes, date, loggedById } = parsed.data
  const tenantId = session.tenantId

  const property = await db.property.findUnique({
    where: { id: propertyId, tenantId },
    select: { id: true, address: true },
  })
  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  try {
    // Auto-add milestone creator to property team
    const milestoneUserId = loggedById || session.userId
    await db.propertyTeamMember.upsert({
      where: { propertyId_userId: { propertyId, userId: milestoneUserId } },
      create: { propertyId, userId: milestoneUserId, tenantId, role: 'Team', source: 'milestone' },
      update: {},
    }).catch(() => {})

    const milestone = await db.propertyMilestone.create({
      data: {
        tenantId,
        propertyId,
        type: type as MilestoneType,
        loggedById: milestoneUserId,
        source: 'MANUAL',
        notes: notes ?? null,
        ...(date ? { createdAt: new Date(date) } : {}),
      },
      include: {
        property: { select: { address: true, city: true, state: true } },
        loggedBy: { select: { name: true } },
      },
    })

    await db.auditLog.create({
      data: {
        tenantId,
        action: `milestone.${type.toLowerCase()}`,
        resource: 'property',
        resourceId: propertyId,
        userId: session.userId,
        source: 'USER',
        severity: 'INFO',
        payload: { type, propertyId },
      },
    }).catch(() => {})

    return NextResponse.json({ milestone })
  } catch (err) {
    console.error('[Milestones] Create failed:', err)
    return NextResponse.json({ error: 'Failed to log milestone' }, { status: 500 })
  }
}

// GET — fetch milestones by propertyId OR by type+date (for KPI ledger)
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('propertyId')
  const type = searchParams.get('type')
  const date = searchParams.get('date') // YYYY-MM-DD

  try {
    // Mode 1: fetch by property (for property detail pipeline)
    if (propertyId) {
      const milestones = await db.propertyMilestone.findMany({
        where: { tenantId: session.tenantId, propertyId },
        orderBy: { createdAt: 'asc' },
        include: { loggedBy: { select: { name: true } } },
      })
      return NextResponse.json({ milestones })
    }

    // Mode 3: fetch team members (for edit dropdown)
    if (searchParams.get('members') === '1') {
      const users = await db.user.findMany({
        where: { tenantId: session.tenantId },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json({ members: users })
    }

    // Mode 2: fetch by type + date (for KPI ledger)
    if (type && date) {
      const { dayStart, dayEnd } = getCentralDayBounds(date)
      const milestones = await db.propertyMilestone.findMany({
        where: {
          tenantId: session.tenantId,
          type: type as MilestoneType,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { id: true, address: true, city: true, state: true } },
          loggedBy: { select: { name: true } },
        },
      })
      return NextResponse.json({
        milestones: milestones.map(m => ({
          id: m.id,
          type: m.type,
          source: m.source,
          notes: m.notes,
          time: m.createdAt.toISOString(),
          propertyId: m.property.id,
          propertyAddress: `${m.property.address}, ${m.property.city} ${m.property.state}`,
          userName: m.loggedBy?.name ?? 'System',
        })),
      })
    }

    return NextResponse.json({ error: 'propertyId or type+date required' }, { status: 400 })
  } catch (err) {
    console.error('[Milestones] Fetch failed:', err)
    return NextResponse.json({ milestones: [] })
  }
}

// PATCH — update milestone (notes, date). Changes source to MANUAL (green = user-verified)
export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { id, notes, date, propertyId, loggedById } = parsed.data

  try {
    const milestone = await db.propertyMilestone.update({
      where: { id, tenantId: session.tenantId },
      data: {
        source: 'MANUAL', // editing turns it green (user-verified)
        ...(notes !== undefined ? { notes } : {}),
        ...(date ? { createdAt: new Date(date) } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(loggedById ? { loggedById } : {}),
      },
      include: {
        property: { select: { address: true, city: true, state: true } },
        loggedBy: { select: { name: true } },
      },
    })

    return NextResponse.json({ milestone })
  } catch (err) {
    console.error('[Milestones] Update failed:', err)
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 })
  }
}

// DELETE — remove milestone
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  try {
    await db.propertyMilestone.deleteMany({
      where: { id: parsed.data.id, tenantId: session.tenantId },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Milestones] Delete failed:', err)
    return NextResponse.json({ error: 'Failed to delete milestone' }, { status: 500 })
  }
}
