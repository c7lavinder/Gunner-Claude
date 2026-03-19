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

export type PropertyStatus =
  | 'NEW_LEAD'
  | 'CONTACTED'
  | 'APPOINTMENT_SET'
  | 'APPOINTMENT_COMPLETED'
  | 'OFFER_MADE'
  | 'UNDER_CONTRACT'
  | 'IN_DISPOSITION'
  | 'SOLD'
  | 'DEAD'

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  NEW_LEAD: 'New lead',
  CONTACTED: 'Contacted',
  APPOINTMENT_SET: 'Appointment set',
  APPOINTMENT_COMPLETED: 'Appointment done',
  OFFER_MADE: 'Offer made',
  UNDER_CONTRACT: 'Under contract',
  IN_DISPOSITION: 'In disposition',
  SOLD: 'Sold',
  DEAD: 'Dead',
}

// ─── Call types ───────────────────────────────────────────────────────────────

export type GradingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
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
