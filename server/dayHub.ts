/**
 * Day Hub Backend Service
 * 
 * Provides:
 * 1. Priority scoring for tasks (New Lead > Reschedule > Admin > Follow-Up)
 * 2. KPI tracking (auto-detected + manual entries)
 * 3. Unread/missed conversation detection
 * 4. AM/PM call tracking per task
 * 5. Today's appointments
 */

import {
  ghlFetch,
  getCredentialsForTenant,
} from "./ghlActions";
import { type TaskWithContext } from "./taskCenter";
import { getDb } from "./db";
import { dailyKpiEntries, calls, teamMembers, callGrades, propertyStageHistory, dispoProperties, users } from "../drizzle/schema";
import { eq, and, sql, gte, lt, inArray, or, isNull } from "drizzle-orm";

// ─── SERVER-SIDE CACHE ──────────────────────────────────

interface CacheEntry {
  data: any;
  timestamp: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const inboxCache = new Map<number, CacheEntry>();
const appointmentCache = new Map<number, CacheEntry>();

export function clearDayHubCache(tenantId: number) {
  inboxCache.delete(tenantId);
  appointmentCache.delete(tenantId);
}

// ─── HELPERS ─────────────────────────────────────────────

function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// ─── PRIORITY SCORING ─────────────────────────────────────

export type TaskCategory = "new_lead" | "reschedule" | "admin" | "follow_up";

export interface PrioritizedTask extends TaskWithContext {
  priorityScore: number;
  category: TaskCategory;
  amCallMade: boolean;
  pmCallMade: boolean;
}

/**
 * Classify a task into a category based on its title/body.
 */
export function classifyTask(task: TaskWithContext): TaskCategory {
  const title = (task.title || "").toLowerCase();
  const body = (task.body || "").toLowerCase();
  const combined = `${title} ${body}`;

  // New lead patterns
  const newLeadPatterns = [
    "new lead", "new contact", "brand new", "just came in",
    "recently assigned", "speed to lead", "fresh lead",
    "incoming lead", "new prospect", "call new",
    "start automation", "first call", "initial call",
    "new inbound", "web form", "landing page lead",
  ];
  if (newLeadPatterns.some(p => combined.includes(p))) return "new_lead";

  // Reschedule patterns
  const reschedulePatterns = [
    "reschedule", "no show", "no-show", "noshow",
    "missed appointment", "cancelled apt", "canceled apt",
    "pending apt", "pending appointment", "rebook",
    "didn't show", "failed to show", "walkthrough",
    "confirm apt", "confirm appointment",
  ];
  if (reschedulePatterns.some(p => combined.includes(p))) return "reschedule";

  // Admin task patterns
  const adminPatterns = [
    "admin task", "management task", "assigned by",
    "please do", "urgent task", "priority task",
    "action required", "review this", "check this",
    "update crm", "update mastersuite", "data entry",
    "report", "spreadsheet", "document",
  ];
  if (adminPatterns.some(p => combined.includes(p))) return "admin";

  // Default: follow-up
  return "follow_up";
}

/**
 * Calculate priority score for a task.
 * Higher score = higher priority (should be worked first).
 */
export function calculatePriorityScore(task: TaskWithContext, category: TaskCategory): number {
  const now = Date.now();
  const dueDate = new Date(task.dueDate).getTime();
  const hoursSinceDue = (now - dueDate) / (1000 * 60 * 60);
  const daysSinceDue = hoursSinceDue / 24;

  let score = 0;

  switch (category) {
    case "new_lead": {
      score = 1000;
      if (hoursSinceDue > 0) {
        const decayFactor = Math.pow(0.5, hoursSinceDue / 6);
        score = Math.max(150, 1000 * decayFactor);
      } else {
        score = 900;
      }
      break;
    }
    case "reschedule": {
      score = 700;
      if (daysSinceDue > 0) {
        const decayFactor = Math.pow(0.85, daysSinceDue);
        score = Math.max(250, 700 * decayFactor);
      } else {
        score = 650;
      }
      break;
    }
    case "admin": {
      if (daysSinceDue >= 0) {
        score = 550;
        if (daysSinceDue > 3) {
          score = Math.max(250, 550 * Math.pow(0.9, daysSinceDue - 3));
        }
      } else {
        const daysUntilDue = Math.abs(daysSinceDue);
        score = Math.max(100, 200 - daysUntilDue * 20);
      }
      break;
    }
    case "follow_up": {
      if (daysSinceDue >= 0) {
        score = 500;
        if (daysSinceDue > 5) {
          score = Math.max(200, 500 * Math.pow(0.92, daysSinceDue - 5));
        }
      } else {
        const daysUntilDue = Math.abs(daysSinceDue);
        if (daysUntilDue <= 1) {
          score = 350;
        } else {
          score = Math.max(50, 150 - daysUntilDue * 15);
        }
      }
      break;
    }
  }

  return Math.round(score);
}

/**
 * Score and sort all tasks by priority.
 */
export function prioritizeTasks(tasks: TaskWithContext[]): PrioritizedTask[] {
  return tasks
    .map(task => {
      const category = classifyTask(task);
      const priorityScore = calculatePriorityScore(task, category);
      return {
        ...task,
        priorityScore,
        category,
        amCallMade: false,
        pmCallMade: false,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

// ─── AM/PM CALL DETECTION ─────────────────────────────────

/**
 * Check if outgoing calls were made to a contact in AM (before noon) and PM (noon+).
 * Uses Central timezone (America/Chicago) for business hours.
 */
export function detectAmPmCalls(
  messages: Array<{ type?: string; messageType?: string; direction?: string; dateAdded?: string }>
): { amCallMade: boolean; pmCallMade: boolean } {
  let amCallMade = false;
  let pmCallMade = false;

  const now = new Date();
  // Get today in Central time
  const ctFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayCtStr = ctFormatter.format(now);

  for (const msg of messages) {
    // Check if it's a call (GHL uses both string and number types)
    const typeStr = String(msg.type || "").toUpperCase();
    const msgTypeStr = String(msg.messageType || "").toUpperCase();
    const isCall = typeStr.includes("CALL") || msgTypeStr.includes("CALL") || typeStr === "1";
    const isOutbound = (msg.direction || "").toLowerCase() === "outbound" || (msg.direction || "").toLowerCase() === "outgoing";

    if (!isCall || !isOutbound) continue;

    const msgDate = new Date(msg.dateAdded || "");
    if (isNaN(msgDate.getTime())) continue;

    // Check if this call is from today in Central time
    const msgCtStr = ctFormatter.format(msgDate);
    if (msgCtStr !== todayCtStr) continue;

    // Get the hour in Central time
    const ctHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        hour12: false,
      }).format(msgDate)
    );

    if (ctHour < 12) {
      amCallMade = true;
    } else {
      pmCallMade = true;
    }
  }

  return { amCallMade, pmCallMade };
}

// ─── KPI TARGETS ──────────────────────────────────────────

export interface KpiTarget {
  calls: number;
  conversations: number;
  appointments: number;
}

export const LM_TARGETS: KpiTarget = { calls: 150, conversations: 20, appointments: 4 };
export const AM_TARGETS: KpiTarget = { calls: 40, conversations: 4, appointments: 4 };

/**
 * Get time-aware KPI color based on progress and time of day.
 */
export function getKpiColor(current: number, target: number): "green" | "yellow" | "red" {
  const now = new Date();
  const ctHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );

  const workdayStart = 8;
  const workdayEnd = 18;

  let elapsedFraction: number;
  if (ctHour < workdayStart) {
    elapsedFraction = 0;
  } else if (ctHour >= workdayEnd) {
    elapsedFraction = 1;
  } else {
    elapsedFraction = (ctHour - workdayStart) / (workdayEnd - workdayStart);
  }

  if (current >= target) return "green";
  if (elapsedFraction === 0) return current > 0 ? "green" : "yellow";

  const expected = target * elapsedFraction;
  const progressRatio = expected > 0 ? current / expected : (current > 0 ? 1 : 0);

  if (progressRatio >= 0.9) return "green";
  if (progressRatio >= 0.5) return "yellow";
  return "red";
}

// ─── UNREAD CONVERSATIONS ─────────────────────────────────

export interface UnreadConversation {
  conversationId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactAddress: string; // Property address from contact record
  lastMessage: string;
  lastMessageAt: string;
  type: "sms" | "call" | "email" | "other";
  isMissedCall: boolean;
  assignedTo: string;
  teamPhone: string; // The LC phone number the lead contacted (from last inbound message)
  activitySummary: string; // Brief context: tags, pipeline stage, recent activity
}

/**
 * Fetch unread conversations for a location.
 */
export async function getUnreadConversations(
  tenantId: number,
  assignedToGhlUserId?: string
): Promise<UnreadConversation[]> {
  // Check cache first (keyed by tenantId, ignores assignedTo for simplicity)
  const cacheKey = tenantId;
  const cached = inboxCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[DayHub] Inbox cache hit for tenant ${tenantId}`);
    const cachedData = cached.data as UnreadConversation[];
    // Apply assignedTo filter on cached data if needed
    if (assignedToGhlUserId) {
      return cachedData.filter(c => c.assignedTo === assignedToGhlUserId);
    }
    return cachedData;
  }

  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    // Fetch ALL unread (no assignedTo filter) so cache works for any filter
    let path = `/conversations/search?locationId=${creds.locationId}&status=unread&limit=50`;
    if (assignedToGhlUserId) {
      path += `&assignedTo=${assignedToGhlUserId}`;
    }

    const data = await ghlFetch(creds, path);
    const conversations = data?.conversations || [];

    // First pass: build basic conversation data
    const basicConvos = conversations.map((conv: any) => {
      const lastMsgType = String(conv.lastMessageType || conv.type || "").toUpperCase();
      const isMissedCall = lastMsgType.includes("CALL") &&
        (conv.lastMessageDirection === "inbound" || conv.direction === "inbound");
      const isSms = lastMsgType.includes("SMS") || lastMsgType === "2";
      const isCall = lastMsgType.includes("CALL") || lastMsgType === "1";
      const isEmail = lastMsgType.includes("EMAIL") || lastMsgType === "3";

      let type: "sms" | "call" | "email" | "other" = "other";
      if (isSms) type = "sms";
      else if (isCall) type = "call";
      else if (isEmail) type = "email";

      return {
        conversationId: conv.id || "",
        contactId: conv.contactId || "",
        contactName: toTitleCase(conv.contactName || conv.fullName || "Unknown"),
        contactPhone: conv.phone || "",
        contactAddress: "",
        lastMessage: conv.lastMessageBody || conv.lastMessage || "",
        lastMessageAt: conv.lastMessageDate || conv.dateUpdated || conv.dateAdded || "",
        type,
        isMissedCall,
        assignedTo: conv.assignedTo || conv.userId || "",
        teamPhone: "",
        activitySummary: "",
      } as UnreadConversation;
    });

    // Second pass: fetch last inbound message for each conversation to find team phone
    // Batch in groups of 10 to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < basicConvos.length; i += batchSize) {
      const batch = basicConvos.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (convo: UnreadConversation) => {
          try {
            const msgData = await ghlFetch(
              creds,
              `/conversations/${convo.conversationId}/messages?limit=5&type=TYPE_SMS,TYPE_CALL`
            );
            const messages = msgData?.messages || msgData?.data?.messages || [];
            // Find the last inbound message to get the "to" phone (our team phone)
            for (const msg of messages) {
              const direction = msg.direction || (msg.messageType === 1 ? "inbound" : "outbound");
              if (direction === "inbound" && msg.to) {
                convo.teamPhone = msg.to;
                break;
              }
              // For outbound, the "from" is our team phone
              if (direction === "outbound" && msg.from) {
                convo.teamPhone = msg.from;
                break;
              }
            }
          } catch (err: any) {
            // Silently skip — teamPhone stays empty
            console.warn(`[DayHub] Failed to fetch messages for ${convo.conversationId}:`, err?.message);
          }
        })
      );
    }

    const results = basicConvos;

    // Enrich conversations with contact address from GHL API (best-effort, never blocks inbox)
    try {
      const convsToEnrich = results.filter((c: UnreadConversation) => c.contactId);
      if (convsToEnrich.length > 0) {
        const enrichBatchSize = 5;
        for (let i = 0; i < convsToEnrich.length; i += enrichBatchSize) {
          const batch = convsToEnrich.slice(i, i + enrichBatchSize);
          const enrichResults = await Promise.allSettled(
            batch.map(async (convo: UnreadConversation) => {
              const contactData = await ghlFetch(creds, `/contacts/${convo.contactId}`, "GET");
              const c = contactData.contact || contactData;
              const addressParts = [
                c.address1 || c.streetAddress || "",
                c.city || "",
                c.state || "",
                c.postalCode || c.zip || "",
              ].filter(Boolean);
              const fullAddress = addressParts.join(", ");
              if (fullAddress) convo.contactAddress = fullAddress;
              if (convo.contactName === "Unknown") {
                const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name;
                if (name) convo.contactName = toTitleCase(name);
              }
              // Build activity summary from contact data
              const summaryParts: string[] = [];
              // Pipeline stage (most useful context)
              const stageName = c.pipelineStageName || c.opportunities?.[0]?.stageName || c.opportunities?.[0]?.status || "";
              if (stageName) summaryParts.push(`Stage: ${stageName}`);
              // DND status
              if (c.dnd) summaryParts.push("DND");
              // Date added
              if (c.dateAdded) {
                const addedDate = new Date(c.dateAdded);
                const daysDiff = Math.floor((Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysDiff === 0) summaryParts.push("Added today");
                else if (daysDiff === 1) summaryParts.push("Added yesterday");
                else if (daysDiff < 30) summaryParts.push(`Added ${daysDiff}d ago`);
              }
              // Source
              if (c.source) summaryParts.push(`Source: ${c.source}`);
              convo.activitySummary = summaryParts.join(" · ");
            })
          );
          // If most are failing, stop enrichment early to save API quota
          const failures = enrichResults.filter(r => r.status === "rejected").length;
          if (failures >= Math.ceil(batch.length * 0.8)) {
            console.warn("[DayHub] Most contact enrichment calls failing, stopping early");
            break;
          }
        }
      }
    } catch (enrichErr: any) {
      console.warn("[DayHub] Contact enrichment failed (non-blocking):", enrichErr?.message);
    }

    results.sort((a: UnreadConversation, b: UnreadConversation) => {
      const dateA = new Date(a.lastMessageAt).getTime() || 0;
      const dateB = new Date(b.lastMessageAt).getTime() || 0;
      return dateB - dateA;
    });

    // Cache the full result set
    inboxCache.set(cacheKey, { data: results, timestamp: Date.now() });
    console.log(`[DayHub] Inbox cached ${results.length} conversations for tenant ${tenantId}`);

    // Apply assignedTo filter if needed
    if (assignedToGhlUserId) {
      return results.filter((c: UnreadConversation) => c.assignedTo === assignedToGhlUserId);
    }
    return results;
  } catch (error: any) {
    console.error("[DayHub] getUnreadConversations error:", error?.message);
    return [];
  }
}

// ─── TODAY'S APPOINTMENTS ─────────────────────────────────

export interface TodayAppointment {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  address: string;
  status: string;
  calendarId: string;
  calendarName: string;
  assignedUserId?: string;
  assigneeName?: string;
  activitySummary: string; // Brief context: tags, pipeline stage, recent activity
}

/**
 * Fetch today's appointments for the location.
 */
export async function getTodayAppointments(
  tenantId: number
): Promise<TodayAppointment[]> {
  // Check cache first
  const cached = appointmentCache.get(tenantId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[DayHub] Appointment cache hit for tenant ${tenantId}`);
    return cached.data as TodayAppointment[];
  }

  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    const { getCalendarsForTenant } = await import("./ghlActions");
    const calendars = await getCalendarsForTenant(tenantId);
    if (calendars.length === 0) return [];

    // Get today's date range in Central time (America/Chicago)
    const now = new Date();
    const ctFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const ctDateStr = ctFormatter.format(now);
    const [month, day, year] = ctDateStr.split("/").map(Number);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const todayStart = new Date(`${dateStr}T00:00:00-06:00`);
    const todayEnd = new Date(`${dateStr}T23:59:59-06:00`);

    const appointments: TodayAppointment[] = [];

    for (const cal of calendars) {
      try {
        const data = await ghlFetch(
          creds,
          `/calendars/events?locationId=${creds.locationId}&calendarId=${cal.id}&startTime=${todayStart.getTime()}&endTime=${todayEnd.getTime()}`
        );

        const events = data?.events || data?.data || [];
        for (const evt of events) {
          if (evt.appointmentStatus === "cancelled") continue;
          appointments.push({
            id: evt.id,
            title: evt.title || "Appointment",
            startTime: evt.startTime,
            endTime: evt.endTime,
            contactId: evt.contactId || "",
            contactName: toTitleCase(evt.contact?.name || `${evt.contact?.firstName || ""} ${evt.contact?.lastName || ""}`.trim() || "Unknown"),
            contactPhone: evt.contact?.phone || evt.contact?.primaryPhone || "",
            address: evt.address || evt.location || "",
            status: evt.appointmentStatus || "confirmed",
            calendarId: evt.calendarId || cal.id,
            calendarName: cal.name || "Calendar",
            assignedUserId: evt.assignedUserId || evt.userId || "",
            activitySummary: "",
          });
        }
      } catch (err) {
        console.error(`[DayHub] Error fetching calendar ${cal.id}:`, err);
      }
    }

    // Enrich appointments with contact info from GHL API (best-effort, never blocks appointments)
    try {
      // Always enrich all appointments with contact property address
      const aptsToEnrich = appointments.filter(apt => apt.contactId);
      if (aptsToEnrich.length > 0) {
        const enrichBatchSize = 5;
        for (let i = 0; i < aptsToEnrich.length; i += enrichBatchSize) {
          const batch = aptsToEnrich.slice(i, i + enrichBatchSize);
          const enrichResults = await Promise.allSettled(
            batch.map(async (apt) => {
              const contactData = await ghlFetch(creds, `/contacts/${apt.contactId}`, "GET");
              const c = contactData.contact || contactData;
              const addressParts = [
                c.address1 || c.streetAddress || "",
                c.city || "",
                c.state || "",
                c.postalCode || c.zip || "",
              ].filter(Boolean);
              const fullAddress = addressParts.join(", ");
              // Always use contact's property address (not event location)
              if (fullAddress) apt.address = fullAddress;
              if (apt.contactName === "Unknown") {
                const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name;
                if (name) apt.contactName = toTitleCase(name);
              }
              if (!apt.contactPhone && c.phone) apt.contactPhone = c.phone;
              // Build activity summary from contact data
              const summaryParts: string[] = [];
              // Pipeline stage (most useful context)
              const stageName = c.pipelineStageName || c.opportunities?.[0]?.stageName || c.opportunities?.[0]?.status || "";
              if (stageName) summaryParts.push(`Stage: ${stageName}`);
              if (c.dnd) summaryParts.push("DND");
              if (c.dateAdded) {
                const addedDate = new Date(c.dateAdded);
                const daysDiff = Math.floor((Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysDiff === 0) summaryParts.push("Added today");
                else if (daysDiff === 1) summaryParts.push("Added yesterday");
                else if (daysDiff < 30) summaryParts.push(`Added ${daysDiff}d ago`);
              }
              if (c.source) summaryParts.push(`Source: ${c.source}`);
              apt.activitySummary = summaryParts.join(" · ");
            })
          );
          const failures = enrichResults.filter(r => r.status === "rejected").length;
          if (failures >= Math.ceil(batch.length * 0.8)) {
            console.warn("[DayHub] Most appointment enrichment calls failing, stopping early");
            break;
          }
        }
      }
    } catch (enrichErr: any) {
      console.warn("[DayHub] Appointment enrichment failed (non-blocking):", enrichErr?.message);
    }

    // Resolve assignee names from team_members table
    try {
      const assignedUserIds = Array.from(new Set(appointments.map(a => a.assignedUserId).filter(Boolean))) as string[];
      if (assignedUserIds.length > 0) {
        const db = await getDb();
        if (db) {
          const members = await db
            .select({ ghlUserId: teamMembers.ghlUserId, name: teamMembers.name })
            .from(teamMembers)
            .where(and(
              eq(teamMembers.tenantId, tenantId),
              inArray(teamMembers.ghlUserId, assignedUserIds)
            ));
          const nameMap = new Map(members.map(m => [m.ghlUserId, m.name]));
          for (const apt of appointments) {
            if (apt.assignedUserId && nameMap.has(apt.assignedUserId)) {
              apt.assigneeName = nameMap.get(apt.assignedUserId)!;
            }
          }
        }
      }
    } catch (assigneeErr: any) {
      console.warn("[DayHub] Assignee name resolution failed (non-blocking):", assigneeErr?.message);
    }

    // Sort by start time — parse robustly to handle various date formats
    appointments.sort((a, b) => {
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();
      // If either is NaN, push it to the end
      if (isNaN(timeA) && isNaN(timeB)) return 0;
      if (isNaN(timeA)) return 1;
      if (isNaN(timeB)) return -1;
      return timeA - timeB;
    });
    // Cache the results
    appointmentCache.set(tenantId, { data: appointments, timestamp: Date.now() });
    console.log(`[DayHub] Appointments cached ${appointments.length} items for tenant ${tenantId}`);
    return appointments;
  } catch (error: any) {
    console.error("[DayHub] getTodayAppointments error:", error?.message);
    return [];
  }
}

