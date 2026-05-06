// lib/db/settings.ts
// Centralized tenant settings writer — all settings writes go through here
// WRITES TO: tenants table (various columns)
// READ BY: all settings-dependent pages and API routes

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'

interface ToolResponse<T = unknown> {
  status: 'success' | 'error' | 'no_results'
  data?: T
  error?: string
  suggestion?: string
}

interface TenantSettingsUpdate {
  // Phase 1 commit 2: pipeline registration moved to tenant_ghl_pipelines.
  // The /api/tenants/ghl-pipelines endpoint mutates that table directly.
  onboardingStep: number
  onboardingCompleted: boolean
  callTypes: string[]
  callResults: string[]
  config: Record<string, unknown>
}

export async function updateTenantSettings(
  tenantId: string,
  updates: Partial<TenantSettingsUpdate>
): Promise<ToolResponse<{ id: string; slug: string }>> {
  try {
    const { config, ...rest } = updates

    const data: Prisma.TenantUpdateInput = {
      ...rest,
      ...(config !== undefined && {
        config: JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue,
      }),
    }

    const updated = await db.tenant.update({
      where: { id: tenantId },
      data,
      select: { id: true, slug: true },
    })

    return { status: 'success', data: updated }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
      suggestion: 'Check that tenantId exists and field names match schema',
    }
  }
}
