#!/usr/bin/env tsx
// scripts/kpi-snapshot.ts
// Runs daily at midnight via Railway cron
// Saves per-user KPI snapshots for historical trend data

import { PrismaClient } from '@prisma/client'
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns'

const db = new PrismaClient()

async function main() {
  console.log(`\n📊 KPI Snapshot — ${new Date().toISOString()}\n`)

  const today = new Date()
  const dayStart = startOfDay(today)
  const weekStart = startOfWeek(today)
  const monthStart = startOfMonth(today)

  const tenants = await db.tenant.findMany({
    where: { onboardingCompleted: true },
    select: { id: true, name: true },
  })

  let snapshotCount = 0

  for (const tenant of tenants) {
    const users = await db.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, role: true },
    })

    // Per-user snapshots
    for (const user of users) {
      const [
        callsToday, callsWeek, callsMonth,
        avgScoreDay, avgScoreMonth,
        tasksCompleted, tasksPending,
        propertiesAssigned,
      ] = await Promise.all([
        db.call.count({ where: { tenantId: tenant.id, assignedToId: user.id, createdAt: { gte: dayStart } } }),
        db.call.count({ where: { tenantId: tenant.id, assignedToId: user.id, createdAt: { gte: weekStart } } }),
        db.call.count({ where: { tenantId: tenant.id, assignedToId: user.id, createdAt: { gte: monthStart } } }),
        db.call.aggregate({ where: { tenantId: tenant.id, assignedToId: user.id, gradingStatus: 'COMPLETED', createdAt: { gte: dayStart } }, _avg: { score: true } }),
        db.call.aggregate({ where: { tenantId: tenant.id, assignedToId: user.id, gradingStatus: 'COMPLETED', createdAt: { gte: monthStart } }, _avg: { score: true } }),
        db.task.count({ where: { tenantId: tenant.id, assignedToId: user.id, status: 'COMPLETED', completedAt: { gte: dayStart } } }),
        db.task.count({ where: { tenantId: tenant.id, assignedToId: user.id, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
        db.property.count({ where: { tenantId: tenant.id, assignedToId: user.id, acqStatus: { not: 'CLOSED' }, dispoStatus: { not: 'CLOSED' }, longtermStatus: { not: 'DEAD' } } }),
      ])

      const metrics = {
        calls: { today: callsToday, week: callsWeek, month: callsMonth },
        avgScore: {
          today: Math.round(avgScoreDay._avg.score ?? 0),
          month: Math.round(avgScoreMonth._avg.score ?? 0),
        },
        tasks: { completedToday: tasksCompleted, open: tasksPending },
        properties: { assigned: propertiesAssigned },
      }

      await db.kpiSnapshot.upsert({
        where: {
          tenantId_userId_snapshotDate_period: {
            tenantId: tenant.id,
            userId: user.id,
            snapshotDate: dayStart,
            period: 'DAILY',
          },
        },
        create: {
          tenantId: tenant.id,
          userId: user.id,
          snapshotDate: dayStart,
          period: 'DAILY',
          metrics,
        },
        update: { metrics },
      })

      snapshotCount++
    }

    // Tenant-level aggregate snapshot (no userId)
    const [tenantCalls, tenantActive, tenantSold] = await Promise.all([
      db.call.count({ where: { tenantId: tenant.id, createdAt: { gte: dayStart } } }),
      db.property.count({ where: { tenantId: tenant.id, acqStatus: { not: 'CLOSED' }, dispoStatus: { not: 'CLOSED' }, longtermStatus: { not: 'DEAD' } } }),
      db.property.count({ where: { tenantId: tenant.id, OR: [{ acqStatus: 'CLOSED' }, { dispoStatus: 'CLOSED' }], updatedAt: { gte: monthStart } } }),
    ])

    // Use raw upsert for the tenant-level snapshot (userId is null)
    await db.kpiSnapshot.upsert({
      where: {
        tenantId_userId_snapshotDate_period: {
          tenantId: tenant.id,
          userId: null as unknown as string, // Prisma handles nullable unique fields
          snapshotDate: dayStart,
          period: 'DAILY',
        },
      },
      create: {
        tenantId: tenant.id,
        snapshotDate: dayStart,
        period: 'DAILY',
        metrics: { calls: tenantCalls, activeProperties: tenantActive, soldThisMonth: tenantSold },
      },
      update: {
        metrics: { calls: tenantCalls, activeProperties: tenantActive, soldThisMonth: tenantSold },
      },
    })

    console.log(`  ✓ ${tenant.name}: ${users.length} user snapshots`)
  }

  console.log(`\n✅ Done — ${snapshotCount} user snapshots across ${tenants.length} tenants`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
