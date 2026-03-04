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
import { dailyKpiEntries } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

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
export const AM_TARGETS: KpiTarget = { calls: 40, conversations: 4, appointments: 1 };

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
  lastMessage: string;
  lastMessageAt: string;
  type: "sms" | "call" | "email" | "other";
  isMissedCall: boolean;
  assignedTo: string;
  teamPhone: string; // The LC phone number the lead contacted (from last inbound message)
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
        lastMessage: conv.lastMessageBody || conv.lastMessage || "",
        lastMessageAt: conv.lastMessageDate || conv.dateUpdated || conv.dateAdded || "",
        type,
        isMissedCall,
        assignedTo: conv.assignedTo || conv.userId || "",
        teamPhone: "",
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
          });
        }
      } catch (err) {
        console.error(`[DayHub] Error fetching calendar ${cal.id}:`, err);
      }
    }

    // Enrich appointments with contact info from local cache when GHL doesn't provide it
    const contactIdsToEnrich = appointments
      .filter(apt => apt.contactId && (apt.contactName === "Unknown" || !apt.address))
      .map(apt => apt.contactId);

    if (contactIdsToEnrich.length > 0) {
      try {
        const db = await getDb();
        if (db) {
          const { contactCache } = await import("../drizzle/schema");
          const { inArray } = await import("drizzle-orm");
          const cachedContacts = await db.select().from(contactCache).where(
            and(
              eq(contactCache.tenantId, tenantId),
              inArray(contactCache.ghlContactId, contactIdsToEnrich)
            )
          );
          const cacheMap = new Map(cachedContacts.map(c => [c.ghlContactId, c]));
          for (const apt of appointments) {
            const cached = cacheMap.get(apt.contactId);
            if (!cached) continue;
            if (apt.contactName === "Unknown" && cached.name) {
              apt.contactName = toTitleCase(cached.name);
            } else if (apt.contactName === "Unknown" && cached.firstName) {
              apt.contactName = toTitleCase(`${cached.firstName} ${cached.lastName || ""}`.trim());
            }
            if (!apt.address && cached.address) {
              apt.address = cached.address;
            }
            if (!apt.contactPhone && cached.phone) {
              apt.contactPhone = cached.phone;
            }
          }
        }
      } catch (enrichErr: any) {
        console.warn("[DayHub] Failed to enrich appointments from cache:", enrichErr?.message);
      }
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
 * Combines auto-detected counts with manual entries.
 */
export async function getKpiSummary(
  tenantId: number,
  userId: number,
  date: string
) {
  const db = await getDb();
  if (!db) return { calls: 0, conversations: 0, appointments: 0, offers: 0, contracts: 0 };

  try {
    const entries = await db
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

    const counts: Record<string, number> = {};
    for (const row of entries) {
      counts[row.kpiType] = Number(row.count);
    }

    return {
      calls: counts["call"] || 0,
      conversations: counts["conversation"] || 0,
      appointments: counts["appointment"] || 0,
      offers: counts["offer"] || 0,
      contracts: counts["contract"] || 0,
    };
  } catch (error) {
    console.error("[DayHub] getKpiSummary error:", error);
    return { calls: 0, conversations: 0, appointments: 0, offers: 0, contracts: 0 };
  }
}
