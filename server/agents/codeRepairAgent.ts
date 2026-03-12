/**
 * Code Repair Agent — detects, reproduces, and fixes bugs.
 * Follows TEST-FIRST debugging: write failing test → fix code → verify test passes.
 */
import { AbstractAgent } from "./baseAgent";
import type { AgentTask } from "./types";

export class CodeRepairAgent extends AbstractAgent {
  constructor() {
    super("code-repair", "Code Repair Agent", "Detects and fixes bugs using test-first methodology. Refactors code, resolves TypeScript errors, manages dependencies.");
  }

  canHandle(task: AgentTask): boolean {
    const tags = task.tags.map((t) => t.toLowerCase());
    const title = task.title.toLowerCase();
    return (
      tags.includes("bug") ||
      tags.includes("fix") ||
      tags.includes("refactor") ||
      tags.includes("typescript") ||
      title.includes("bug") ||
      title.includes("fix") ||
      title.includes("error") ||
      title.includes("refactor")
    );
  }

  protected async observe(task: AgentTask) {
    // Read the affected files, recent error logs, related bug history
    return {
      affectedFiles: task.affectedFiles,
      description: task.description,
      step: "Reading affected files and error context",
    };
  }

  protected async analyze(_task: AgentTask, observations: Record<string, unknown>) {
    // Identify root cause from error patterns
    return {
      ...observations,
      rootCause: "Pending analysis — will be determined by Claude Code execution",
      step: "Analyzing error patterns and identifying root cause",
    };
  }

  protected async plan(_task: AgentTask, analysis: Record<string, unknown>) {
    // TEST-FIRST: Plan starts with writing a failing test
    return {
      ...analysis,
      steps: [
        "1. Write a test that reproduces the bug",
        "2. Confirm the test fails",
        "3. Implement the minimal fix",
        "4. Run the test — confirm it passes",
        "5. Run full test suite — confirm no regressions",
        "6. Run npx tsc --noEmit — confirm 0 type errors",
      ],
    };
  }

  protected async act(_task: AgentTask, plan: Record<string, unknown>) {
    // This is where Claude Code would execute the actual fix
    return {
      ...plan,
      executed: true,
      note: "Execution delegated to Claude Code runtime",
    };
  }

  protected async validate(_task: AgentTask, _actResult: Record<string, unknown>) {
    return {
      success: true,
      summary: "Validation pending — requires Claude Code execution context",
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
    };
  }

  protected async improve(_task: AgentTask, _validation: Record<string, unknown>) {
    return { success: true, summary: "Improvement cycle pending" };
  }
}
