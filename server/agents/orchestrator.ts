/**
 * Orchestrator Agent — Central coordinator for all GunnerAI agents.
 *
 * Responsibilities:
 *  - Assigns tasks to the right agent based on task type + agent capability
 *  - Prevents conflicts (two agents editing the same file)
 *  - Monitors system health
 *  - Prioritizes task queue
 *  - Triggers agents on schedule or event
 */
import { nanoid } from "nanoid";
import type {
  AgentId,
  AgentTask,
  TaskPriority,
  BaseAgent,
  ActivityLogEntry,
  ControlRoomState,
  SystemHealth,
} from "./types";
import { agentRegistry } from "./registry";
import { memoryStore } from "../memory/store";

// ============ ACTIVITY LOG ============
const activityLog: ActivityLogEntry[] = [];
const MAX_LOG_ENTRIES = 500;

export function logActivity(agentId: AgentId, action: string, details: string, level: ActivityLogEntry["level"] = "info"): void {
  activityLog.unshift({
    id: nanoid(),
    agentId,
    action,
    details,
    timestamp: new Date().toISOString(),
    level,
  });
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.length = MAX_LOG_ENTRIES;
}

// ============ TASK QUEUE ============
const taskQueue: AgentTask[] = [];
const activeTasks = new Map<string, AgentTask>();
const lockedFiles = new Map<string, AgentId>(); // file → agent that owns it

export function createTask(opts: {
  title: string;
  description: string;
  priority: TaskPriority;
  affectedFiles?: string[];
  acceptanceCriteria?: string[];
  tags?: string[];
  parentTaskId?: string;
}): AgentTask {
  const task: AgentTask = {
    id: nanoid(),
    title: opts.title,
    description: opts.description,
    priority: opts.priority,
    status: "queued",
    assignedAgent: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    affectedFiles: opts.affectedFiles ?? [],
    acceptanceCriteria: opts.acceptanceCriteria ?? [],
    result: null,
    attempts: 0,
    maxAttempts: 3,
    parentTaskId: opts.parentTaskId ?? null,
    tags: opts.tags ?? [],
  };
  taskQueue.push(task);
  sortQueue();
  logActivity("orchestrator", "task_created", `Task "${task.title}" [${task.priority}]`);
  return task;
}

