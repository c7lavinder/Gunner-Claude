import { eq, and } from "drizzle-orm";
import { db } from "../_core/db";
import {
  industryPlaybooks,
  tenantPlaybooks,
  userPlaybooks,
} from "../../drizzle/schema";
import type {
  IndustryPlaybook,
  TenantPlaybook,
  UserPlaybook,
  Terminology,
  RoleDef,
  StageDef,
  CallTypeDef,
  AlgorithmConfig,
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
  levelThresholds: [
    0, 500, 1000, 1750, 2500, 4000, 6000, 9000, 12000, 15000, 20000, 27000,
    35000, 42500, 50000, 62500, 77500, 95000, 110000, 125000, 150000, 180000,
    220000, 270000, 350000,
  ],
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
    rubrics: parseJsonField(row.rubrics, []),
    outcomeTypes: parseJsonField<string[]>(row.outcomeTypes, []),
    kpiFunnelStages: parseJsonField<string[]>(row.kpiFunnelStages, []),
    algorithmDefaults: parseJsonField<AlgorithmConfig>(row.algorithmDefaults, {
      inventorySort: {},
      buyerMatch: {},
      taskSort: {},
    }),
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
    markets: parseJsonField(row.markets, []),
    leadSources: parseJsonField(row.leadSources, []),
    algorithmOverrides: parseJsonField(row.algorithmOverrides, undefined),
    terminology: parseJsonField(row.terminology, undefined),
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
): Record<string, unknown> {
  return {
    ...SOFTWARE_PLAYBOOK.algorithmFramework,
    ...(industry?.algorithmDefaults ?? {}),
    ...(tenant?.algorithmOverrides ?? {}),
  };
}
