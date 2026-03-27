// lib/ghl/client.ts
// Central GHL API client — ALL GHL calls go through this file
// Handles: OAuth token refresh, error handling, rate limiting, retry on 401/429
// See: /memory/reference_ghl_masterclass.md for GHL API patterns

import { db } from '@/lib/db/client'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'
const MAX_RETRIES = 2

// Simple in-memory lock to prevent concurrent token refreshes per tenant
const refreshLocks = new Map<string, Promise<string>>()

export class GHLClient {
  private tenantId: string
  private accessToken: string
  private locationId: string

  constructor(tenantId: string, accessToken: string, locationId: string) {
    this.tenantId = tenantId
    this.accessToken = accessToken
    this.locationId = locationId
  }

  /** Update token after a refresh (called by getGHLClient on retry) */
  setAccessToken(token: string) {
    this.accessToken = token
  }

  // ─── Core request method with auto-retry on 401 and 429 ──────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    retryCount = 0,
  ): Promise<T> {
    const url = `${GHL_BASE_URL}${path}`

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Version': GHL_API_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    // Auto-retry on 401 (expired token) — refresh and retry once
    if (response.status === 401 && retryCount < 1) {
      try {
        const newToken = await refreshGHLTokenWithLock(this.tenantId)
        this.accessToken = newToken
        return this.request<T>(method, path, body, retryCount + 1)
      } catch {
        throw new GHLError(401, 'Token refresh failed', path)
      }
    }

    // Auto-retry on 429 (rate limited) — respect Retry-After header
    if (response.status === 429 && retryCount < MAX_RETRIES) {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '2')
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
      return this.request<T>(method, path, body, retryCount + 1)
    }

    if (!response.ok) {
      const error = await response.text()
      throw new GHLError(response.status, error, path)
    }

    return response.json() as Promise<T>
  }

  // ─── Contacts ──────────────────────────────────────────────────────────────

  async getContact(contactId: string) {
    const result = await this.request<{ contact: GHLContact }>('GET', `/contacts/${contactId}`)
    return result.contact
  }

  async updateContact(contactId: string, data: Partial<GHLContactUpdate>) {
    return this.request<GHLContact>('PUT', `/contacts/${contactId}`, data)
  }

  async getContactNotes(contactId: string) {
    return this.request<{ notes: Array<{ id: string; body: string; dateAdded: string }> }>('GET', `/contacts/${contactId}/notes`)
  }

  async addNote(contactId: string, note: string) {
    return this.request('POST', `/contacts/${contactId}/notes`, {
      body: note,
      userId: 'gunner-ai',
    })
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  async createTask(contactId: string, task: GHLTaskInput) {
    return this.request<GHLTask>('POST', `/contacts/${contactId}/tasks`, { ...task })
  }

  async updateTask(contactId: string, taskId: string, data: Partial<GHLTaskInput>) {
    return this.request<GHLTask>('PUT', `/contacts/${contactId}/tasks/${taskId}`, data)
  }

  async completeTask(contactId: string, taskId: string) {
    return this.request('PUT', `/contacts/${contactId}/tasks/${taskId}/completed`, {
      completed: true,
    })
  }

  // ─── SMS ───────────────────────────────────────────────────────────────────

  async sendSMS(contactId: string, message: string, fromNumber?: string) {
    return this.request('POST', `/conversations/messages`, {
      type: 'SMS',
      contactId,
      message,
      ...(fromNumber ? { fromNumber } : {}),
    })
  }

  async sendEmail(contactId: string, subject: string, html: string, emailFrom?: string) {
    return this.request('POST', `/conversations/messages`, {
      type: 'Email',
      contactId,
      subject,
      html,
      ...(emailFrom ? { emailFrom } : {}),
    })
  }

  // ─── Contact Search ─────────────────────────────────────────────────────────

  async searchContacts(params: { query?: string; limit?: number }) {
    const queryParams = new URLSearchParams({
      locationId: this.locationId,
      ...(params.limit && { limit: String(params.limit) }),
      ...(params.query && { query: params.query }),
    })
    return this.request<{ contacts: GHLContact[]; total: number }>('GET', `/contacts/?${queryParams}`)
  }

  // ─── Conversations / Inbox ─────────────────────────────────────────────────

  async getConversations(params?: { unreadOnly?: boolean; limit?: number; startAfterId?: string }) {
    const query = new URLSearchParams({
      locationId: this.locationId,
      ...(params?.limit && { limit: String(params.limit) }),
      ...(params?.startAfterId && { startAfterId: params.startAfterId }),
    })
    return this.request<GHLConversationList>('GET', `/conversations/search?${query}`)
  }

  async getUnreadCount() {
    const result = await this.getConversations({ unreadOnly: true, limit: 1 })
    return result?.total ?? 0
  }

  // ─── Calls ─────────────────────────────────────────────────────────────────

  async getCall(callId: string) {
    return this.request<GHLCall>('GET', `/calls/${callId}`)
  }

  async getCallRecording(callId: string) {
    return this.request<{ url: string }>('GET', `/calls/${callId}/recording`)
  }

  async getRecentCalls(params?: { startDate?: string; endDate?: string; limit?: number }) {
    const query = new URLSearchParams({
      locationId: this.locationId,
      ...(params?.startDate && { startDate: params.startDate }),
      ...(params?.endDate && { endDate: params.endDate }),
      ...(params?.limit && { limit: String(params.limit) }),
    })
    return this.request<GHLCallList>('GET', `/calls?${query}`)
  }

  // ─── Tasks (search from GHL) ───────────────────────────────────────────────

  async searchTasks(status: 'incompleted' | 'completed' = 'incompleted') {
    // GHL tasks/search rejects body params — send empty body, location inferred from URL
    // Paginate using searchAfter cursor (25 per page)
    const allTasks: GHLTaskItem[] = []
    let searchAfter: unknown[] | undefined

    for (let page = 0; page < 20; page++) { // safety cap: 500 tasks max
      const body: Record<string, unknown> = {}
      if (searchAfter) body.searchAfter = searchAfter

      const result = await this.request<GHLTaskSearchResponse>('POST', `/locations/${this.locationId}/tasks/search`, body)
      const pageTasks = result.tasks ?? []
      if (pageTasks.length === 0) break

      // Map _id to id for consistency
      for (const t of pageTasks) {
        if (!t.id && t._id) t.id = t._id
      }
      allTasks.push(...pageTasks)

      // Get cursor from last task for next page
      const lastTask = pageTasks[pageTasks.length - 1]
      if (lastTask.searchAfter) {
        searchAfter = lastTask.searchAfter as unknown[]
      } else {
        break // no cursor means no more pages
      }

      if (pageTasks.length < 25) break // partial page = last page
    }

    // Filter by status client-side
    if (status === 'incompleted') return { tasks: allTasks.filter(t => !t.completed) }
    if (status === 'completed') return { tasks: allTasks.filter(t => t.completed) }
    return { tasks: allTasks }
  }

  // ─── Appointments ──────────────────────────────────────────────────────────

  async getCalendars() {
    return this.request<{ calendars: Array<{ id: string; name: string; groupId: string }> }>('GET', `/calendars/?locationId=${this.locationId}`)
  }

  async getAppointments(params: { startDate: string; endDate: string; userId?: string }) {
    // GHL /calendars/events expects Unix timestamps in milliseconds
    // startDate/endDate may already be Unix ms strings or ISO strings — normalize both
    const toMs = (v: string) => {
      const n = Number(v)
      if (!isNaN(n) && n > 1e12) return String(n) // already Unix ms
      return String(new Date(v).getTime())
    }
    const baseParams: Record<string, string> = {
      locationId: this.locationId,
      startTime: toMs(params.startDate),
      endTime: toMs(params.endDate),
    }
    if (params.userId) baseParams.userId = params.userId

    // Strategy 1: Try the location-level events endpoint directly
    try {
      const query = new URLSearchParams(baseParams)
      const result = await this.request<GHLAppointmentList>('GET', `/calendars/events?${query}`)
      if ((result.events ?? []).length > 0) return result
    } catch {
      // fall through to per-calendar strategy
    }

    // Strategy 2: Fetch each calendar individually and merge events
    const calendarsResult = await this.getCalendars()
    const calendars = calendarsResult.calendars ?? []

    const allEvents: GHLAppointment[] = []
    for (const cal of calendars) {
      try {
        const calQuery = new URLSearchParams({
          ...baseParams,
          calendarId: cal.id,
          ...(cal.groupId ? { groupId: cal.groupId } : {}),
        })
        const result = await this.request<GHLAppointmentList>('GET', `/calendars/events?${calQuery}`)
        const events = result.events ?? result.appointments ?? []
        allEvents.push(...events)
      } catch {
        continue // skip calendars that error
      }
    }

    return { events: allEvents }
  }

  // ─── Pipeline ──────────────────────────────────────────────────────────────

  async getPipelines() {
    return this.request<GHLPipelineList>('GET', `/opportunities/pipelines?locationId=${this.locationId}`)
  }

  async searchOpportunities(pipelineId: string, limit = 100, startAfter?: string) {
    let url = `/opportunities/search?location_id=${this.locationId}&pipeline_id=${pipelineId}&limit=${limit}`
    if (startAfter) url += `&startAfter=${startAfter}&startAfterId=${startAfter}`
    return this.request<{ opportunities: Array<{ id: string; contactId: string; name: string; stageId: string; status: string }>; meta?: { total?: number; nextPageUrl?: string; startAfter?: string; startAfterId?: string } }>('GET', url)
  }

  async getAllPipelineContacts(pipelineId: string): Promise<string[]> {
    const contactIds: string[] = []
    let startAfter: string | undefined
    let page = 0
    // Paginate through all opportunities in the pipeline
    while (page < 50) { // safety limit: 50 pages × 100 = 5000 contacts
      const result = await this.searchOpportunities(pipelineId, 100, startAfter)
      const opps = result.opportunities ?? []
      if (opps.length === 0) break
      for (const opp of opps) {
        if (opp.contactId && !contactIds.includes(opp.contactId)) {
          contactIds.push(opp.contactId)
        }
      }
      startAfter = result.meta?.startAfterId ?? opps[opps.length - 1]?.id
      if (!startAfter || opps.length < 100) break
      page++
    }
    return contactIds
  }

  async updateOpportunityStage(opportunityId: string, stageId: string) {
    return this.request('PUT', `/opportunities/${opportunityId}`, {
      stageId,
    })
  }

  // ─── Users (location team members) ────────────────────────────────────────

  async getLocationUsers() {
    // Try /users/ endpoint with locationId — /users/search needs companyId which we don't store
    return this.request<GHLUserList>('GET', `/users/?locationId=${this.locationId}`)
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  async registerWebhook(url: string, events: string[]) {
    return this.request<{ id: string }>('POST', `/locations/${this.locationId}/webhooks`, {
      name: 'Gunner AI',
      url,
      events,
    })
  }

  async deleteWebhook(webhookId: string) {
    return this.request('DELETE', `/locations/${this.locationId}/webhooks/${webhookId}`)
  }
}

// ─── Factory: get a ready GHL client for a tenant ──────────────────────────

export async function getGHLClient(tenantId: string): Promise<GHLClient> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      ghlAccessToken: true,
      ghlRefreshToken: true,
      ghlTokenExpiry: true,
      ghlLocationId: true,
    },
  })

  if (!tenant?.ghlAccessToken || !tenant.ghlLocationId) {
    throw new Error(`Tenant ${tenantId} has no GHL connection`)
  }

  // Refresh token if expired or expiring in next 5 minutes
  const expiresAt = tenant.ghlTokenExpiry
  const needsRefresh = !expiresAt || expiresAt < new Date(Date.now() + 5 * 60 * 1000)

  let accessToken = tenant.ghlAccessToken

  if (needsRefresh && tenant.ghlRefreshToken) {
    accessToken = await refreshGHLTokenWithLock(tenantId)
  }

  return new GHLClient(tenantId, accessToken, tenant.ghlLocationId)
}

