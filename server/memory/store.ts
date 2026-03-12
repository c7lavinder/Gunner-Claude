/**
 * Agent Memory Store — persistent memory in PostgreSQL.
 * Stores architecture decisions, bug history, experiments, learned patterns.
 * Prevents agents from repeating mistakes.
 */
import { nanoid } from "nanoid";
import type { AgentMemoryEntry, MemoryType, AgentId } from "../agents/types";

// In-memory store (will be backed by PostgreSQL agent_memory table)
const memories: AgentMemoryEntry[] = [];

export const memoryStore = {
  /** Write a new memory entry */
  async write(entry: Omit<AgentMemoryEntry, "id" | "createdAt">): Promise<AgentMemoryEntry> {
    const mem: AgentMemoryEntry = {
      ...entry,
      id: nanoid(),
      createdAt: new Date().toISOString(),
    };
    memories.unshift(mem);

    // Keep memory bounded
    if (memories.length > 10000) memories.length = 10000;

    // TODO: persist to PostgreSQL agent_memory table
    // await db.insert(agentMemory).values({ ... });

    console.log(`[memory] Stored: [${mem.type}] ${mem.title} (importance: ${mem.importance})`);
    return mem;
  },

  /** Search memories by type */
  async queryByType(type: MemoryType, limit = 20): Promise<AgentMemoryEntry[]> {
    return memories.filter((m) => m.type === type).slice(0, limit);
  },

  /** Search memories by agent */
  async queryByAgent(agentId: AgentId, limit = 20): Promise<AgentMemoryEntry[]> {
    return memories.filter((m) => m.agentId === agentId).slice(0, limit);
  },

  /** Search memories by keyword in title/content */
  async search(keyword: string, limit = 20): Promise<AgentMemoryEntry[]> {
    const lower = keyword.toLowerCase();
    return memories
      .filter((m) => m.title.toLowerCase().includes(lower) || m.content.toLowerCase().includes(lower))
      .slice(0, limit);
  },

  /** Get memories related to specific files */
  async queryByFile(filePath: string, limit = 10): Promise<AgentMemoryEntry[]> {
    return memories.filter((m) => m.relatedFiles.some((f) => f.includes(filePath))).slice(0, limit);
  },

  /** Get the most important memories (for context injection into agent prompts) */
  async getTopMemories(limit = 10): Promise<AgentMemoryEntry[]> {
    return [...memories].sort((a, b) => b.importance - a.importance).slice(0, limit);
  },

  /** Get all memories (for Control Room browser) */
  async getAll(limit = 100): Promise<AgentMemoryEntry[]> {
    return memories.slice(0, limit);
  },

  /** Get memory count */
  getCount(): number {
    return memories.length;
  },
};
