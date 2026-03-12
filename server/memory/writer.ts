/**
 * Memory Writer — processes agent memory write jobs from the queue.
 */
import { memoryStore } from "./store";
import type { AgentMemoryEntry } from "../agents/types";

export async function writeMemory(data: Record<string, unknown>): Promise<void> {
  const entry = data as unknown as Omit<AgentMemoryEntry, "id" | "createdAt">;
  if (!entry.type || !entry.agentId || !entry.title) {
    console.warn("[memory:writer] Invalid memory entry, skipping:", data);
    return;
  }
  await memoryStore.write(entry);
}
