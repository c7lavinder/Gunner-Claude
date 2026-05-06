// types/index.ts
// Central type exports — import from '@/types' instead of individual files

export type { UserRole, Permission } from './roles'
export { ROLES, ROLE_HIERARCHY, ROLE_PERMISSIONS, ROLE_LABELS, DEFAULT_KPIS, hasPermission, isRoleAtLeast } from './roles'

// ─── Common API response shapes ───────────────────────────────────────────────

export interface ApiSuccess<T = void> {
  success: true
  data?: T
}

export interface ApiError {
  error: string
  details?: unknown
}

// ─── Property types ───────────────────────────────────────────────────────────
// Phase 1 of GHL multi-pipeline redesign replaced the single PropertyStatus
// enum with three per-lane enums (AcqStatus / DispoStatus / LongtermStatus)
// imported directly from @prisma/client. Display labels live alongside their
// owning lane below.

export const ACQ_STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: 'New lead',
  APPOINTMENT_SET: 'Appointment set',
  OFFER_MADE: 'Offer made',
  UNDER_CONTRACT: 'Under contract',
  CLOSED: 'Closed (purchased)',
}

export const DISPO_STATUS_LABELS: Record<string, string> = {
  IN_DISPOSITION: 'In disposition',
  DISPO_PUSHED: 'Pushed to buyers',
  DISPO_OFFERS: 'Offers received',
  DISPO_CONTRACTED: 'Under contract (buyer)',
  CLOSED: 'Closed (sold)',
}

export const LONGTERM_STATUS_LABELS: Record<string, string> = {
  FOLLOW_UP: 'Follow up',
  DEAD: 'Dead',
}

export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  ...ACQ_STATUS_LABELS,
  ...DISPO_STATUS_LABELS,
  ...LONGTERM_STATUS_LABELS,
}

// ─── Call types ───────────────────────────────────────────────────────────────

export type GradingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
export type CallDirection = 'INBOUND' | 'OUTBOUND'

// ─── Task types ───────────────────────────────────────────────────────────────

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

// ─── Tenant config types ──────────────────────────────────────────────────────

export interface TenantConfig {
  callTypes: string[]
  callResults: string[]
  propertyPipelineId?: string
  propertyTriggerStage?: string
}

// ─── GHL types (shared between lib and components) ───────────────────────────

export interface GhlAction {
  type: 'send_sms' | 'add_note' | 'create_task' | 'complete_task' | 'update_stage'
  contactId?: string
  [key: string]: unknown
}
