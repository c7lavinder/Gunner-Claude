/**
 * Agent Registry — singleton that holds all agent instances.
 * Agents register themselves on init. The orchestrator queries the registry
 * to find available agents for task assignment.
 */
import type { AgentId, BaseAgent } from "./types";

class AgentRegistry {
  private agents = new Map<AgentId, BaseAgent>();

  register(agent: BaseAgent): void {
    this.agents.set(agent.info.id, agent);
    console.log(`[registry] Agent registered: ${agent.info.id} (${agent.info.name})`);
  }

  get(id: AgentId): BaseAgent | undefined {
    return this.agents.get(id);
  }

  getAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getIds(): AgentId[] {
    return Array.from(this.agents.keys());
  }

  async initAll(): Promise<void> {
    for (const agent of Array.from(this.agents.values())) {
      try {
        await agent.init();
        console.log(`[registry] Agent initialized: ${agent.info.id}`);
      } catch (err) {
        console.error(`[registry] Agent ${agent.info.id} failed to init:`, err);
        agent.info.status = "error";
      }
    }
  }

  async shutdownAll(): Promise<void> {
    for (const agent of Array.from(this.agents.values())) {
      try {
        await agent.shutdown();
      } catch (err) {
        console.error(`[registry] Agent ${agent.info.id} failed to shutdown:`, err);
      }
    }
  }
}

export const agentRegistry = new AgentRegistry();
