/**
 * GunnerAI Agent System — Type Definitions
 *
 * Every agent in the system implements the BaseAgent interface.
 * The Orchestrator coordinates all agents via the task queue.
 */

// ============ AGENT IDENTITY ============

export type AgentId =
  | "orchestrator"
  | "code-repair"
  | "testing"
  | "integration"
  | "devops"
  | "ui-ux"
  | "product-optimization"
  | "architecture";

export type AgentStatus = "idle" | "running" | "error" | "disabled";

export interface AgentInfo {
  id: AgentId;
  name: string;
  description: string;
  status: AgentStatus;
  currentTask: string | null;
  progress: number; // 0-100
  lastRunAt: string | null;
  tasksCompleted: number;
  tasksFailed: number;
}

// ============ TASK SYSTEM ============

export type TaskPriority = "P0_CRITICAL" | "P1_HIGH" | "P2_MEDIUM" | "P3_LOW" | "P4_ENHANCEMENT";

export type TaskStatus = "queued" | "assigned" | "running" | "validating" | "completed" | "failed" | "rolled_back";

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedAgent: AgentId | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Files this task touches */
  affectedFiles: string[];
  /** Acceptance criteria — task is done when all pass */
  acceptanceCriteria: string[];
  /** Results from the agent */
  result: TaskResult | null;
  /** Number of attempts made */
  attempts: number;
  maxAttempts: number;
  /** Parent task ID if this is a subtask */
  parentTaskId: string | null;
  /** Tags for filtering */
  tags: string[];
}

export interface TaskResult {
  success: boolean;
  summary: string;
  filesChanged: string[];
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  errors: string[];
  duration: number; // ms
}

// ============ AGENT OPERATING LOOP ============

/**
 * Every agent follows this 7-step loop:
 * Observe → Analyze → Plan → Act → Validate → Improve → Repeat
 */
export interface AgentLoopStep {
  step: "observe" | "analyze" | "plan" | "act" | "validate" | "improve" | "complete";
  timestamp: string;
  description: string;
  data?: Record<string, unknown>;
}

// ============ AGENT MEMORY ============

export type MemoryType =
  | "architecture_decision"
  | "bug_report"
  | "bug_fix"
  | "experiment"
  | "tool_evaluation"
  | "pattern_learned"
  | "regression_detected";

export interface AgentMemoryEntry {
  id: string;
  type: MemoryType;
  agentId: AgentId;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  relatedFiles: string[];
  relatedTaskIds: string[];
  createdAt: string;
  /** Importance score 1-10, higher = more important to remember */
  importance: number;
}

// ============ AGENT SKILLS ============

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  /** Which agents can use this skill */
  availableTo: AgentId[];
  /** The tool/library this skill wraps */
  toolName: string;
  toolVersion: string;
  toolDocs: string;
  /** Whether this skill has been verified as production-ready */
  verified: boolean;
}

// ============ AGENT INTERFACE ============

export interface BaseAgent {
  info: AgentInfo;
  /** Initialize the agent (load skills, connect to services) */
  init(): Promise<void>;
  /** Check if the agent can handle a given task */
  canHandle(task: AgentTask): boolean;
  /** Execute a task following the operating loop */
  execute(task: AgentTask): Promise<TaskResult>;
  /** Get the agent's current status */
  getStatus(): AgentInfo;
  /** Gracefully stop the agent */
  shutdown(): Promise<void>;
}

// ============ CONTROL ROOM ============

export interface ControlRoomState {
  agents: AgentInfo[];
  taskQueue: AgentTask[];
  recentActivity: ActivityLogEntry[];
  systemHealth: SystemHealth;
}

export interface ActivityLogEntry {
  id: string;
  agentId: AgentId;
  action: string;
  details: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
}

export interface SystemHealth {
  database: "healthy" | "degraded" | "down";
  redis: "healthy" | "degraded" | "down";
  crm: "connected" | "degraded" | "disconnected";
  api: "healthy" | "degraded" | "down";
  queueDepth: Record<string, number>;
  errorRate: number; // errors per minute
  uptime: number; // seconds
}
