// types/roles.ts
// Role definitions, permissions, and hierarchy for Gunner AI
// Every permission check in the app references this file

export const ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  TEAM_LEAD: 'TEAM_LEAD',
  LEAD_MANAGER: 'LEAD_MANAGER',
  ACQUISITION_MANAGER: 'ACQUISITION_MANAGER',
  DISPOSITION_MANAGER: 'DISPOSITION_MANAGER',
} as const

export type UserRole = keyof typeof ROLES

// Role hierarchy — higher index = more access
export const ROLE_HIERARCHY: UserRole[] = [
  'DISPOSITION_MANAGER',
  'LEAD_MANAGER',
  'ACQUISITION_MANAGER',
  'TEAM_LEAD',
  'ADMIN',
  'OWNER',
]

export function isRoleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(minimum)
}

// Feature permissions per role
export type Permission =
  | 'calls.view.own'
  | 'calls.view.team'
  | 'calls.view.all'
  | 'calls.grade'
  | 'calls.grade.override'
  | 'properties.view.assigned'
  | 'properties.view.all'
  | 'properties.create'
  | 'properties.edit'
  | 'properties.delete'
  | 'inventory.view'
  | 'inventory.manage'
  | 'tasks.view.own'
  | 'tasks.view.team'
  | 'tasks.create'
  | 'tasks.complete'
  | 'kpis.view.own'
  | 'kpis.view.team'
  | 'kpis.view.all'
  | 'kpis.configure'
  | 'users.view'
  | 'users.invite'
  | 'users.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'ai.coach'
  | 'ghl.actions'
  | 'reports.view'
  | 'reports.export'

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  OWNER: [
    'calls.view.own', 'calls.view.team', 'calls.view.all',
    'calls.grade', 'calls.grade.override',
    'properties.view.assigned', 'properties.view.all',
    'properties.create', 'properties.edit', 'properties.delete',
    'inventory.view', 'inventory.manage',
    'tasks.view.own', 'tasks.view.team', 'tasks.create', 'tasks.complete',
    'kpis.view.own', 'kpis.view.team', 'kpis.view.all', 'kpis.configure',
    'users.view', 'users.invite', 'users.manage',
    'settings.view', 'settings.manage',
    'ai.coach', 'ghl.actions',
    'reports.view', 'reports.export',
  ],
  ADMIN: [
    'calls.view.own', 'calls.view.team', 'calls.view.all',
    'calls.grade', 'calls.grade.override',
    'properties.view.assigned', 'properties.view.all',
    'properties.create', 'properties.edit', 'properties.delete',
    'inventory.view', 'inventory.manage',
    'tasks.view.own', 'tasks.view.team', 'tasks.create', 'tasks.complete',
    'kpis.view.own', 'kpis.view.team', 'kpis.view.all', 'kpis.configure',
    'users.view', 'users.invite', 'users.manage',
    'settings.view', 'settings.manage',
    'ai.coach', 'ghl.actions',
    'reports.view', 'reports.export',
  ],
  TEAM_LEAD: [
    'calls.view.own', 'calls.view.team',
    'calls.grade',
    'properties.view.assigned', 'properties.view.all',
    'properties.create', 'properties.edit',
    'inventory.view', 'inventory.manage',
    'tasks.view.own', 'tasks.view.team', 'tasks.create', 'tasks.complete',
    'kpis.view.own', 'kpis.view.team', 'kpis.configure',
    'users.view', 'users.invite',
    'settings.view',
    'ai.coach', 'ghl.actions',
    'reports.view',
  ],
  ACQUISITION_MANAGER: [
    'calls.view.own', 'calls.view.team', // team = their assigned lead managers
    'calls.grade',
    'properties.view.assigned', 'properties.view.all',
    'properties.create', 'properties.edit',
    'inventory.view',
    'tasks.view.own', 'tasks.view.team', 'tasks.create', 'tasks.complete',
    'kpis.view.own', 'kpis.view.team', 'kpis.configure',
    'users.view',
    'settings.view',
    'ai.coach', 'ghl.actions',
    'reports.view',
  ],
  LEAD_MANAGER: [
    'calls.view.own',
    'properties.view.assigned',
    'tasks.view.own', 'tasks.create', 'tasks.complete',
    'kpis.view.own', 'kpis.configure',
    'settings.view',
    'ai.coach', 'ghl.actions',
  ],
  DISPOSITION_MANAGER: [
    'calls.view.own',
    'properties.view.assigned', 'properties.view.all', 'properties.edit',
    'inventory.view', 'inventory.manage',
    'tasks.view.own', 'tasks.create', 'tasks.complete',
    'kpis.view.own', 'kpis.configure',
    'settings.view',
    'ai.coach', 'ghl.actions',
    'reports.view',
  ],
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

// Default KPIs per role
export const DEFAULT_KPIS: Record<UserRole, string[]> = {
  OWNER: ['total_revenue', 'deals_closed', 'leads_in_pipeline', 'avg_call_score', 'team_performance'],
  ADMIN: ['total_revenue', 'deals_closed', 'leads_in_pipeline', 'avg_call_score', 'team_performance'],
  TEAM_LEAD: ['deals_closed', 'leads_in_pipeline', 'avg_call_score', 'team_call_volume'],
  ACQUISITION_MANAGER: ['calls_made', 'appointments_set', 'contracts_signed', 'avg_call_score'],
  LEAD_MANAGER: ['calls_made', 'leads_contacted', 'appointments_set', 'avg_call_score'],
  DISPOSITION_MANAGER: ['properties_in_inventory', 'deals_sent', 'deals_closed', 'avg_days_to_close'],
}

// Role display names
export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  TEAM_LEAD: 'Team Lead',
  LEAD_MANAGER: 'Lead Manager',
  ACQUISITION_MANAGER: 'Acquisition Manager',
  DISPOSITION_MANAGER: 'Disposition Manager',
}
