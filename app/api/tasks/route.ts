// app/api/tasks/route.ts
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueAt: z.string().datetime().optional(),
  propertyId: z.string().optional(),
  assignedToId: z.string().optional(),
  syncToGhl: z.boolean().default(true),
})

export const POST = withTenant(async (request, ctx) => {
  const userId = ctx.userId
  const tenantId = ctx.tenantId

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { title, description, category, priority, dueAt, propertyId, assignedToId, syncToGhl } = parsed.data

  try {
    // If linked to a property, get the GHL contact ID for syncing
    let ghlContactId: string | undefined
    if (propertyId) {
      const property = await db.property.findUnique({
        where: { id: propertyId, tenantId },
        select: { ghlContactId: true },
      })
      ghlContactId = property?.ghlContactId ?? undefined
    }

    // Create in our DB
    const task = await db.task.create({
      data: {
        tenantId,
        title,
        description,
        category,
        priority,
        dueAt: dueAt ? new Date(dueAt) : undefined,
        propertyId,
        assignedToId: assignedToId ?? userId,
        status: 'PENDING',
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        property: { select: { id: true, address: true, city: true } },
      },
    })

    // Sync to GHL if we have a contact to attach it to
    if (syncToGhl && ghlContactId) {
      try {
        const ghl = await getGHLClient(tenantId)
        const ghlTask = await ghl.createTask(ghlContactId, {
          title,
          body: description,
          dueDate: dueAt ?? new Date(Date.now() + 86400000).toISOString(),
        })
        // FIX: was leaking — Class 1 — prior code used update({ where: { id: task.id } })
        // (no tenantId). Defense-in-depth: scope every write.
        await db.task.update({ where: { id: task.id, tenantId }, data: { ghlTaskId: ghlTask.id } })
      } catch (ghlErr) {
        console.warn('[Tasks] GHL sync failed (non-fatal):', ghlErr)
      }
    }

    return NextResponse.json({ task })
  } catch (err) {
    console.error('[Tasks] Create failed:', err)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
})