// ─── OAuth helpers ──────────────────────────────────────────────────────────

export async function exchangeGHLCode(code: string): Promise<GHLTokenResponse> {
  const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.GHL_CLIENT_ID!,
      client_secret: process.env.GHL_CLIENT_SECRET!,
      redirect_uri: process.env.GHL_REDIRECT_URI!,
    }),
  })

  if (!response.ok) {
    throw new Error(`GHL token exchange failed: ${await response.text()}`)
  }

  return response.json() as Promise<GHLTokenResponse>
}

async function refreshGHLToken(tenantId: string, refreshToken: string): Promise<string> {
  const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GHL_CLIENT_ID!,
      client_secret: process.env.GHL_CLIENT_SECRET!,
    }),
  })

  if (!response.ok) {
    throw new Error(`GHL token refresh failed for tenant ${tenantId}`)
  }

  const tokens: GHLTokenResponse = await response.json()

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      ghlAccessToken: tokens.access_token,
      ghlRefreshToken: tokens.refresh_token,
      ghlTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
    },
  })

  return tokens.access_token
}

/**
 * Mutex-protected token refresh — prevents multiple concurrent requests
 * from triggering parallel refreshes for the same tenant.
 * Pattern from ghl-masterclass: token race condition fix.
 */
async function refreshGHLTokenWithLock(tenantId: string): Promise<string> {
  const existing = refreshLocks.get(tenantId)
  if (existing) return existing // another request is already refreshing — wait for it

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { ghlRefreshToken: true },
  })

  if (!tenant?.ghlRefreshToken) {
    throw new Error(`No refresh token for tenant ${tenantId}`)
  }

  const promise = refreshGHLToken(tenantId, tenant.ghlRefreshToken)
    .finally(() => refreshLocks.delete(tenantId))

  refreshLocks.set(tenantId, promise)
  return promise
}

