// lib/db/client.ts
// Prisma client with Supabase RLS support
// The setTenantContext() call activates row-level security per request

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// Call this at the start of every server action / API route that queries the DB.
// It sets the Supabase RLS context so policies can filter by tenant.
// Without this, RLS policies exist but are never activated.
export async function setTenantContext(tenantId: string, userId: string): Promise<void> {
  await db.$executeRawUnsafe(`
    SELECT set_config('app.tenant_id', '${tenantId}', true),
           set_config('app.user_id', '${userId}', true)
  `)
}

// Wrapper that sets context then runs your query function
// Usage: await withTenantContext(tenantId, userId, () => db.property.findMany(...))
export async function withTenantContext<T>(
  tenantId: string,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await setTenantContext(tenantId, userId)
  return fn()
}
