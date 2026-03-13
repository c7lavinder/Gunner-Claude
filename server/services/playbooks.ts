import { eq, and } from "drizzle-orm";
import { db } from "../_core/db";
import {
  industryPlaybooks,
  tenantPlaybooks,
  userPlaybooks,
  tenantCallTypes,
} from "../../drizzle/schema";
import {
  HOT_STREAK_THRESHOLD,
  LEVEL_THRESHOLDS,
  type IndustryPlaybook,
  type TenantPlaybook,
  type UserPlaybook,
  type Terminology,
  type RoleDef,
  type StageDef,
  type CallTypeDef,
  type RubricDef,
  type AlgorithmConfig,
  type RoleplayPersona,
  type TrainingCategory,
  type GradingPhilosophy,
} from "../../shared/types";

export const SOFTWARE_PLAYBOOK = {
  actionTypes: [
    "sms",
    "note",
    "task",
    "appointment",
    "stage_change",
    "workflow",
    "tag",
    "field_update",
  ] as const,
  actionRules: {
    requireConfirmation: true,
    showFromAndTo: true,
    showResultAfterExecution: true,
  },
  algorithmFramework: {
    inventorySort: {
      tiers: ["immediate_attention", "new", "active_working", "contacted_today"],
    },
    buyerMatch: { steps: ["hard_filter_market", "score", "sort"] },
    taskSort: {
      tiers: ["urgent", "inbound", "scheduled", "overdue", "regular"],
    },
  },
  gradeScale: {
    A: { min: 90, color: "emerald" },
    B: { min: 80, color: "blue" },
    C: { min: 70, color: "amber" },
    D: { min: 60, color: "orange" },
    F: { min: 0, color: "red" },
  },
  xpRewards: {
    callBase: 10,
    gradeA: 50,
    gradeB: 30,
    gradeC: 15,
    gradeD: 5,
    gradeF: 0,
    badgeEarned: 25,
    improvement: 20,
  },
  minGradingDurationSeconds: 60,
  hotStreakThreshold: HOT_STREAK_THRESHOLD,
  levelThresholds: LEVEL_THRESHOLDS,
  levelTitles: [
    "Rookie", "Starter", "Starter", "Playmaker", "Playmaker",
    "All-Star", "All-Star", "Captain", "Captain", "Captain",
    "MVP", "MVP", "Champion", "Champion", "Champion",
    "Elite", "Elite", "Elite", "Dynasty", "Dynasty",
    "Legend", "Legend", "GOAT", "GOAT", "Hall of Fame",
  ],
};

export const DEFAULT_TERMINOLOGY: Terminology = {
  contact: "Contact",
  contactPlural: "Contacts",
  asset: "Asset",
  assetPlural: "Assets",
  deal: "Deal",
  dealPlural: "Deals",
  walkthrough: "Walkthrough",
  leadSource: "Lead Source",
  leadSourcePlural: "Lead Sources",
};

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }
  return fallback;
}

