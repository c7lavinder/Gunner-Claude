/**
 * Control Room Router — tRPC endpoints for the agent monitoring dashboard.
 * Admin-only access.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/context";
import { getControlRoomState, createTask } from "../agents/orchestrator";
import { memoryStore } from "../memory/store";
import { QUEUE_NAMES } from "../queues/queues";
import { getSkillsForAgent, SKILL_REGISTRY } from "../agents/skills/registry";
import type { TaskPriority } from "../agents/types";

export const controlRoomRouter = router({
  /** Get full control room state: agents, tasks, activity, health */
  getState: protectedProcedure.query(async () => {
    return getControlRoomState();
  }),

  /** Create a new task for the agent system */
  createTask: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        priority: z.enum(["P0_CRITICAL", "P1_HIGH", "P2_MEDIUM", "P3_LOW", "P4_ENHANCEMENT"]),
        tags: z.array(z.string()).optional(),
        affectedFiles: z.array(z.string()).optional(),
        acceptanceCriteria: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const task = createTask({
        title: input.title,
        description: input.description,
        priority: input.priority as TaskPriority,
        tags: input.tags,
        affectedFiles: input.affectedFiles,
        acceptanceCriteria: input.acceptanceCriteria,
      });
      return task;
    }),

  /** Get agent memory entries */
  getMemory: protectedProcedure
    .input(
      z.object({
        type: z.string().optional(),
        agentId: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      if (input.search) return memoryStore.search(input.search, input.limit);
      if (input.type) return memoryStore.queryByType(input.type as never, input.limit);
      if (input.agentId) return memoryStore.queryByAgent(input.agentId as never, input.limit);
      return memoryStore.getAll(input.limit);
    }),

  /** Get the approved skill/tool registry */
  getSkillRegistry: protectedProcedure.query(async () => {
    return SKILL_REGISTRY;
  }),

  /** Get skills for a specific agent */
  getAgentSkills: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ input }) => {
      return getSkillsForAgent(input.agentId);
    }),

  /** Get queue names for monitoring */
  getQueueNames: protectedProcedure.query(async () => {
    return QUEUE_NAMES;
  }),
});
