import { z } from "zod";
import { sql, eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { calls, contactCache, coachMessages } from "../../drizzle/schema";

const SEARCH_TYPES = ["calls", "contacts", "notes"] as const;
type SearchType = (typeof SEARCH_TYPES)[number];

export const searchRouter = router({
  global: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        types: z.array(z.enum(SEARCH_TYPES)).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.user;
      const types: SearchType[] = input.types ?? ["calls", "contacts", "notes"];
      const q = `%${input.query}%`;

      const [callResults, contactResults, noteResults] = await Promise.all([
        types.includes("calls")
          ? db
              .select({
                id: calls.id,
                label: calls.contactName,
                sub: calls.callType,
                createdAt: calls.createdAt,
              })
              .from(calls)
              .where(
                and(
                  eq(calls.tenantId, tenantId),
                  sql`(${calls.contactName} ILIKE ${q} OR ${calls.transcript} ILIKE ${q})`
                )
              )
              .limit(5)
          : Promise.resolve([]),

        types.includes("contacts")
          ? db
              .select({
                id: contactCache.id,
                label: contactCache.name,
                sub: contactCache.phone,
                ghlContactId: contactCache.ghlContactId,
                createdAt: sql<Date>`now()`,
              })
              .from(contactCache)
              .where(
                and(
                  eq(contactCache.tenantId, tenantId),
                  sql`(${contactCache.name} ILIKE ${q} OR ${contactCache.phone} ILIKE ${q})`
                )
              )
              .limit(5)
          : Promise.resolve([]),

        types.includes("notes")
          ? db
              .select({
                id: coachMessages.id,
                label: coachMessages.content,
                sub: sql<string>`'note'`,
                createdAt: coachMessages.createdAt,
              })
              .from(coachMessages)
              .where(
                and(
                  eq(coachMessages.tenantId, tenantId),
                  sql`${coachMessages.content} ILIKE ${q}`
                )
              )
              .limit(5)
          : Promise.resolve([]),
      ]);

      return {
        calls: callResults.map((r) => ({
          id: r.id,
          label: r.label ?? "Unknown contact",
          sub: r.sub ?? "",
          path: `/calls`,
          type: "call" as const,
        })),
        contacts: contactResults.map((r) => ({
          id: r.id,
          label: r.label ?? "Unknown",
          sub: r.sub ?? "",
          path: `/calls`,
          type: "contact" as const,
        })),
        notes: noteResults.map((r) => ({
          id: r.id,
          label: (r.label ?? "").slice(0, 80),
          sub: "",
          path: `/calls`,
          type: "note" as const,
        })),
      };
    }),
});
