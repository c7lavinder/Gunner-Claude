export type PlaybookLevel = "software" | "industry" | "tenant" | "user";

export type CrmType = "ghl" | "hubspot" | "salesforce";

export interface Terminology {
  contact: string;
  contactPlural: string;
  asset: string;
  assetPlural: string;
  deal: string;
  dealPlural: string;
  call?: string;
  callPlural?: string;
  walkthrough: string;
  leadSource?: string;
  leadSourcePlural?: string;
}

export interface RoleDef {
  code: string;
  name: string;
  description: string;
  color: string;
}

export interface StageDef {
  code: string;
  name: string;
  pipeline: string;
  order: number;
  crmStageId?: string;
}

export interface CallTypeDef {
  code: string;
  name: string;
  description: string;
  rubricId?: string;
  coachingChips?: string[];
  actionChips?: string[];
}

export interface RubricCriteria {
  name: string;
  maxPoints: number;
  description: string;
  keyPhrases?: string[];
}

export interface RubricDef {
  id: string;
  name: string;
  role: string;
  callType: string;
  totalPoints: number;
  criteria: RubricCriteria[];
  criticalFailures?: string[];
  talkRatioTarget?: { min: number; max: number };
}

export interface AlgorithmConfig {
  inventorySort: Record<string, number>;
  buyerMatch: Record<string, number>;
  taskSort: Record<string, number>;
  kpiTargets?: Record<string, number>;
}

export interface RoleplayPersona {
  id: string;
  name: string;
  description: string;
  role: string; // which user role this persona is designed for
  difficulty: "beginner" | "intermediate" | "advanced";
  personality: string;
  scenario: string;
  objections: string[];
}

export interface TrainingCategory {
  code: string;
  name: string;
  description: string;
  role?: string; // optional: only relevant for this role
  order: number;
}

export interface GradingPhilosophy {
  overview: string;
  criticalFailurePolicy: string;
  talkRatioGuidance: string;
  roleSpecific: Record<string, string>;
}

export interface IndustryPlaybook {
  code: string;
  name: string;
  terminology: Terminology;
  roles: RoleDef[];
  stages: StageDef[];
  callTypes: CallTypeDef[];
  rubrics: RubricDef[];
  outcomeTypes: string[];
  kpiFunnelStages: string[];
  kpiMetrics?: Array<{ key: string; label: string }>;
  algorithmDefaults: AlgorithmConfig;
  roleplayPersonas?: RoleplayPersona[];
  trainingCategories?: TrainingCategory[];
  gradingPhilosophy?: GradingPhilosophy;
  classificationLabels?: Record<string, { label: string; color: "green" | "red" | "amber" | "gray" }>;
  taskCategories?: Array<{ code: string; name: string }>;
}

export interface TenantPlaybook {
  tenantId: number;
  companyName: string;
  industryCode: string;
  crmType: CrmType;
  roles: RoleDef[];
  stages: StageDef[];
  markets: { name: string; zipCodes: string[] }[];
  leadSources: { name: string; crmMapping?: string }[];
  algorithmOverrides?: Partial<AlgorithmConfig>;
  terminology?: Partial<Terminology>;
  minGradingDurationSeconds?: number;
  customNextStepsRules?: string[];
}

export interface UserPlaybook {
  userId: number;
  tenantId: number;
  name: string;
  role: string;
  strengths: string[];
  growthAreas: string[];
  gradeTrend: "improving" | "declining" | "plateau";
  communicationStyle: {
    smsStyle?: string;
    noteStyle?: string;
    taskStyle?: string;
  };
  instructions: Record<string, string>;
}

export type ActionType =
  | "sms"
  | "note"
  | "task"
  | "appointment"
  | "stage_change"
  | "workflow"
  | "tag"
  | "field_update"
  | "check_off_task"
  | "update_task"
  | "schedule_sms"
  | "remove_workflow";

export interface ActionRequest {
  type: ActionType;
  from: { name: string; phone?: string; userId: number };
  to: { name: string; phone?: string; contactId: string };
  payload: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  timestamp: string;
  error?: string;
}

// Hot streak minimum days — single source of truth (mirrors SOFTWARE_PLAYBOOK on the server)
export const HOT_STREAK_THRESHOLD = 3;

// XP level thresholds — single source of truth (mirrors SOFTWARE_PLAYBOOK on the server)
export const LEVEL_THRESHOLDS: number[] = [
  0, 500, 1000, 1750, 2500, 4000, 6000, 9000, 12000, 15000,
  20000, 27000, 35000, 42500, 50000, 62500, 77500, 95000, 110000, 125000,
  150000, 180000, 220000, 270000, 350000,
];
