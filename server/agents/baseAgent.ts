/**
 * AbstractAgent — base class every agent extends.
 * Implements the 7-step operating loop: Observe → Analyze → Plan → Act → Validate → Improve → Complete
 */
import type { AgentInfo, AgentTask, TaskResult, BaseAgent, AgentLoopStep, AgentId } from "./types";
import { logActivity } from "./orchestrator";

export abstract class AbstractAgent implements BaseAgent {
  info: AgentInfo;
  protected loopHistory: AgentLoopStep[] = [];

  constructor(id: AgentId, name: string, description: string) {
    this.info = {
      id,
      name,
      description,
      status: "idle",
      currentTask: null,
      progress: 0,
      lastRunAt: null,
      tasksCompleted: 0,
      tasksFailed: 0,
    };
  }

  async init(): Promise<void> {
    this.info.status = "idle";
  }

  abstract canHandle(task: AgentTask): boolean;

  async execute(task: AgentTask): Promise<TaskResult> {
    this.info.status = "running";
    this.info.currentTask = task.title;
    this.info.progress = 0;
    this.loopHistory = [];
    const startTime = Date.now();

    try {
      // Step 1: Observe
      this.logStep("observe", "Reading current system state");
      this.info.progress = 10;
      const observations = await this.observe(task);

      // Step 2: Analyze
      this.logStep("analyze", "Identifying what needs attention");
      this.info.progress = 25;
      const analysis = await this.analyze(task, observations);

      // Step 3: Plan
      this.logStep("plan", "Designing the fix with minimal blast radius");
      this.info.progress = 40;
      const plan = await this.plan(task, analysis);

      // Step 4: Act
      this.logStep("act", "Implementing the change");
      this.info.progress = 60;
      const actResult = await this.act(task, plan);

      // Step 5: Validate
      this.logStep("validate", "Running tests and type-check");
      this.info.progress = 80;
      const validation = await this.validate(task, actResult);

      // Step 6: Improve (if validation found issues, retry once)
      if (!validation.success && task.attempts < task.maxAttempts) {
        this.logStep("improve", "Refining based on validation feedback");
        this.info.progress = 90;
        const improved = await this.improve(task, validation);
        if (improved.success) {
          this.logStep("complete", "Task completed after improvement");
        }
        return this.buildResult(improved.success, improved.summary, startTime, improved);
      }

      // Step 7: Complete
      this.logStep("complete", validation.success ? "Task completed successfully" : "Task failed validation");
      this.info.progress = 100;
      return this.buildResult(validation.success, validation.summary, startTime, validation);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.buildResult(false, msg, startTime);
    } finally {
      this.info.status = "idle";
      this.info.currentTask = null;
      this.info.progress = 0;
      this.info.lastRunAt = new Date().toISOString();
    }
  }

  getStatus(): AgentInfo {
    return { ...this.info };
  }

  async shutdown(): Promise<void> {
    this.info.status = "disabled";
  }

  // ============ LOOP STEPS (override in each agent) ============

  /** Read system state relevant to the task */
  protected abstract observe(task: AgentTask): Promise<Record<string, unknown>>;

  /** Analyze observations and identify what needs to change */
  protected abstract analyze(task: AgentTask, observations: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Create a plan for the change */
  protected abstract plan(task: AgentTask, analysis: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Execute the plan */
  protected abstract act(task: AgentTask, plan: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Validate the change (run tests, type-check) */
  protected abstract validate(task: AgentTask, actResult: Record<string, unknown>): Promise<{ success: boolean; summary: string; testsRun?: number; testsPassed?: number; testsFailed?: number }>;

  /** Improve if validation failed */
  protected abstract improve(task: AgentTask, validation: Record<string, unknown>): Promise<{ success: boolean; summary: string }>;

  // ============ HELPERS ============

  protected logStep(step: AgentLoopStep["step"], description: string, data?: Record<string, unknown>): void {
    this.loopHistory.push({ step, timestamp: new Date().toISOString(), description, data });
    logActivity(this.info.id, step, description);
  }

  private buildResult(success: boolean, summary: string, startTime: number, extra?: Record<string, unknown>): TaskResult {
    if (success) this.info.tasksCompleted++;
    else this.info.tasksFailed++;
    return {
      success,
      summary,
      filesChanged: (extra?.filesChanged as string[]) ?? [],
      testsRun: (extra?.testsRun as number) ?? 0,
      testsPassed: (extra?.testsPassed as number) ?? 0,
      testsFailed: (extra?.testsFailed as number) ?? 0,
      errors: success ? [] : [summary],
      duration: Date.now() - startTime,
    };
  }
}