export const GENERIC_INDUSTRY_PLAYBOOK: IndustryPlaybook = {
  code: "default",
  name: "General Sales",
  terminology: {
    contact: "Customer",
    contactPlural: "Customers",
    asset: "Account",
    assetPlural: "Accounts",
    deal: "Deal",
    dealPlural: "Deals",
    walkthrough: "Site Visit",
  },
  roles: [
    { code: "agent", name: "Agent", description: "Frontline sales representative", color: "#0ea5e9" },
    { code: "manager", name: "Manager", description: "Team lead overseeing agents", color: "#6366f1" },
    { code: "admin", name: "Admin", description: "System administrator", color: "#10b981" },
  ],
  stages: [
    { code: "new", name: "New", pipeline: "default", order: 0 },
    { code: "in_progress", name: "In Progress", pipeline: "default", order: 1 },
    { code: "qualified", name: "Qualified", pipeline: "default", order: 2 },
    { code: "won", name: "Won", pipeline: "default", order: 3 },
    { code: "lost", name: "Lost", pipeline: "default", order: 99 },
  ],
  callTypes: [
    { code: "inbound", name: "Inbound Call", description: "Customer-initiated call" },
    { code: "outbound", name: "Outbound Call", description: "Rep-initiated call" },
    { code: "follow_up", name: "Follow Up", description: "Scheduled follow-up call" },
  ],
  rubrics: [
    {
      id: "generic-sales",
      name: "General Sales Call",
      role: "agent",
      callType: "outbound",
      totalPoints: 100,
      criteria: [
        { name: "Introduction", maxPoints: 15, description: "Clear, professional introduction" },
        { name: "Needs Discovery", maxPoints: 25, description: "Uncovers customer needs and pain points" },
        { name: "Solution Presentation", maxPoints: 20, description: "Presents relevant solution clearly" },
        { name: "Objection Handling", maxPoints: 20, description: "Handles objections professionally" },
        { name: "Next Steps", maxPoints: 20, description: "Secures clear next step or commitment" },
      ],
    },
  ],
  outcomeTypes: ["Positive", "Neutral", "Negative", "Not Reached"],
  kpiFunnelStages: ["Leads", "Contacts Made", "Qualified", "Won"],
  algorithmDefaults: {
    inventorySort: { newLeadWeight: 100, staleContactWeight: 80 },
    buyerMatch: {},
    taskSort: { urgentCallbackWeight: 100, followUpWeight: 70 },
  },
  roleplayPersonas: [
    {
      id: "generic-skeptical",
      name: "Skeptical Sarah",
      description: "A prospect who has dealt with pushy salespeople before and needs to be won over through genuine value",
      role: "agent",
      difficulty: "intermediate",
      personality: "Guarded and direct. Responds to honesty and specifics, not generic sales pitches.",
      scenario: "Has been evaluating options for 2 weeks. Has spoken to one competitor. Needs clear differentiation.",
      objections: ["I'm already talking to someone else", "Why should I choose you?", "Can you send me some info?", "This isn't a priority right now"],
    },
    {
      id: "generic-eager",
      name: "Eager Eddie",
      description: "An enthusiastic prospect who is ready to move forward but needs guidance on the right solution",
      role: "agent",
      difficulty: "beginner",
      personality: "Open and talkative. Easily sold but the rep's job is to sell the right solution, not just close.",
      scenario: "Reached out through your website. Has budget approved. Wants to start within 2 weeks.",
      objections: ["Can we get started faster?", "Do I really need the premium option?", "My boss wants to see a demo first", "What if it doesn't work out?"],
    },
  ],
  trainingCategories: [
    { code: "opener", name: "Opening Techniques", description: "How to start calls confidently and earn the first 30 seconds", order: 0 },
    { code: "discovery", name: "Needs Discovery", description: "Uncovering real pain points and buying motivations", order: 1 },
    { code: "objections", name: "Objection Handling", description: "Frameworks for the most common objections", order: 2 },
    { code: "closing", name: "Closing Skills", description: "Moving from conversation to commitment", order: 3 },
  ],
  gradingPhilosophy: {
    overview: "Sales calls are graded on process quality, not just outcomes. A great call uncovers needs, builds trust, and advances the relationship — even if no deal closes today.",
    criticalFailurePolicy: "Critical failure caps the score at 50%. Conditions: rep is rude or argumentative; rep presents a solution without discovering any needs; rep ends the call without proposing a next step.",
    talkRatioGuidance: "Reps should talk no more than 50% of the time on discovery calls. On follow-ups and presentations, up to 60% is acceptable. If the rep is talking more than 65%, they are lecturing, not selling.",
    roleSpecific: {
      agent: "Grade on discovery quality, professionalism, and next-step commitment. A rep who has a pleasant conversation but doesn't advance the deal scores no higher than a C.",
      manager: "Managers on calls are graded on coaching effectiveness, not selling. Did they guide the conversation productively? Did they support without taking over?",
    },
  },
  taskCategories: [
    { code: "follow_up", name: "Follow Up" },
    { code: "admin", name: "Admin" },
  ],
  classificationLabels: {
    "Interested": { label: "Interested", color: "green" },
    "Not Interested": { label: "Not Interested", color: "red" },
    "Follow Up": { label: "Follow Up", color: "amber" },
    "No Answer": { label: "No Answer", color: "gray" },
  },
};