// ─── DAILY KPI ENTRIES (Manual tracking) ──────────────────

export async function getDailyKpiEntries(
  tenantId: number,
  userId: number,
  date: string // YYYY-MM-DD
) {
  const db = await getDb();
  if (!db) return [];

  try {
    const entries = await db
      .select()
      .from(dailyKpiEntries)
      .where(
        and(
          eq(dailyKpiEntries.tenantId, tenantId),
          eq(dailyKpiEntries.userId, userId),
          eq(dailyKpiEntries.date, date)
        )
      );
    return entries;
  } catch (error) {
    console.error("[DayHub] getDailyKpiEntries error:", error);
    return [];
  }
}

export async function addDailyKpiEntry(
  tenantId: number,
  userId: number,
  date: string,
  kpiType: "call" | "conversation" | "appointment" | "offer" | "contract",
  data?: { contactId?: string; contactName?: string; propertyAddress?: string; notes?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [entry] = await db.insert(dailyKpiEntries).values({
    tenantId,
    userId,
    date,
    kpiType,
    contactId: data?.contactId || null,
    contactName: data?.contactName || null,
    propertyAddress: data?.propertyAddress || null,
    notes: data?.notes || null,
    source: "manual",
  }).returning({ id: dailyKpiEntries.id });

  return { id: entry.id, success: true };
}

export async function deleteDailyKpiEntry(
  tenantId: number,
  userId: number,
  entryId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(dailyKpiEntries)
    .where(
      and(
        eq(dailyKpiEntries.id, entryId),
        eq(dailyKpiEntries.tenantId, tenantId),
        eq(dailyKpiEntries.userId, userId)
      )
    );

  return { success: true };
}

export async function updateDailyKpiEntry(
  tenantId: number,
  userId: number,
  entryId: number,
  data: { contactName?: string; propertyAddress?: string; notes?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: Record<string, any> = {};
  if (data.contactName !== undefined) updates.contactName = data.contactName || null;
  if (data.propertyAddress !== undefined) updates.propertyAddress = data.propertyAddress || null;
  if (data.notes !== undefined) updates.notes = data.notes || null;

  if (Object.keys(updates).length === 0) return { success: true };

  await db
    .update(dailyKpiEntries)
    .set(updates)
    .where(
      and(
        eq(dailyKpiEntries.id, entryId),
        eq(dailyKpiEntries.tenantId, tenantId),
        eq(dailyKpiEntries.userId, userId)
      )
    );

  return { success: true };
}

/**
 * Get KPI summary counts for a user on a given date.
 * - calls/conversations: from calls table
 * - appointments/offers/contracts: from property_stage_history (matches Inventory)
 * - manual daily_kpi_entries supplement both categories
 */
export async function getKpiSummary(
  tenantId: number,
  userId: number,
  date: string,
  teamMemberId?: number | null,
  roleTab?: string
) {
  const db = await getDb();
  if (!db) return { calls: 0, conversations: 0, appointments: 0, offers: 0, contracts: 0 };

  try {
    const [year, month, day] = date.split("-").map(Number);
    const dayStartUTC = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
    const dayEndUTC = new Date(Date.UTC(year, month - 1, day + 1, 6, 0, 0));

    const roleToTeamRole: Record<string, string> = {
      lm: "lead_manager",
      am: "acquisition_manager",
      dispo: "dispo_manager",
    };

    let roleUserIds: number[] | null = null;
    let roleMemberIds: number[] | null = null;

    if (roleTab && roleTab !== "admin" && roleToTeamRole[roleTab]) {
      const roleMembers = await db
        .select({ id: teamMembers.id, mappedUserId: teamMembers.userId })
        .from(teamMembers)
        .where(and(
          eq(teamMembers.tenantId, tenantId),
          eq(teamMembers.teamRole, roleToTeamRole[roleTab] as any),
          eq(teamMembers.isActive, "true")
        ));
      roleMemberIds = roleMembers.map(m => m.id);
      roleUserIds = roleMembers.map(m => m.mappedUserId).filter((id): id is number => id !== null);

      if (roleMemberIds.length === 0) {
        return { calls: 0, conversations: 0, appointments: 0, offers: 0, contracts: 0 };
      }
    }

    // ─── CALLS & CONVERSATIONS (from calls table) ───
    const callConds = [
      eq(calls.tenantId, tenantId),
      gte(calls.callTimestamp, dayStartUTC),
      lt(calls.callTimestamp, dayEndUTC),
    ];

    if (roleMemberIds && roleMemberIds.length > 0) {
      callConds.push(inArray(calls.teamMemberId, roleMemberIds));
    } else if (teamMemberId && roleTab !== "admin") {
      callConds.push(eq(calls.teamMemberId, teamMemberId));
    }

    const [callsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(calls)
      .where(and(...callConds));
    const autoCalls = Number(callsResult?.count || 0);

    const [convosResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(calls)
      .where(and(...callConds, eq(calls.classification, "conversation")));
    const autoConvos = Number(convosResult?.count || 0);

    // ─── APPOINTMENTS / OFFERS / CONTRACTS (property_stage_history — single source of truth) ───
    const stageBase = [
      eq(propertyStageHistory.tenantId, tenantId),
      gte(propertyStageHistory.changedAt, dayStartUTC),
      lt(propertyStageHistory.changedAt, dayEndUTC),
    ];

    const countStage = async (toStatus: string): Promise<number> => {
      const conds = [...stageBase, eq(propertyStageHistory.toStatus, toStatus)];

      if (roleTab === "admin" || !roleTab) {
        const [r] = await db!
          .select({ count: sql<number>`COUNT(DISTINCT ${propertyStageHistory.propertyId})` })
          .from(propertyStageHistory)
          .where(and(...conds));
        return Number(r?.count || 0);
      }

      if (roleUserIds && roleUserIds.length > 0) {
        const assignedCol = roleTab === "am"
          ? dispoProperties.assignedAmUserId
          : dispoProperties.assignedLmUserId;

        const [r] = await db!
          .select({ count: sql<number>`COUNT(DISTINCT ${propertyStageHistory.propertyId})` })
          .from(propertyStageHistory)
          .innerJoin(dispoProperties, eq(propertyStageHistory.propertyId, dispoProperties.id))
          .where(and(
            ...conds,
            or(
              inArray(propertyStageHistory.changedByUserId, roleUserIds),
              and(isNull(propertyStageHistory.changedByUserId), inArray(assignedCol, roleUserIds))
            )
          ));
        return Number(r?.count || 0);
      }

      // Individual user viewing own stats
      const [r] = await db!
        .select({ count: sql<number>`COUNT(DISTINCT ${propertyStageHistory.propertyId})` })
        .from(propertyStageHistory)
        .where(and(...conds, eq(propertyStageHistory.changedByUserId, userId)));
      return Number(r?.count || 0);
    };

    const stageApts = await countStage("apt_set");
    const stageOffers = await countStage("offer_made");
    const stageContracts = await countStage("under_contract");

    // ─── MANUAL ENTRIES (scoped by role) ───
    const manual: Record<string, number> = {};
    try {
      const manualConds: any[] = [
        eq(dailyKpiEntries.tenantId, tenantId),
        eq(dailyKpiEntries.date, date),
      ];

      if (roleTab === "admin") {
        // admin sees all manual entries for the tenant
      } else if (roleUserIds && roleUserIds.length > 0) {
        manualConds.push(inArray(dailyKpiEntries.userId, roleUserIds));
      } else {
        manualConds.push(eq(dailyKpiEntries.userId, userId));
      }

      const manualEntries = await db
        .select({
          kpiType: dailyKpiEntries.kpiType,
          count: sql<number>`COUNT(*)`,
        })
        .from(dailyKpiEntries)
        .where(and(...manualConds))
        .groupBy(dailyKpiEntries.kpiType);

      for (const row of manualEntries) {
        manual[row.kpiType] = Number(row.count);
      }
    } catch (manualError) {
      console.error("[DayHub] Manual KPI query failed:", (manualError as any)?.message);
    }

    return {
      calls: autoCalls + (manual["call"] || 0),
      conversations: autoConvos + (manual["conversation"] || 0),
      appointments: stageApts + (manual["appointment"] || 0),
      offers: stageOffers + (manual["offer"] || 0),
      contracts: stageContracts + (manual["contract"] || 0),
      date,
    };
  } catch (error) {
    console.error("[DayHub] getKpiSummary error:", error);
    return { calls: 0, conversations: 0, appointments: 0, offers: 0, contracts: 0 };
  }
}

/**
 * Get all individual items counted toward a KPI for the ledger popup.
 * Returns auto-detected items (calls or stage transitions) plus manual entries,
 * with attribution info (who completed, when).
 */
export async function getKpiLedgerItems(
  tenantId: number,
  userId: number,
  date: string,
  kpiType: "call" | "conversation" | "appointment" | "offer" | "contract",
  teamMemberId?: number | null,
  roleTab?: string
) {
  const db = await getDb();
  if (!db) return { autoItems: [], manualItems: [] };

  try {
    const [year, month, day] = date.split("-").map(Number);
    const dayStartUTC = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
    const dayEndUTC = new Date(Date.UTC(year, month - 1, day + 1, 6, 0, 0));

    const roleToTeamRole: Record<string, string> = {
      lm: "lead_manager",
      am: "acquisition_manager",
      dispo: "dispo_manager",
    };

    let roleUserIds: number[] | null = null;
    let roleMemberIds: number[] | null = null;

    if (roleTab && roleTab !== "admin" && roleToTeamRole[roleTab]) {
      const roleMembers = await db
        .select({ id: teamMembers.id, mappedUserId: teamMembers.userId })
        .from(teamMembers)
        .where(and(
          eq(teamMembers.tenantId, tenantId),
          eq(teamMembers.teamRole, roleToTeamRole[roleTab] as any),
          eq(teamMembers.isActive, "true")
        ));
      roleMemberIds = roleMembers.map(m => m.id);
      roleUserIds = roleMembers.map(m => m.mappedUserId).filter((id): id is number => id !== null);
      if (roleMemberIds.length === 0) return { autoItems: [], manualItems: [] };
    }

    // ─── AUTO ITEMS ───
    let autoItems: Array<{
      id: number;
      source: "auto";
      contactName: string;
      contactPhone: string;
      teamMemberName: string;
      teamMemberRole?: string;
      timestamp: string;
      duration: number;
      grade: string | null;
      classification: string | null;
      callOutcome: string | null;
      detectionType: "auto" | "am_direct" | "webhook" | "app_manual";
      propertyAddress?: string;
    }> = [];

    if (kpiType === "call" || kpiType === "conversation") {
      // Calls & conversations from calls table
      const callConds = [
        eq(calls.tenantId, tenantId),
        gte(calls.callTimestamp, dayStartUTC),
        lt(calls.callTimestamp, dayEndUTC),
      ];

      if (roleMemberIds && roleMemberIds.length > 0) {
        callConds.push(inArray(calls.teamMemberId, roleMemberIds));
      } else if (teamMemberId && roleTab !== "admin") {
        callConds.push(eq(calls.teamMemberId, teamMemberId));
      }

      if (kpiType === "conversation") {
        callConds.push(eq(calls.classification, "conversation"));
      }

      const callRows = await db
        .select({
          id: calls.id,
          contactName: calls.contactName,
          contactPhone: calls.contactPhone,
          teamMemberId: calls.teamMemberId,
          callTimestamp: calls.callTimestamp,
          duration: calls.duration,
          overallGrade: callGrades.overallGrade,
          classification: calls.classification,
          callOutcome: calls.callOutcome,
        })
        .from(calls)
        .leftJoin(callGrades, eq(calls.id, callGrades.callId))
        .where(and(...callConds))
        .orderBy(sql`${calls.callTimestamp} DESC`)
        .limit(200);

      const memberIds = Array.from(new Set(callRows.map(r => r.teamMemberId).filter(Boolean))) as number[];
      const memberMap = new Map<number, { name: string; teamRole: string }>();
      if (memberIds.length > 0) {
        const members = await db
          .select({ id: teamMembers.id, name: teamMembers.name, teamRole: teamMembers.teamRole })
          .from(teamMembers)
          .where(inArray(teamMembers.id, memberIds));
        members.forEach(m => memberMap.set(m.id, { name: m.name, teamRole: m.teamRole }));
      }

      autoItems = callRows.map(r => {
        const member = r.teamMemberId ? memberMap.get(r.teamMemberId) : null;
        return {
          id: r.id,
          source: "auto" as const,
          contactName: r.contactName || "Unknown",
          contactPhone: r.contactPhone || "",
          teamMemberName: member?.name || "Unknown",
          teamMemberRole: member?.teamRole || undefined,
          timestamp: r.callTimestamp ? new Date(r.callTimestamp).toISOString() : "",
          duration: r.duration || 0,
          grade: r.overallGrade || null,
          classification: r.classification || null,
          callOutcome: r.callOutcome || null,
          detectionType: "auto" as const,
        };
      });
    } else {
      // Apts / Offers / Contracts from property_stage_history
      const statusMap: Record<string, string> = {
        appointment: "apt_set",
        offer: "offer_made",
        contract: "under_contract",
      };
      const targetStatus = statusMap[kpiType];

      const stageConds: any[] = [
        eq(propertyStageHistory.tenantId, tenantId),
        eq(propertyStageHistory.toStatus, targetStatus),
        gte(propertyStageHistory.changedAt, dayStartUTC),
        lt(propertyStageHistory.changedAt, dayEndUTC),
      ];

      if (roleTab !== "admin" && roleTab && roleUserIds && roleUserIds.length > 0) {
        const assignedCol = roleTab === "am"
          ? dispoProperties.assignedAmUserId
          : dispoProperties.assignedLmUserId;
        stageConds.push(
          or(
            inArray(propertyStageHistory.changedByUserId, roleUserIds),
            and(isNull(propertyStageHistory.changedByUserId), inArray(assignedCol, roleUserIds))
          )
        );
      } else if (roleTab !== "admin" && !roleUserIds) {
        stageConds.push(eq(propertyStageHistory.changedByUserId, userId));
      }

      const stageRows = await db
        .select({
          id: propertyStageHistory.id,
          propertyId: propertyStageHistory.propertyId,
          changedAt: propertyStageHistory.changedAt,
          stageSource: propertyStageHistory.source,
          address: dispoProperties.address,
          sellerName: dispoProperties.sellerName,
          sellerPhone: dispoProperties.sellerPhone,
          changedByName: users.name,
        })
        .from(propertyStageHistory)
        .innerJoin(dispoProperties, eq(propertyStageHistory.propertyId, dispoProperties.id))
        .leftJoin(users, eq(propertyStageHistory.changedByUserId, users.id))
        .where(and(...stageConds))
        .orderBy(sql`${propertyStageHistory.changedAt} DESC`)
        .limit(200);

      // Dedup by propertyId (keep most recent)
      const seen = new Set<number>();
      autoItems = stageRows
        .filter(r => {
          if (seen.has(r.propertyId)) return false;
          seen.add(r.propertyId);
          return true;
        })
        .map(r => ({
          id: r.id,
          source: "auto" as const,
          contactName: r.sellerName || "Unknown",
          contactPhone: r.sellerPhone || "",
          teamMemberName: r.changedByName || (r.stageSource === "webhook" ? "GHL Webhook" : "System"),
          timestamp: r.changedAt ? new Date(r.changedAt).toISOString() : "",
          duration: 0,
          grade: null,
          classification: null,
          callOutcome: targetStatus,
          detectionType: (r.stageSource === "webhook" ? "webhook" : r.stageSource === "manual" ? "app_manual" : "auto") as any,
          propertyAddress: r.address || undefined,
        }));
    }

    // ─── MANUAL ENTRIES (scoped by role, with attribution) ───
    const manualConds: any[] = [
      eq(dailyKpiEntries.tenantId, tenantId),
      eq(dailyKpiEntries.date, date),
      eq(dailyKpiEntries.kpiType, kpiType),
    ];

    if (roleTab === "admin") {
      // admin sees all
    } else if (roleUserIds && roleUserIds.length > 0) {
      manualConds.push(inArray(dailyKpiEntries.userId, roleUserIds));
    } else {
      manualConds.push(eq(dailyKpiEntries.userId, userId));
    }

    const manualRows = await db
      .select({
        id: dailyKpiEntries.id,
        contactName: dailyKpiEntries.contactName,
        propertyAddress: dailyKpiEntries.propertyAddress,
        notes: dailyKpiEntries.notes,
        createdAt: dailyKpiEntries.createdAt,
        addedByName: users.name,
      })
      .from(dailyKpiEntries)
      .leftJoin(users, eq(dailyKpiEntries.userId, users.id))
      .where(and(...manualConds))
      .orderBy(sql`${dailyKpiEntries.createdAt} DESC`);

    const manualItems = manualRows.map(r => ({
      id: r.id,
      source: "manual" as const,
      contactName: r.contactName || "",
      propertyAddress: r.propertyAddress || "",
      notes: r.notes || "",
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      addedByName: r.addedByName || "Unknown",
    }));

    return { autoItems, manualItems };
  } catch (error) {
    console.error("[DayHub] getKpiLedgerItems error:", error);
    return { autoItems: [], manualItems: [] };
  }
}
