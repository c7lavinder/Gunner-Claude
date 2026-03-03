/**
 * Task Center Service
 * 
 * Provides location-level task search from GHL, contact context enrichment,
 * and quick action execution for the Lead Command Center page.
 */

import {
  getCredentialsForTenant,
  ghlFetch,
} from "./ghlActions";
import { getDb } from "./db";
import { calls, callGrades, teamMembers } from "../drizzle/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";

// ─── TYPES ──────────────────────────────────────────────

export interface GHLTask {
  id: string;
  title: string;
  body?: string;
  assignedTo: string; // GHL user ID
  dueDate: string; // ISO date string
  completed: boolean;
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface TaskWithContext extends GHLTask {
  overdueDays: number;
  group: "overdue" | "today" | "upcoming";
  assignedMemberName?: string;
}

export interface TaskContactContext {
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  recentNotes: Array<{ id: string; body: string; dateAdded: string }>;
  lastCallSummary: string | null;
  lastCallDate: string | null;
  lastCallGrade: string | null;
  lastCallId: number | null;
}

// ─── TASK SEARCH ────────────────────────────────────────

/**
 * Search tasks at the location level from GHL.
 * Supports filtering by assignedTo (GHL user IDs) and completion status.
 */
export async function searchLocationTasks(
  tenantId: number,
  options: {
    assignedTo?: string[];
    completed?: boolean;
    query?: string;
    limit?: number;
    skip?: number;
  } = {}
): Promise<GHLTask[]> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const body: any = {
    limit: options.limit || 100,
    skip: options.skip || 0,
  };

  if (options.assignedTo && options.assignedTo.length > 0) {
    body.assignedTo = options.assignedTo;
  }
  if (options.completed !== undefined) {
    body.completed = options.completed;
  }
  if (options.query) {
    body.query = options.query;
  }

  try {
    const data = await ghlFetch(
      creds,
      `/locations/${creds.locationId}/tasks/search`,
      "POST",
      body
    );

    const tasks = data.tasks || [];
    return tasks.map((t: any) => ({
      id: t.id,
      title: t.title || t.name || "Untitled Task",
      body: t.body || t.description || "",
      assignedTo: t.assignedTo || "",
      dueDate: t.dueDate || "",
      completed: t.completed || false,
      contactId: t.contactId || "",
      contactName: t.contact
        ? `${t.contact.firstName || ""} ${t.contact.lastName || ""}`.trim() || t.contact.name || ""
        : "",
      contactPhone: t.contact?.phone || "",
      contactEmail: t.contact?.email || "",
    }));
  } catch (error: any) {
    console.error("[TaskCenter] searchLocationTasks error:", error?.message || error);
    // If the location-level search fails, return empty
    return [];
  }
}

/**
 * Enrich tasks with grouping (overdue/today/upcoming), overdue days,
 * and team member names.
 */
export function enrichTasks(
  tasks: GHLTask[],
  teamMemberMap: Map<string, string> // ghlUserId -> member name
): TaskWithContext[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  return tasks
    .map((task) => {
      const dueDate = task.dueDate ? new Date(task.dueDate) : null;
      let group: "overdue" | "today" | "upcoming" = "upcoming";
      let overdueDays = 0;

      if (dueDate) {
        if (dueDate < todayStart) {
          group = "overdue";
          overdueDays = Math.ceil(
            (todayStart.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );
        } else if (dueDate < todayEnd) {
          group = "today";
        } else {
          group = "upcoming";
        }
      }

      return {
        ...task,
        overdueDays,
        group,
        assignedMemberName: teamMemberMap.get(task.assignedTo) || undefined,
      };
    })
    .sort((a, b) => {
      // Sort: overdue first (most overdue at top), then today, then upcoming
      const groupOrder = { overdue: 0, today: 1, upcoming: 2 };
      if (groupOrder[a.group] !== groupOrder[b.group]) {
        return groupOrder[a.group] - groupOrder[b.group];
      }
      // Within same group, sort by due date ascending
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return aDate - bDate;
    });
}

// ─── CONTACT CONTEXT ────────────────────────────────────

/**
 * Get contact notes from GHL
 */
export async function getContactNotes(
  tenantId: number,
  contactId: string,
  limit: number = 5
): Promise<Array<{ id: string; body: string; dateAdded: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    const data = await ghlFetch(
      creds,
      `/contacts/${contactId}/notes`,
      "GET"
    );
    const notes = data.notes || [];
    return notes
      .slice(0, limit)
      .map((n: any) => ({
        id: n.id,
        body: n.body || "",
        dateAdded: n.dateAdded || n.createdAt || "",
      }));
  } catch (error) {
    console.error("[TaskCenter] getContactNotes error:", error);
    return [];
  }
}

