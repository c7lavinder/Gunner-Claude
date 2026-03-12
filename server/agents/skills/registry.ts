/**
 * Agent Skill Registry — approved tools and libraries for each agent.
 * Agents must only use tools from this registry.
 * New tools require verification: license, maintenance, security, adoption.
 */
import type { AgentSkill } from "./types";

export const SKILL_REGISTRY: AgentSkill[] = [
  // ============ CODE REPAIR SKILLS ============
  {
    id: "typescript-compiler",
    name: "TypeScript Compiler",
    description: "Static type checking and compilation",
    availableTo: ["code-repair", "testing", "architecture"],
    toolName: "typescript",
    toolVersion: "5.9.x",
    toolDocs: "https://www.typescriptlang.org/docs/",
    verified: true,
  },
  {
    id: "eslint",
    name: "ESLint",
    description: "Static code analysis and linting",
    availableTo: ["code-repair", "architecture"],
    toolName: "eslint",
    toolVersion: "10.x",
    toolDocs: "https://eslint.org/docs/latest/",
    verified: true,
  },
  {
    id: "drizzle-orm",
    name: "Drizzle ORM",
    description: "Database queries, migrations, and schema management",
    availableTo: ["code-repair", "architecture", "integration"],
    toolName: "drizzle-orm",
    toolVersion: "0.44.x",
    toolDocs: "https://orm.drizzle.team/docs/overview",
    verified: true,
  },

  // ============ TESTING SKILLS ============
  {
    id: "vitest",
    name: "Vitest",
    description: "Unit and integration test runner",
    availableTo: ["testing", "code-repair"],
    toolName: "vitest",
    toolVersion: "2.x",
    toolDocs: "https://vitest.dev/guide/",
    verified: true,
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "End-to-end browser testing",
    availableTo: ["testing", "ui-ux"],
    toolName: "@playwright/test",
    toolVersion: "1.x",
    toolDocs: "https://playwright.dev/docs/intro",
    verified: true,
  },
  {
    id: "testing-library",
    name: "Testing Library",
    description: "React component testing utilities",
    availableTo: ["testing", "ui-ux"],
    toolName: "@testing-library/react",
    toolVersion: "16.x",
    toolDocs: "https://testing-library.com/docs/react-testing-library/intro",
    verified: true,
  },

  // ============ INTEGRATION SKILLS ============
  {
    id: "ghl-api",
    name: "GoHighLevel API",
    description: "CRM API client for contacts, conversations, opportunities, webhooks",
    availableTo: ["integration"],
    toolName: "custom (server/crm/ghl/ghlAdapter.ts)",
    toolVersion: "v2021-07-28",
    toolDocs: "https://highlevel.stoplight.io/docs/integrations",
    verified: true,
  },
  {
    id: "bullmq",
    name: "BullMQ",
    description: "Persistent job queue with Redis backend",
    availableTo: ["integration", "devops", "code-repair"],
    toolName: "bullmq",
    toolVersion: "5.x",
    toolDocs: "https://docs.bullmq.io/",
    verified: true,
  },

  // ============ DEVOPS SKILLS ============
  {
    id: "docker",
    name: "Docker",
    description: "Containerization and local development environments",
    availableTo: ["devops"],
    toolName: "docker",
    toolVersion: "latest",
    toolDocs: "https://docs.docker.com/",
    verified: true,
  },
  {
    id: "github-actions",
    name: "GitHub Actions",
    description: "CI/CD pipeline automation",
    availableTo: ["devops"],
    toolName: "github-actions",
    toolVersion: "latest",
    toolDocs: "https://docs.github.com/en/actions",
    verified: true,
  },
  {
    id: "railway",
    name: "Railway",
    description: "Cloud hosting and deployment platform",
    availableTo: ["devops"],
    toolName: "railway",
    toolVersion: "latest",
    toolDocs: "https://docs.railway.app/",
    verified: true,
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Error tracking and performance monitoring",
    availableTo: ["devops", "code-repair"],
    toolName: "@sentry/node",
    toolVersion: "10.x",
    toolDocs: "https://docs.sentry.io/platforms/node/",
    verified: true,
  },

  // ============ UI/UX SKILLS ============
  {
    id: "react",
    name: "React",
    description: "Frontend UI framework",
    availableTo: ["ui-ux", "testing"],
    toolName: "react",
    toolVersion: "19.x",
    toolDocs: "https://react.dev/",
    verified: true,
  },
  {
    id: "tailwindcss",
    name: "TailwindCSS",
    description: "Utility-first CSS framework",
    availableTo: ["ui-ux"],
    toolName: "tailwindcss",
    toolVersion: "4.x",
    toolDocs: "https://tailwindcss.com/docs",
    verified: true,
  },
  {
    id: "shadcn-ui",
    name: "shadcn/ui",
    description: "Accessible React component library",
    availableTo: ["ui-ux"],
    toolName: "shadcn/ui",
    toolVersion: "latest",
    toolDocs: "https://ui.shadcn.com/docs",
    verified: true,
  },

  // ============ PRODUCT SKILLS ============
  {
    id: "posthog",
    name: "PostHog",
    description: "Product analytics and feature flags",
    availableTo: ["product-optimization"],
    toolName: "posthog-js",
    toolVersion: "1.x",
    toolDocs: "https://posthog.com/docs",
    verified: true,
  },

  // ============ AI / LLM SKILLS ============
  {
    id: "openai",
    name: "OpenAI API",
    description: "GPT-4o for grading/coaching, Whisper for transcription",
    availableTo: ["code-repair", "product-optimization", "integration"],
    toolName: "openai",
    toolVersion: "latest",
    toolDocs: "https://platform.openai.com/docs/api-reference",
    verified: true,
  },
  {
    id: "langsmith",
    name: "LangSmith",
    description: "AI observability and tracing",
    availableTo: ["product-optimization", "architecture"],
    toolName: "langsmith",
    toolVersion: "0.5.x",
    toolDocs: "https://docs.smith.langchain.com/",
    verified: true,
  },
];

export function getSkillsForAgent(agentId: string): AgentSkill[] {
  return SKILL_REGISTRY.filter((s) => s.availableTo.includes(agentId as never));
}

export function getSkillById(id: string): AgentSkill | undefined {
  return SKILL_REGISTRY.find((s) => s.id === id);
}