export async function getIndustryPlaybook(
  industryCode: string
): Promise<IndustryPlaybook> {
  if (!industryCode) return GENERIC_INDUSTRY_PLAYBOOK;

  const [row] = await db
    .select()
    .from(industryPlaybooks)
    .where(
      and(
        eq(industryPlaybooks.code, industryCode),
        eq(industryPlaybooks.isActive, "true")
      )
    )
    .limit(1);

  if (!row) return GENERIC_INDUSTRY_PLAYBOOK;

  return {
    code: row.code,
    name: row.name,
    terminology: parseJsonField<Terminology>(row.terminology, DEFAULT_TERMINOLOGY),
    roles: parseJsonField<RoleDef[]>(row.roles, []),
    stages: parseJsonField<StageDef[]>(row.stages, []),
    callTypes: parseJsonField<CallTypeDef[]>(row.callTypes, []),
    rubrics: parseJsonField<RubricDef[]>(row.rubrics, []),
    outcomeTypes: parseJsonField<string[]>(row.outcomeTypes, []),
    kpiFunnelStages: parseJsonField<string[]>(row.kpiFunnelStages, []),
    algorithmDefaults: parseJsonField<AlgorithmConfig>(row.algorithmDefaults, {
      inventorySort: {},
      buyerMatch: {},
      taskSort: {},
    }),
    roleplayPersonas: parseJsonField<RoleplayPersona[]>(row.roleplayPersonas, []),
    trainingCategories: parseJsonField<TrainingCategory[]>(row.trainingCategories, []),
    gradingPhilosophy: parseJsonField<GradingPhilosophy | undefined>(row.gradingPhilosophy, undefined),
    kpiMetrics: parseJsonField<Array<{ key: string; label: string }>>(row.kpiMetrics, []),
    taskCategories: parseJsonField<Array<{ code: string; name: string }>>(row.taskCategories, []),
    classificationLabels: parseJsonField<Record<string, { label: string; color: "green" | "red" | "amber" | "gray" }>>(row.classificationLabels, {}),
  };
}

export async function getTenantPlaybook(
  tenantId: number
): Promise<TenantPlaybook | null> {
  if (!tenantId) return null;

  const [row] = await db
    .select()
    .from(tenantPlaybooks)
    .where(eq(tenantPlaybooks.tenantId, tenantId))
    .limit(1);

  if (!row) return null;

  return {
    tenantId: row.tenantId,
    companyName: "",
    industryCode: row.industryCode ?? "",
    crmType: "ghl",
    roles: parseJsonField<RoleDef[]>(row.roles, []),
    stages: parseJsonField<StageDef[]>(row.stages, []),
    markets: parseJsonField<{ name: string; zipCodes: string[] }[]>(row.markets, []),
    leadSources: parseJsonField<{ name: string; crmMapping?: string }[]>(row.leadSources, []),
    algorithmOverrides: parseJsonField<Partial<AlgorithmConfig> | undefined>(row.algorithmOverrides, undefined),
    terminology: parseJsonField<Partial<Terminology> | undefined>(row.terminology, undefined),
    coachingTone: (row.coachingTone as TenantPlaybook["coachingTone"]) ?? undefined,
  };
}