// ─── Error class ────────────────────────────────────────────────────────────

export class GHLError extends Error {
  constructor(
    public statusCode: number,
    public body: string,
    public path: string,
  ) {
    super(`GHL API error ${statusCode} on ${path}: ${body}`)
    this.name = 'GHLError'
  }
}

// ─── GHL Type definitions ───────────────────────────────────────────────────

export interface GHLTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  locationId: string
  companyId: string
}

export interface GHLContact {
  id: string
  locationId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  city: string
  state: string
  postalCode: string
  source: string
  tags: string[]
  customFields: Array<{ id: string; value: string }>
  assignedTo?: string
}

export interface GHLContactUpdate {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  address1?: string
  city?: string
  state?: string
  postalCode?: string
  tags?: string[]
  customFields?: Array<{ id: string; value: string }>
}

export interface GHLTask {
  id: string
  title: string
  body: string
  dueDate: string
  completed: boolean
  contactId: string
  assignedTo?: string   // GHL user ID
  userId?: string       // alternate field name
}

export interface GHLTaskInput {
  title: string
  body?: string
  dueDate: string
  completed?: boolean
}

export interface GHLCall {
  id: string
  direction: 'inbound' | 'outbound'
  status: string
  duration: number
  recordingUrl?: string
  from: string
  to: string
  contactId: string
  userId: string
  createdAt: string
}

