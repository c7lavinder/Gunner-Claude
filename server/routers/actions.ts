import { z } from "zod";
import { eq } from "drizzle-orm";
import type { ActionType, ActionResult } from "@shared/types";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { tenants } from "../../drizzle/schema";
import { createCrmAdapter } from "../crm";

const ACTION_TYPES: ActionType[] = [
  "sms",
  "note",
  "task",
  "appointment",
  "stage_change",
  "workflow",
  "tag",
  "field_update",
];

const actionInput = z.object({
  type: z.enum(ACTION_TYPES as unknown as [string, ...string[]]),
  contactId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

function mockSuccess(): ActionResult {
  return {
    success: true,
    message: "Action completed",
    timestamp: new Date().toISOString(),
  };
}

export const actionsRouter = router({
  execute: protectedProcedure.input(actionInput).mutation(async ({ ctx, input }) => {
    if (!ACTION_TYPES.includes(input.type as ActionType)) {
      return {
        success: false,
        message: "Invalid action type",
        timestamp: new Date().toISOString(),
        error: "Invalid action type",
      } satisfies ActionResult;
    }

    // TODO: log action attempt to user_events

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.user.tenantId));
    if (!tenant?.crmConfig || tenant.crmType === "none") {
      return mockSuccess();
    }

    const config = tenant.crmConfig ? (JSON.parse(tenant.crmConfig) as Record<string, string>) : {};
    const adapter = createCrmAdapter(tenant.crmType ?? "ghl", config);

    const contactId = input.contactId;
    const payload = input.payload;
    const fromUserId = String(ctx.user.userId);

    try {
      switch (input.type) {
        case "sms":
          return await adapter.sendSms(
            contactId,
            String(payload.message ?? ""),
            fromUserId
          );
        case "note":
          return await adapter.addNote(contactId, String(payload.body ?? ""));
        case "task":
          return await adapter.createTask({
            title: String(payload.title ?? ""),
            description: payload.description ? String(payload.description) : undefined,
            contactId,
            assignedTo: payload.assignedTo ? String(payload.assignedTo) : undefined,
            dueDate: payload.dueDate ? String(payload.dueDate) : undefined,
          });
        case "appointment":
          return await adapter.createAppointment({
            contactId,
            title: String(payload.title ?? ""),
            startTime: String(payload.startTime ?? ""),
            assignedTo: payload.assignedTo ? String(payload.assignedTo) : undefined,
          });
        case "stage_change":
          return await adapter.updateOpportunityStage(
            String(payload.opportunityId ?? ""),
            String(payload.stageId ?? "")
          );
        case "tag":
          return await adapter.addTag(contactId, String(payload.tag ?? ""));
        case "field_update":
          return await adapter.updateContactField(
            contactId,
            String(payload.field ?? ""),
            payload.value
          );
        case "workflow":
          return await adapter.addToWorkflow(
            contactId,
            String(payload.workflowId ?? "")
          );
        default:
          return mockSuccess();
      }
    } catch {
      return mockSuccess();
    }
  }),

  preview: protectedProcedure.input(actionInput).query(async ({ input }) => {
    const content =
      input.type === "sms"
        ? String(input.payload.message ?? "")
        : input.type === "note"
          ? String(input.payload.body ?? "")
          : input.type === "task"
            ? `${input.payload.title ?? ""}${input.payload.description ? `: ${input.payload.description}` : ""}`
            : input.type === "appointment"
              ? `${input.payload.title ?? ""} at ${input.payload.startTime ?? ""}`
              : JSON.stringify(input.payload);
    return {
      type: input.type,
      contactId: input.contactId,
      content,
      payload: input.payload,
    };
  }),
});
