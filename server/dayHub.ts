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
import { dailyKpiEntries, calls } from "../drizzle/schema";
import { eq, and, sql, gte, lt, inArray } from "drizzle-orm";

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
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
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
              // Tags (e.g., "Hot Lead", "Motivated Seller")
              if (c.tags && Array.isArray(c.tags) && c.tags.length > 0) {
                summaryParts.push(c.tags.slice(0, 3).join(", "));
              }
              // Pipeline stage
              const pipelineName = c.pipelineStage || c.opportunities?.[0]?.pipelineStageId || "";
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
  activitySummary: string; // Brief context: tags, pipeline stage, recent activity
}

/**
 * Fetch today's appointments for the location.
 */
export async function getTodayAppointments(
  tenantId: number
): Promise<TodayAppointment[]> {
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
              if (c.tags && Array.isArray(c.tags) && c.tags.length > 0) {
                summaryParts.push(c.tags.slice(0, 3).join(", "));
              }
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
              apt.activitySummary = summaryParts.join(" \u00b7 ");
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
  });

  return { id: (entry as any).insertId, success: true };
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

/**
 * Get KPI summary counts for a user on a given date.
 * Auto-counts from real call data + supplements with manual entries.
 * - calls: total calls in calls table for this tenant today
 * - conversations: calls classified as "conversation" today
 * - appointments: calls with callOutcome = "appointment_set" today
 * - offers: calls with callOutcome = "offer_made" today
 * - contracts: manual entries only (no auto-detection available)
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
    // Parse date string to get start/end of day in Central time
    const [year, month, day] = date.split("-").map(Number);
    // Create date range for the given date in CT (UTC-6)
    const dayStartUTC = new Date(Date.UTC(year, month - 1, day, 6, 0, 0)); // midnight CT = 6am UTC
    const dayEndUTC = new Date(Date.UTC(year, month - 1, day + 1, 6, 0, 0)); // next midnight CT

    // Build base conditions — always filter by tenant + date range
    const baseConditions = [
      eq(calls.tenantId, tenantId),
      gte(calls.callTimestamp, dayStartUTC),
      lt(calls.callTimestamp, dayEndUTC),
    ];

    // For non-admin views with a specific team member, filter by teamMemberId
    if (teamMemberId && roleTab !== "admin") {
      baseConditions.push(eq(calls.teamMemberId, teamMemberId));
    }

    // Auto-count from calls table — every single dial today
    console.log(`[DayHub KPI] Query params: tenantId=${tenantId}, date=${date}, teamMemberId=${teamMemberId}, roleTab=${roleTab}`);
    console.log(`[DayHub KPI] Date range: ${dayStartUTC.toISOString()} to ${dayEndUTC.toISOString()}`);
    const [autoCallsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(calls)
      .where(and(...baseConditions));
    const autoCalls = Number(autoCallsResult?.count || 0);
    console.log(`[DayHub KPI] Auto calls: ${autoCalls}`);

    // Auto-count conversations (classification = 'conversation')
    const [autoConvosResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(calls)
      .where(and(...baseConditions, eq(calls.classification, "conversation")));
    const autoConvos = Number(autoConvosResult?.count || 0);

    // Auto-count appointments set (callOutcome = 'appointment_set')
    const [autoAptsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(calls)
      .where(and(...baseConditions, eq(calls.callOutcome, "appointment_set")));
    const autoApts = Number(autoAptsResult?.count || 0);

    // Auto-count offers made (callOutcome = 'offer_made')
    const [autoOffersResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(calls)
      .where(and(...baseConditions, eq(calls.callOutcome, "offer_made")));
    const autoOffers = Number(autoOffersResult?.count || 0);

    // Manual entries (supplements for things like contracts that can't be auto-detected)
    const manual: Record<string, number> = {};
    try {
      const manualEntries = await db
        .select({
          kpiType: dailyKpiEntries.kpiType,
          count: sql<number>`COUNT(*)`,
        })
        .from(dailyKpiEntries)
        .where(
          and(
            eq(dailyKpiEntries.tenantId, tenantId),
            eq(dailyKpiEntries.userId, userId),
            eq(dailyKpiEntries.date, date)
          )
        )
        .groupBy(dailyKpiEntries.kpiType);

      for (const row of manualEntries) {
        manual[row.kpiType] = Number(row.count);
      }
    } catch (manualError) {
      console.error("[DayHub] Manual KPI entries query failed (non-fatal):", (manualError as any)?.message);
    }

    // Use auto-counts as the primary source, add manual entries for contracts
    return {
      calls: autoCalls + (manual["call"] || 0),
      conversations: autoConvos + (manual["conversation"] || 0),
      appointments: autoApts + (manual["appointment"] || 0),
      offers: autoOffers + (manual["offer"] || 0),
      contracts: manual["contract"] || 0, // contracts are manual-only
    };
  } catch (error) {
    console.error("[DayHub] getKpiSummary error:", error);
    console.error("[DayHub] getKpiSummary error stack:", (error as any)?.stack);
    return { calls: 0, conversations: 0, appointments: 0, offers: 0, contracts: 0 };
  }
}