export interface GHLCallList {
  calls: GHLCall[]
  total: number
}

export interface GHLConversationList {
  conversations: GHLConversation[]
  total: number
}

export interface GHLConversation {
  id: string
  contactId: string
  contactName: string
  fullName: string
  phone: string
  unreadCount: number
  lastMessage: string
  lastMessageBody: string
  lastMessageType: string
  lastMessageDate: number
  lastMessageDirection: string
  updatedAt: string | number
  dateUpdated: number
  userId?: string         // GHL user assigned to conversation
  assignedTo?: string     // alternate field name for assigned user
}

export interface GHLAppointmentList {
  events: GHLAppointment[]
  appointments?: GHLAppointment[]
}

export interface GHLAppointment {
  id: string
  title: string
  startTime: string
  endTime: string
  contactId: string
  userId?: string
  assignedUserId?: string    // GHL actual field name
  status?: string
  appointmentStatus?: string // GHL actual field name
  calendarId: string
}

export interface GHLTaskSearchResult {
  tasks: GHLTaskItem[]
  total?: number
}

export interface GHLTaskItem {
  id: string
  _id?: string
  title: string
  body?: string
  dueDate: string
  completed: boolean
  contactId: string
  assignedTo?: string
  contactDetails?: { firstName?: string; lastName?: string }
  assignedToUserDetails?: { id?: string; firstName?: string; lastName?: string }
  searchAfter?: unknown[]
}

interface GHLTaskSearchResponse {
  tasks: GHLTaskItem[]
  total?: number
}

export interface GHLPipelineList {
  pipelines: GHLPipeline[]
}

export interface GHLPipeline {
  id: string
  name: string
  stages: Array<{ id: string; name: string }>
}

export interface GHLUserList {
  users: GHLUser[]
  count?: number
}

export interface GHLUser {
  id: string
  name: string
  firstName: string
  lastName: string
  email: string
  phone: string
  type: string
  role: string
  locationIds: string[]
}
