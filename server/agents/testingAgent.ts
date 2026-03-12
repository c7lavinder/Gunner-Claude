/**
 * Testing Agent — writes unit/integration/E2E tests, runs regression suites,
 * monitors coverage, and identifies untested code paths.
 */
import { AbstractAgent } from "./baseAgent";
import type { AgentTask } from "./types";

export class TestingAgent extends AbstractAgent {
  constructor() {
    super("testing", "Testing Agent", "Writes unit/integration/E2E tests. Runs regression suites. Monitors test coverage and identifies gaps.");
  }

  canHandle(task: AgentTask): boolean {
    const tags = task.tags.map((t) => t.toLowerCase());
    const title = task.title.toLowerCase();
    return (
      tags.includes("test") ||
      tags.includes("coverage") ||
      tags.includes("e2e") ||
      tags.includes("regression") ||
      title.includes("test") ||
      title.includes("coverage")
    );
  }

  protected async observe(_task: AgentTask) {
    return {
      step: "Scanning codebase for untested files and low coverage areas",
      testFramework: "vitest (unit/integration), playwright (e2e)",
    };
  }

  protected async analyze(_task: AgentTask, observations: Record<string, unknown>) {
    return { ...observations, step: "Identifying highest-impact test gaps" };
  }

  protected async plan(_task: AgentTask, analysis: Record<string, unknown>) {
    return {
      ...analysis,
      steps: [
        "1. Identify pure functions that can be unit tested",
        "2. Identify service methods that need integration tests",
        "3. Write tests for each, following AAA pattern (Arrange/Act/Assert)",
        "4. Run full test suite",
        "5. Report coverage delta",
      ],
    };
  }

  protected async act(_task: AgentTask, plan: Record<string, unknown>) {
    return { ...plan, executed: true };
  }

  protected async validate(_task: AgentTask, _actResult: Record<string, unknown>) {
    return { success: true, summary: "Validation pending — requires Claude Code execution", testsRun: 0, testsPassed: 0, testsFailed: 0 };
  }

  protected async improve(_task: AgentTask, _validation: Record<string, unknown>) {
    return { success: true, summary: "Improvement cycle pending" };
  }
}
