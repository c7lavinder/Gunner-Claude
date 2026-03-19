// app/(tenant)/[tenant]/settings/page.tsx
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { SettingsClient } from '@/components/settings/settings-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function SettingsPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId
  const role = session.role as UserRole

  const [tenant, teamMembers, rubrics] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true, name: true, slug: true,
        ghlLocationId: true, onboardingCompleted: true,
        callTypes: true, callResults: true,
        propertyPipelineId: true, propertyTriggerStage: true,
      },
    }),
    db.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: true, reportsTo: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.callRubric.findMany({
      where: { tenantId },
      select: { id: true, name: true, role: true, callType: true, isDefault: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  if (!tenant) redirect('/login')

  const canManage = hasPermission(role, 'settings.manage')
  const callTypes = tenant.callTypes as string[]

  return (
    <SettingsClient
      tenant={{
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        ghlConnected: !!tenant.ghlLocationId,
        callTypes,
        callResults: tenant.callResults as string[],
      }}
      teamMembers={teamMembers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        reportsTo: u.reportsTo,
        createdAt: u.createdAt.toISOString(),
      }))}
      rubrics={rubrics}
      callTypes={callTypes}
      currentUserId={session.userId}
      currentUserRole={role}
      canManage={canManage}
    />
  )
}
