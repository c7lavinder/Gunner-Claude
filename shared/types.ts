export type PlaybookLevel = "software" | "industry" | "tenant" | "user";

export type CrmType = "ghl" | "hubspot" | "salesforce";

export interface Terminology {
  contact: string;
  contactPlural: string;
  asset: string;
  assetPlural: string;
  deal: string;
  dealPlural: string;
  walkthrough: string;
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
  taskSort: Record<string, unknown>;
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
  algorithmDefaults: AlgorithmConfig;
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
  | "field_update";

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
