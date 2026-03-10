import type {
  IndustryPlaybook,
  TenantPlaybook,
  UserPlaybook,
  Terminology,
  RoleDef,
  StageDef,
  CallTypeDef,
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
    "Rookie",
    "Starter",
    "Starter",
    "Playmaker",
    "Playmaker",
    "All-Star",
    "All-Star",
    "Captain",
    "Captain",
    "Captain",
    "MVP",
    "MVP",
    "Champion",
    "Champion",
    "Champion",
    "Elite",
    "Elite",
    "Elite",
    "Dynasty",
    "Dynasty",
    "Legend",
    "Legend",
    "GOAT",
    "GOAT",
    "Hall of Fame",
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

export function getIndustryPlaybook(
  _industryCode: string
): IndustryPlaybook | null {
  return null;
}

export function getTenantPlaybook(_tenantId: number): TenantPlaybook | null {
  return null;
}

export function getUserPlaybook(
  _userId: number,
  _tenantId: number
): UserPlaybook | null {
  return null;
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
    {
      code: "member",
      name: "Team Member",
      description: "Default role",
      color: "#6b7280",
    },
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
    {
      code: "sales",
      name: "Sales Call",
      description: "Default call type",
    },
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
