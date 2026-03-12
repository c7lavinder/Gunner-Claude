/**
 * Unit tests for the agent system — registry, skills, task creation.
 */
import { describe, it, expect } from "vitest";
import { SKILL_REGISTRY, getSkillsForAgent } from "../../../server/agents/skills/registry";
import { QUEUE_NAMES, PRIORITY, RETRY_CONFIG } from "../../../server/queues/queues";

describe("Agent Skill Registry", () => {
  it("has skills defined", () => {
    expect(SKILL_REGISTRY.length).toBeGreaterThan(0);
  });

  it("all skills are verified", () => {
    for (const skill of SKILL_REGISTRY) {
      expect(skill.verified).toBe(true);
    }
  });

  it("all skills have required fields", () => {
    for (const skill of SKILL_REGISTRY) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.toolName).toBeTruthy();
      expect(skill.availableTo.length).toBeGreaterThan(0);
    }
  });

  it("code-repair agent has TypeScript and ESLint skills", () => {
    const skills = getSkillsForAgent("code-repair");
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("typescript-compiler");
    expect(ids).toContain("eslint");
  });

  it("testing agent has vitest and playwright skills", () => {
    const skills = getSkillsForAgent("testing");
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("vitest");
    expect(ids).toContain("playwright");
  });

  it("integration agent has GHL API skill", () => {
    const skills = getSkillsForAgent("integration");
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("ghl-api");
  });

  it("devops agent has Docker and GitHub Actions skills", () => {
    const skills = getSkillsForAgent("devops");
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("docker");
    expect(ids).toContain("github-actions");
  });

  it("ui-ux agent has React and Tailwind skills", () => {
    const skills = getSkillsForAgent("ui-ux");
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("react");
    expect(ids).toContain("tailwindcss");
    expect(ids).toContain("shadcn-ui");
  });
});

describe("Queue System Config", () => {
  it("has all queue names defined", () => {
    expect(QUEUE_NAMES.WEBHOOK_PROCESSING).toBeTruthy();
    expect(QUEUE_NAMES.WEBHOOK_RETRY).toBeTruthy();
    expect(QUEUE_NAMES.CALL_TRANSCRIPTION).toBeTruthy();
    expect(QUEUE_NAMES.CALL_GRADING).toBeTruthy();
    expect(QUEUE_NAMES.AGENT_TASKS).toBeTruthy();
    expect(QUEUE_NAMES.AGENT_MEMORY).toBeTruthy();
    expect(QUEUE_NAMES.NOTIFICATIONS).toBeTruthy();
    expect(QUEUE_NAMES.CRM_SYNC).toBeTruthy();
  });

  it("has priority levels in correct order", () => {
    expect(PRIORITY.P0_CRITICAL).toBeLessThan(PRIORITY.P1_HIGH);
    expect(PRIORITY.P1_HIGH).toBeLessThan(PRIORITY.P2_MEDIUM);
    expect(PRIORITY.P2_MEDIUM).toBeLessThan(PRIORITY.P3_LOW);
    expect(PRIORITY.P3_LOW).toBeLessThan(PRIORITY.P4_ENHANCEMENT);
  });

  it("has retry config for all queues", () => {
    for (const name of Object.values(QUEUE_NAMES)) {
      expect(RETRY_CONFIG[name]).toBeDefined();
      expect(RETRY_CONFIG[name].attempts).toBeGreaterThan(0);
    }
  });

  it("webhook retry has exponential backoff", () => {
    expect(RETRY_CONFIG[QUEUE_NAMES.WEBHOOK_RETRY].backoff.type).toBe("exponential");
    expect(RETRY_CONFIG[QUEUE_NAMES.WEBHOOK_RETRY].attempts).toBe(4);
  });
});
