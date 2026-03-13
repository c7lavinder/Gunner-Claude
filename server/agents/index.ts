/**
 * Agent System — barrel export.
 * Importing this file registers all agents and starts the orchestrator.
 */
export { agentRegistry } from "./registry";
export { startOrchestrator, stopOrchestrator, createTask, getControlRoomState, processAgentTask } from "./orchestrator";
export { SKILL_REGISTRY, getSkillsForAgent } from "./skills/registry";
export type { AgentId, AgentTask, TaskPriority, ControlRoomState, AgentMemoryEntry } from "./types";

import { agentRegistry } from "./registry";
import { CodeRepairAgent } from "./codeRepairAgent";
import { TestingAgent } from "./testingAgent";
import { IntegrationAgent } from "./integrationAgent";
import { DevOpsAgent } from "./devopsAgent";
import { UIUXAgent } from "./uiuxAgent";
import { ProductOptimizationAgent } from "./productOptimizationAgent";
import { ArchitectureAgent } from "./architectureAgent";

/** Call this once at server startup to register all agents */
export function registerAllAgents(): void {
  agentRegistry.register(new CodeRepairAgent());
  agentRegistry.register(new TestingAgent());
  agentRegistry.register(new IntegrationAgent());
  agentRegistry.register(new DevOpsAgent());
  agentRegistry.register(new UIUXAgent());
  agentRegistry.register(new ProductOptimizationAgent());
  agentRegistry.register(new ArchitectureAgent());
  console.log("[agents] 7 agents registered (all stubs — no real execution)");
}
