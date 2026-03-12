import { trpc } from "@/lib/trpc";
import type { Terminology, RoleDef, StageDef, RoleplayPersona, TrainingCategory, AlgorithmConfig } from "@shared/types";

const DEFAULT_T: Terminology = {
  contact: "Contact",
  contactPlural: "Contacts",
  asset: "Asset",
  assetPlural: "Assets",
  deal: "Deal",
  dealPlural: "Deals",
  walkthrough: "Walkthrough",
};

const DEFAULT_ROLES: RoleDef[] = [
  { code: "member", name: "Team Member", description: "Default role", color: "#6b7280" },
];

const DEFAULT_STAGES: StageDef[] = [
  { code: "", name: "Loading...", pipeline: "default", order: 0 },
];

const FIVE_MINUTES = 5 * 60 * 1000;

export function useTenantConfig() {
  const { data, isLoading } = trpc.playbook.getConfig.useQuery(undefined, {
    staleTime: FIVE_MINUTES,
  });

  return {
    t: data?.terminology ?? DEFAULT_T,
    roles: data?.roles ?? DEFAULT_ROLES,
    stages: data?.stages ?? DEFAULT_STAGES,
    callTypes: data?.callTypes ?? [],
    algorithm: (data?.algorithm ?? { inventorySort: {}, buyerMatch: {}, taskSort: {} }) as AlgorithmConfig,
    kpiFunnelStages: data?.kpiFunnelStages ?? ([] as string[]),
    kpiMetrics: data?.kpiMetrics ?? ([] as Array<{ key: string; label: string }>),
    roleplayPersonas: data?.roleplayPersonas ?? ([] as RoleplayPersona[]),
    trainingCategories: data?.trainingCategories ?? ([] as TrainingCategory[]),
    outcomeTypes: data?.outcomeTypes ?? ([] as string[]),
    classificationLabels: data?.classificationLabels ?? ({} as Record<string, { label: string; color: string }>),
    markets: data?.markets ?? [],
    leadSources: data?.leadSources ?? [],
    isLoading,
  };
}
