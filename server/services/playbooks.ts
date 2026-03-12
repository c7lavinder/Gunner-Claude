import { eq, and } from "drizzle-orm";
import { db } from "../_core/db";
import {
  industryPlaybooks,
  tenantPlaybooks,
  userPlaybooks,
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

export async function getIndustryPlaybook(
  industryCode: string
): Promise<IndustryPlaybook | null> {
  if (!industryCode) return null;

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

  if (!row) return null;

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

export function resolveCallTypes(
  industry?: IndustryPlaybook | null
): CallTypeDef[] {
  if (industry?.callTypes?.length) return industry.callTypes;
  return [
    { code: "sales", name: "Sales Call", description: "Default call type" },
  ];
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
