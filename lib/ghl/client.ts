// lib/ghl/client.ts
// Central GHL API client — ALL GHL calls go through this file
// Handles: OAuth token refresh, error handling, rate limiting, logging

import { db } from '@/lib/db/client'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

export class GHLClient {
  private tenantId: string
  private accessToken: string
  private locationId: string

  constructor(tenantId: string, accessToken: string, locationId: string) {
    this.tenantId = tenantId
    this.accessToken = accessToken
    this.locationId = locationId
  }

  // ─── Core request method ───────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
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

    if (!response.ok) {
      const error = await response.text()
      throw new GHLError(response.status, error, path)
    }

    return response.json() as Promise<T>
  }

  // ─── Contacts ──────────────────────────────────────────────────────────────

  async getContact(contactId: string) {
    return this.request<GHLContact>('GET', `/contacts/${contactId}`)
  }

  async updateContact(contactId: string, data: Partial<GHLContactUpdate>) {
    return this.request<GHLContact>('PUT', `/contacts/${contactId}`, data)
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

  async sendSMS(contactId: string, message: string) {
    return this.request('POST', `/conversations/messages`, {
      type: 'SMS',
      contactId,
      message,
    })
  }

  // ─── Conversations / Inbox ─────────────────────────────────────────────────

  async getConversations(params?: { unreadOnly?: boolean; limit?: number }) {
    const query = new URLSearchParams({
      locationId: this.locationId,
      ...(params?.limit && { limit: String(params.limit) }),
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

  // ─── Appointments ──────────────────────────────────────────────────────────

  async getCalendars() {
    return this.request<{ calendars: Array<{ id: string; name: string; groupId: string }> }>('GET', `/calendars/?locationId=${this.locationId}`)
  }

  async getAppointments(params: { userId?: string; startDate: string; endDate: string }) {
    // calendars/events requires a calendarId or groupId — fetch calendars first
    const calendarsResult = await this.getCalendars()
    const calendars = calendarsResult.calendars ?? []
    if (calendars.length === 0) return { events: [] } as GHLAppointmentList

    // Use the first calendar's groupId to get all events in the group
    const groupId = calendars[0].groupId
    const query = new URLSearchParams({
      locationId: this.locationId,
      groupId,
      startTime: params.startDate,
      endTime: params.endDate,
      ...(params.userId && { userId: params.userId }),
    })
    return this.request<GHLAppointmentList>('GET', `/calendars/events?${query}`)
  }

  // ─── Pipeline ──────────────────────────────────────────────────────────────

  async getPipelines() {
    return this.request<GHLPipelineList>('GET', `/opportunities/pipelines?locationId=${this.locationId}`)
  }

  async updateOpportunityStage(opportunityId: string, stageId: string) {
    return this.request('PUT', `/opportunities/${opportunityId}`, {
      stageId,
    })
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
    accessToken = await refreshGHLToken(tenantId, tenant.ghlRefreshToken)
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
  userId: string
  status: string
  calendarId: string
}

export interface GHLPipelineList {
  pipelines: GHLPipeline[]
}

export interface GHLPipeline {
  id: string
  name: string
  stages: Array<{ id: string; name: string }>
}
