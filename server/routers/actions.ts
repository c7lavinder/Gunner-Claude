import { z } from "zod";
import { eq } from "drizzle-orm";
import type { ActionType, ActionResult } from "@shared/types";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { tenants } from "../../drizzle/schema";
import { createCrmAdapter } from "../crm";
import { trackEvent } from "../services/eventTracking";

const ACTION_TYPES: ActionType[] = [
  "sms",
  "note",
  "task",
  "appointment",
  "stage_change",
  "workflow",
  "tag",
  "field_update",
  "check_off_task",
  "remove_workflow",
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
    let result: ActionResult;

    if (!ACTION_TYPES.includes(input.type as ActionType)) {
      result = {
        success: false,
        message: "Invalid action type",
        timestamp: new Date().toISOString(),
        error: "Invalid action type",
      } satisfies ActionResult;
      trackEvent({
        tenantId: ctx.user.tenantId,
        userId: ctx.user.userId,
        eventType: `action.${input.type}`,
        page: "action",
        metadata: { contactId: input.contactId, success: result.success },
      });
      return result;
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.user.tenantId));
    if (!tenant?.crmConfig || tenant.crmType === "none") {
      result = mockSuccess();
      trackEvent({
        tenantId: ctx.user.tenantId,
        userId: ctx.user.userId,
        eventType: `action.${input.type}`,
        page: "action",
        metadata: { contactId: input.contactId, success: result.success },
      });
      return result;
    }

    const config = tenant.crmConfig ? (JSON.parse(tenant.crmConfig) as Record<string, string>) : {};
    const adapter = createCrmAdapter(tenant.crmType ?? "ghl", config);
    const contactId = input.contactId;
    const payload = input.payload;
    const fromUserId = String(ctx.user.userId);

    switch (input.type) {
      case "sms":
        result = await adapter.sendSms(contactId, String(payload.message ?? ""), fromUserId);
        break;
      case "note":
        result = await adapter.addNote(contactId, String(payload.body ?? ""));
        break;
      case "task":
        result = await adapter.createTask({
          title: String(payload.title ?? ""),
          description: payload.description ? String(payload.description) : undefined,
          contactId,
          assignedTo: payload.assignedTo ? String(payload.assignedTo) : undefined,
          dueDate: payload.dueDate ? String(payload.dueDate) : undefined,
        });
        break;
      case "appointment":
        result = await adapter.createAppointment({
          contactId,
          title: String(payload.title ?? ""),
          startTime: String(payload.startTime ?? ""),
          assignedTo: payload.assignedTo ? String(payload.assignedTo) : undefined,
        });
        break;
      case "stage_change":
        result = await adapter.updateOpportunityStage(
          String(payload.opportunityId ?? ""),
          String(payload.stageId ?? "")
        );
        break;
      case "tag":
        result = await adapter.addTag(contactId, String(payload.tag ?? ""));
        break;
      case "field_update":
        result = await adapter.updateContactField(
          contactId,
          String(payload.field ?? ""),
          payload.value
        );
        break;
      case "workflow":
        result = await adapter.addToWorkflow(contactId, String(payload.workflowId ?? ""));
        break;
      case "check_off_task":
        result = await adapter.completeTask(String(payload.taskId ?? ""));
        break;
      case "remove_workflow":
        result = await adapter.removeFromWorkflow(contactId, String(payload.workflowId ?? ""));
        break;
      default:
        result = { success: false, message: `Unhandled action type: ${input.type}`, timestamp: new Date().toISOString() };
    }

    try {
      trackEvent({
        tenantId: ctx.user.tenantId,
        userId: ctx.user.userId,
        eventType: `action.${input.type}`,
        page: "action",
        metadata: { contactId: input.contactId, success: result.success },
      });
    } catch {
      /* never block */
    }
    return result;
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
