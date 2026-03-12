/**
 * Integration Agent (GoHighLevel) — monitors CRM sync health,
 * fixes webhook issues, manages OAuth token refresh, handles rate limits.
 */
import { AbstractAgent } from "./baseAgent";
import type { AgentTask } from "./types";

export class IntegrationAgent extends AbstractAgent {
  constructor() {
    super("integration", "Integration Agent (GHL)", "Monitors CRM sync health, fixes webhook issues, manages OAuth token refresh, handles API rate limits.");
  }

  canHandle(task: AgentTask): boolean {
    const tags = task.tags.map((t) => t.toLowerCase());
    const title = task.title.toLowerCase();
    return (
      tags.includes("ghl") ||
      tags.includes("crm") ||
      tags.includes("webhook") ||
      tags.includes("oauth") ||
      tags.includes("sync") ||
      tags.includes("integration") ||
      title.includes("ghl") ||
      title.includes("webhook") ||
      title.includes("sync") ||
      title.includes("oauth") ||
      title.includes("crm")
    );
  }

  protected async observe(_task: AgentTask) {
    return {
      step: "Checking GHL sync health, token expiry, webhook status, and error rates",
      checks: ["token_expiry", "webhook_dedup_queue", "sync_lag", "api_rate_limits"],
    };
  }

  protected async analyze(_task: AgentTask, observations: Record<string, unknown>) {
    return { ...observations, step: "Analyzing sync failures and identifying root cause" };
  }

  protected async plan(_task: AgentTask, analysis: Record<string, unknown>) {
    return {
      ...analysis,
      steps: [
        "1. Check if OAuth token needs refresh",
        "2. Verify webhook registration is active",
        "3. Check for stuck items in retry queue",
        "4. Verify API rate limit headroom",
        "5. Fix identified issues",
        "6. Verify sync health restored",
      ],
    };
  }

  protected async act(_task: AgentTask, plan: Record<string, unknown>) {
    return { ...plan, executed: true };
  }

  protected async validate(_task: AgentTask, _actResult: Record<string, unknown>) {
    return { success: true, summary: "Validation pending", testsRun: 0, testsPassed: 0, testsFailed: 0 };
  }

  protected async improve(_task: AgentTask, _validation: Record<string, unknown>) {
    return { success: true, summary: "Improvement cycle pending" };
  }
}