export async function getUserPlaybook(
  userId: number,
  tenantId: number
): Promise<UserPlaybook | null> {
  if (!userId || !tenantId) return null;

  const [row] = await db
    .select()
    .from(userPlaybooks)
    .where(
      and(
        eq(userPlaybooks.userId, userId),
        eq(userPlaybooks.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!row) return null;

  return {
    userId: row.userId,
    tenantId: row.tenantId,
    name: "",
    role: row.role ?? "member",
    strengths: parseJsonField<string[]>(row.strengths, []),
    growthAreas: parseJsonField<string[]>(row.growthAreas, []),
    gradeTrend: (row.gradeTrend as UserPlaybook["gradeTrend"]) ?? "plateau",
    communicationStyle: parseJsonField(row.communicationStyle, {}),
    instructions: parseJsonField<Record<string, string>>(row.instructions, {}),
  };
}

export function resolveTerminology(
  industry?: IndustryPlaybook | null,
  tenant?: TenantPlaybook | null
): Terminology {
  return {
    ...DEFAULT_TERMINOLOGY,
    ...(industry?.terminology ?? {}),
    ...(tenant?.terminology ?? {}),
  };
}

export function resolveRoles(
  industry?: IndustryPlaybook | null,
  tenant?: TenantPlaybook | null
): RoleDef[] {
  if (tenant?.roles?.length) return tenant.roles;
  if (industry?.roles?.length) return industry.roles;
  return [
    { code: "member", name: "Team Member", description: "Default role", color: "#6b7280" },
  ];
}

export function resolveStages(
  industry?: IndustryPlaybook | null,
  tenant?: TenantPlaybook | null
): StageDef[] {
  if (tenant?.stages?.length) return tenant.stages;
  if (industry?.stages?.length) return industry.stages;
  return [{ code: "new", name: "New", pipeline: "default", order: 0 }];
}

export async function resolveCallTypes(
  industry?: IndustryPlaybook | null,
  tenantId?: number
): Promise<CallTypeDef[]> {
  const base: CallTypeDef[] = industry?.callTypes?.length
    ? industry.callTypes
    : [{ code: "sales", name: "Sales Call", description: "Default call type" }];

  if (!tenantId) return base;

  const tenantRows = await db
    .select()
    .from(tenantCallTypes)
    .where(and(eq(tenantCallTypes.tenantId, tenantId), eq(tenantCallTypes.isActive, "true")));

  if (!tenantRows.length) return base;

  // Tenant call types override industry ones by code; append new ones
  const merged = new Map(base.map((ct) => [ct.code, ct]));
  for (const row of tenantRows) {
    merged.set(row.code, {
      code: row.code,
      name: row.name,
      description: row.description ?? "",
    });
  }
  return Array.from(merged.values());
}

export function resolveAlgorithmConfig(
  industry?: IndustryPlaybook | null,
  tenant?: TenantPlaybook | null
): AlgorithmConfig {
  const defaults: AlgorithmConfig = {
    inventorySort: {},
    buyerMatch: {},
    taskSort: {},
  };
  const base = industry?.algorithmDefaults ?? defaults;
  return {
    inventorySort: { ...base.inventorySort, ...(tenant?.algorithmOverrides?.inventorySort ?? {}) },
    buyerMatch: { ...base.buyerMatch, ...(tenant?.algorithmOverrides?.buyerMatch ?? {}) },
    taskSort: { ...base.taskSort, ...(tenant?.algorithmOverrides?.taskSort ?? {}) },
    kpiTargets: { ...(base.kpiTargets ?? {}), ...(tenant?.algorithmOverrides?.kpiTargets ?? {}) },
  };
}

export function resolveKpiFunnelStages(
  industry?: IndustryPlaybook | null,
  tenant?: TenantPlaybook | null
): string[] {
  void tenant; // reserved for future tenant overrides
  return industry?.kpiFunnelStages ?? [];
}

export function resolveKpiMetrics(
  industry?: IndustryPlaybook | null,
  tenant?: TenantPlaybook | null
): Array<{ key: string; label: string }> {
  void tenant; // reserved for future tenant overrides
  return industry?.kpiMetrics ?? [];
}

export function resolveRoleplayPersonas(
  industry?: IndustryPlaybook | null
): RoleplayPersona[] {
  return industry?.roleplayPersonas ?? [];
}

export function resolveTrainingCategories(
  industry?: IndustryPlaybook | null
): TrainingCategory[] {
  return industry?.trainingCategories ?? [];
}

export function resolveOutcomeTypes(
  industry?: IndustryPlaybook | null
): string[] {
  return industry?.outcomeTypes ?? [];
}

export function resolveTaskCategories(
  industry?: IndustryPlaybook | null
): Array<{ code: string; name: string }> {
  return industry?.taskCategories ?? [];
}

export function resolveClassificationLabels(
  industry?: IndustryPlaybook | null
): Record<string, { label: string; color: string }> {
  return industry?.classificationLabels ?? {};
}
