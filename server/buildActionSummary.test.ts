/**
 * Tests for the buildActionSummary logic used in CoachActivityLog.
 * This is a pure function that generates human-readable summaries from action data.
 * We replicate the function here since it lives in a client component.
 */
import { describe, it, expect } from "vitest";

// Replicate the buildActionSummary function from CoachActivityLog.tsx
function buildActionSummary(actionType: string, contactName?: string, payload?: any): string {
  const contact = contactName || "contact";
  
  switch (actionType) {
    case "change_pipeline_stage": {
      const stage = payload?.stageName || "new stage";
      return `Moved ${contact} → ${stage}`;
    }
    case "send_sms": {
      const msg = payload?.message;
      if (msg) {
        const preview = msg.length > 100 ? msg.substring(0, 100) + "..." : msg;
        return `Sent SMS to ${contact}: "${preview}"`;
      }
      return `Sent SMS to ${contact}`;
    }
    case "create_task": {
      const title = payload?.title || "task";
      return `Created task for ${contact}: "${title}"`;
    }
    case "update_task": {
      const title = payload?.title;
      const dueDate = payload?.dueDate;
      if (title && dueDate) {
        return `Updated task for ${contact}: "${title}" — due ${new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      }
      if (title) return `Updated task for ${contact}: "${title}"`;
      return `Updated task for ${contact}`;
    }
    case "add_note":
    case "add_note_contact":
    case "add_note_opportunity": {
      const body = payload?.noteBody;
      if (body) {
        const preview = body.length > 100 ? body.substring(0, 100) + "..." : body;
        return `Added note on ${contact}: "${preview}"`;
      }
      return `Added note on ${contact}`;
    }
    case "add_tag": {
      const tag = payload?.tags || payload?.tag || "tag";
      return `Added tag "${tag}" to ${contact}`;
    }
    case "remove_tag": {
      const tag = payload?.tags || payload?.tag || "tag";
      return `Removed tag "${tag}" from ${contact}`;
    }
    case "update_field": {
      const field = payload?.fieldName || payload?.field || "field";
      const value = payload?.fieldValue || payload?.value;
      if (value) return `Updated ${field} → "${value}" on ${contact}`;
      return `Updated ${field} on ${contact}`;
    }
    case "add_to_workflow": {
      const workflow = payload?.workflowName || payload?.workflow || "workflow";
      return `Added ${contact} to workflow: ${workflow}`;
    }
    case "remove_from_workflow": {
      const workflow = payload?.workflowName || payload?.workflow || "workflow";
      return `Removed ${contact} from workflow: ${workflow}`;
    }
    case "create_appointment": {
      const title = payload?.title || "appointment";
      return `Created appointment for ${contact}: "${title}"`;
    }
    case "update_appointment": {
      const title = payload?.title || "appointment";
      return `Updated appointment for ${contact}: "${title}"`;
    }
    case "cancel_appointment": {
      return `Cancelled appointment for ${contact}`;
    }
    default:
      return `${actionType.replace(/_/g, " ")} — ${contact}`;
  }
}

describe("buildActionSummary", () => {
  it("generates clear summary for pipeline stage change", () => {
    const result = buildActionSummary("change_pipeline_stage", "nina beasley", {
      stageName: "4 Month Follow Up",
    });
    expect(result).toBe("Moved nina beasley → 4 Month Follow Up");
  });

  it("generates clear summary for SMS with message preview", () => {
    const result = buildActionSummary("send_sms", "suzanne burgess", {
      message: "Hi Suzanne, is there any chance you have a property survey from when you bought the house?",
    });
    expect(result).toContain("Sent SMS to suzanne burgess:");
    expect(result).toContain("Hi Suzanne");
  });

  it("truncates long SMS messages at 100 chars", () => {
    const longMsg = "A".repeat(150);
    const result = buildActionSummary("send_sms", "test contact", {
      message: longMsg,
    });
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(200);
  });

  it("generates clear summary for task creation", () => {
    const result = buildActionSummary("create_task", "nina beasley", {
      title: "Follow up on offer - Nina Beasley",
    });
    expect(result).toBe('Created task for nina beasley: "Follow up on offer - Nina Beasley"');
  });

  it("generates clear summary for task update with title", () => {
    const result = buildActionSummary("update_task", "cindy page", {
      title: "pending",
    });
    expect(result).toBe('Updated task for cindy page: "pending"');
  });

  it("generates clear summary for note addition", () => {
    const result = buildActionSummary("add_note_contact", "john smith", {
      noteBody: "Seller is motivated, wants to close by end of month.",
    });
    expect(result).toContain("Added note on john smith:");
    expect(result).toContain("Seller is motivated");
  });

  it("generates clear summary for tag addition", () => {
    const result = buildActionSummary("add_tag", "jane doe", {
      tags: "hot-lead",
    });
    expect(result).toBe('Added tag "hot-lead" to jane doe');
  });

  it("generates clear summary for tag removal", () => {
    const result = buildActionSummary("remove_tag", "jane doe", {
      tags: "cold",
    });
    expect(result).toBe('Removed tag "cold" from jane doe');
  });

  it("generates clear summary for field update with value", () => {
    const result = buildActionSummary("update_field", "bob jones", {
      fieldName: "status",
      fieldValue: "active",
    });
    expect(result).toBe('Updated status → "active" on bob jones');
  });

  it("generates clear summary for appointment creation", () => {
    const result = buildActionSummary("create_appointment", "mike wilson", {
      title: "Walkthrough - 123 Main St",
    });
    expect(result).toBe('Created appointment for mike wilson: "Walkthrough - 123 Main St"');
  });

  it("generates clear summary for appointment cancellation", () => {
    const result = buildActionSummary("cancel_appointment", "mike wilson");
    expect(result).toBe("Cancelled appointment for mike wilson");
  });

  it("falls back to 'contact' when no contact name provided", () => {
    const result = buildActionSummary("change_pipeline_stage", undefined, {
      stageName: "Dead",
    });
    expect(result).toBe("Moved contact → Dead");
  });

  it("handles unknown action types gracefully", () => {
    const result = buildActionSummary("some_new_action", "test person");
    expect(result).toBe("some new action — test person");
  });

  it("handles SMS without message payload", () => {
    const result = buildActionSummary("send_sms", "john doe");
    expect(result).toBe("Sent SMS to john doe");
  });

  it("handles workflow actions", () => {
    const result = buildActionSummary("add_to_workflow", "jane smith", {
      workflowName: "Follow Up Sequence",
    });
    expect(result).toBe("Added jane smith to workflow: Follow Up Sequence");
  });

  it("handles remove from workflow", () => {
    const result = buildActionSummary("remove_from_workflow", "jane smith", {
      workflowName: "Drip Campaign",
    });
    expect(result).toBe("Removed jane smith from workflow: Drip Campaign");
  });

  it("handles note on opportunity", () => {
    const result = buildActionSummary("add_note_opportunity", "deal contact", {
      noteBody: "Offer accepted at $120k",
    });
    expect(result).toBe('Added note on deal contact: "Offer accepted at $120k"');
  });

  it("truncates long notes at 100 chars", () => {
    const longNote = "B".repeat(150);
    const result = buildActionSummary("add_note", "test", { noteBody: longNote });
    expect(result).toContain("...");
  });

  it("handles update_task with no payload", () => {
    const result = buildActionSummary("update_task", "cindy page");
    expect(result).toBe("Updated task for cindy page");
  });

  it("handles stage change with no stage name in payload", () => {
    const result = buildActionSummary("change_pipeline_stage", "test");
    expect(result).toBe("Moved test → new stage");
  });
});