function sortQueue(): void {
  const priorityOrder: Record<TaskPriority, number> = {
    P0_CRITICAL: 0, P1_HIGH: 1, P2_MEDIUM: 2, P3_LOW: 3, P4_ENHANCEMENT: 4,
  };
  taskQueue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// ============ ASSIGNMENT LOGIC ============

function findBestAgent(task: AgentTask): BaseAgent | null {
  const agents = agentRegistry.getAll();
  for (const agent of agents) {
    if (agent.info.status !== "idle") continue;
    if (!agent.canHandle(task)) continue;
    // Check file lock conflicts
    const conflict = task.affectedFiles.some((f) => {
      const owner = lockedFiles.get(f);
      return owner && owner !== agent.info.id;
    });
    if (conflict) continue;
    return agent;
  }
  return null;
}

function lockFiles(agentId: AgentId, files: string[]): void {
  for (const f of files) lockedFiles.set(f, agentId);
}

function unlockFiles(agentId: AgentId): void {
  for (const [file, owner] of Array.from(lockedFiles.entries())) {
    if (owner === agentId) lockedFiles.delete(file);
  }
}

// ============ TASK EXECUTION ============

async function executeTask(agent: BaseAgent, task: AgentTask): Promise<void> {
  task.status = "assigned";
  task.assignedAgent = agent.info.id;
  task.startedAt = new Date().toISOString();
  task.attempts++;
  activeTasks.set(task.id, task);
  lockFiles(agent.info.id, task.affectedFiles);

  logActivity(agent.info.id, "task_started", `Started "${task.title}" (attempt ${task.attempts}/${task.maxAttempts})`);

  try {
    task.status = "running";
    const result = await agent.execute(task);
    task.result = result;

    if (result.success) {
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      logActivity(agent.info.id, "task_completed", `Completed "${task.title}" — ${result.testsRun} tests, ${result.testsPassed} passed`, "success");

      // Write to agent memory
      await memoryStore.write({
        type: "bug_fix",
        agentId: agent.info.id,
        title: task.title,
        content: result.summary,
        metadata: { filesChanged: result.filesChanged, duration: result.duration },
        relatedFiles: result.filesChanged,
        relatedTaskIds: [task.id],
        importance: task.priority === "P0_CRITICAL" ? 10 : task.priority === "P1_HIGH" ? 7 : 5,
      });
    } else if (task.attempts < task.maxAttempts) {
      // Retry
      task.status = "queued";
      task.assignedAgent = null;
      taskQueue.push(task);
      sortQueue();
      logActivity(agent.info.id, "task_retrying", `Retrying "${task.title}" (attempt ${task.attempts}/${task.maxAttempts})`, "warn");
    } else {
      task.status = "failed";
      task.completedAt = new Date().toISOString();
      logActivity(agent.info.id, "task_failed", `Failed "${task.title}" after ${task.maxAttempts} attempts: ${result.errors.join(", ")}`, "error");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    task.result = {
      success: false, summary: msg, filesChanged: [], testsRun: 0, testsPassed: 0, testsFailed: 0, errors: [msg], duration: 0,
    };
    task.status = "failed";
    task.completedAt = new Date().toISOString();
    logActivity(agent.info.id, "task_error", `Error on "${task.title}": ${msg}`, "error");
  } finally {
    unlockFiles(agent.info.id);
    activeTasks.delete(task.id);
  }
}

// ============ ORCHESTRATOR LOOP ============

let running = false;
let loopInterval: ReturnType<typeof setInterval> | null = null;

async function orchestratorTick(): Promise<void> {
  if (!running) return;

  // Process queued tasks
  const pending = taskQueue.filter((t) => t.status === "queued");
  for (const task of pending) {
    const agent = findBestAgent(task);
    if (!agent) continue;
    // Remove from queue
    const idx = taskQueue.indexOf(task);
    if (idx >= 0) taskQueue.splice(idx, 1);
    // Execute (non-blocking)
    void executeTask(agent, task);
  }
}

export function startOrchestrator(): void {
  if (running) return;
  running = true;
  loopInterval = setInterval(() => void orchestratorTick(), 5_000);
  logActivity("orchestrator", "started", "Orchestrator agent started");
  console.log("[orchestrator] Started — checking task queue every 5s");
}

export function stopOrchestrator(): void {
  running = false;
  if (loopInterval) clearInterval(loopInterval);
  logActivity("orchestrator", "stopped", "Orchestrator agent stopped");
}

// ============ CONTROL ROOM STATE ============

export function getControlRoomState(): ControlRoomState {
  const agents = agentRegistry.getAll().map((a) => a.getStatus());
  return {
    agents,
    taskQueue: [...taskQueue, ...Array.from(activeTasks.values())],
    recentActivity: activityLog.slice(0, 50),
    systemHealth: getSystemHealth(),
  };
}

function getSystemHealth(): SystemHealth {
  return {
    database: "healthy", // TODO: wire to actual health check
    redis: "healthy",
    crm: "connected",
    api: "healthy",
    queueDepth: {},
    errorRate: 0,
    uptime: process.uptime(),
  };
}

// ============ QUEUE JOB PROCESSOR ============

/** Called by BullMQ worker when an agent task job arrives */
export async function processAgentTask(data: Record<string, unknown>): Promise<void> {
  const task = data as unknown as AgentTask;
  if (!task.id) return;
  const agent = findBestAgent(task);
  if (agent) {
    await executeTask(agent, task);
  } else {
    // Re-queue if no agent available
    taskQueue.push(task);
    sortQueue();
  }
}