/**
 * Get the last graded call summary for a contact from Gunner's database.
 */
export async function getLastCallSummary(
  tenantId: number,
  ghlContactId: string
): Promise<{
  summary: string | null;
  callDate: string | null;
  grade: string | null;
  callId: number | null;
} | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select({
        callId: calls.id,
        createdAt: calls.createdAt,
        summary: callGrades.summary,
        grade: callGrades.overallGrade,
      })
      .from(calls)
      .leftJoin(callGrades, eq(callGrades.callId, calls.id))
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, ghlContactId),
          eq(calls.status, "completed")
        )
      )
      .orderBy(desc(calls.createdAt))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return {
      summary: row.summary || null,
      callDate: row.createdAt ? row.createdAt.toISOString() : null,
      grade: row.grade || null,
      callId: row.callId,
    };
  } catch (error) {
    console.error("[TaskCenter] getLastCallSummary error:", error);
    return null;
  }
}

/**
 * Get full context for a task's contact: notes, last call summary, contact details.
 */
export async function getTaskContactContext(
  tenantId: number,
  contactId: string
): Promise<TaskContactContext> {
  const { getContact } = await import("./ghlActions");

  // Fetch in parallel
  const [contact, notes, lastCall] = await Promise.all([
    getContact(tenantId, contactId),
    getContactNotes(tenantId, contactId, 5),
    getLastCallSummary(tenantId, contactId),
  ]);

  return {
    contactId,
    contactName: contact?.name || "Unknown",
    contactPhone: contact?.phone || "",
    contactEmail: contact?.email || "",
    recentNotes: notes,
    lastCallSummary: lastCall?.summary || null,
    lastCallDate: lastCall?.callDate || null,
    lastCallGrade: lastCall?.grade || null,
    lastCallId: lastCall?.callId || null,
  };
}

// ─── TEAM MEMBER MAPPING ────────────────────────────────

/**
 * Build a map of GHL user ID -> team member name for a tenant.
 */
export async function getTeamMemberGhlMap(
  tenantId: number
): Promise<Map<string, string>> {
  const db = await getDb();
  if (!db) return new Map();

  try {
    const members = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        ghlUserId: teamMembers.ghlUserId,
      })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.tenantId, tenantId),
          isNotNull(teamMembers.ghlUserId)
        )
      );

    const map = new Map<string, string>();
    for (const m of members) {
      if (m.ghlUserId) {
        map.set(m.ghlUserId, m.name);
      }
    }
    return map;
  } catch (error) {
    console.error("[TaskCenter] getTeamMemberGhlMap error:", error);
    return new Map();
  }
}

/**
 * Get the list of team members with their GHL user IDs for the filter dropdown.
 */
export async function getTeamMembersForFilter(
  tenantId: number
): Promise<Array<{ id: number; name: string; ghlUserId: string | null }>> {
  const db = await getDb();
  if (!db) return [];

  try {
    const members = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        ghlUserId: teamMembers.ghlUserId,
      })
      .from(teamMembers)
      .where(eq(teamMembers.tenantId, tenantId));

    return members.map((m) => ({
      id: m.id,
      name: m.name,
      ghlUserId: m.ghlUserId,
    }));
  } catch (error) {
    console.error("[TaskCenter] getTeamMembersForFilter error:", error);
    return [];
  }
}
