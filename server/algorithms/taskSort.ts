export const TASK_SORT_CONFIG = {
  lead_manager: {
    newLeadUrgencyMinutes: 15,
    newLeadAlertMinutes: 60,
    tiers: ["new_lead", "inbound", "callback", "overdue", "regular"] as const,
  },
  acquisition_manager: {
    revenueWeightedStages: ["offer", "under_contract"],
    tiers: ["inbound", "appointment", "follow_up_revenue", "overdue", "regular"] as const,
  },
  dispo_manager: {
    revenueWeightedStages: ["under_contract", "closing"],
    closingDayWarning: 7,
    tiers: ["buyer_response", "time_sensitive", "no_contact", "regular"] as const,
  },
};

export interface Task {
  id: string;
  title: string;
  dueDate?: string;
  assignedTo?: string;
  contactId?: string;
  isNewLead?: boolean;
  leadCreatedAt?: Date;
  hasInboundMessage?: boolean;
  hasMissedCall?: boolean;
  isCallback?: boolean;
  hasAppointmentToday?: boolean;
  dealValue?: number;
  stageCode?: string;
  hasBuyerResponse?: boolean;
  daysSinceLastContact?: number;
  completed: boolean;
}

type RoleKey = keyof typeof TASK_SORT_CONFIG;

function getTierIndex(tier: string, tiers: readonly string[]): number {
  const i = tiers.indexOf(tier);
  return i >= 0 ? i : tiers.length;
}

function getLeadManagerTier(task: Task, cfg: (typeof TASK_SORT_CONFIG)["lead_manager"]): string {
  if (task.isNewLead && task.leadCreatedAt) {
    const mins = (Date.now() - task.leadCreatedAt.getTime()) / (1000 * 60);
    if (mins < cfg.newLeadUrgencyMinutes) return "new_lead";
  }
  if (task.hasInboundMessage || task.hasMissedCall) return "inbound";
  if (task.isCallback) return "callback";
  if (task.dueDate && new Date(task.dueDate) < new Date()) return "overdue";
  return "regular";
}

function getAcquisitionManagerTier(
  task: Task,
  cfg: (typeof TASK_SORT_CONFIG)["acquisition_manager"]
): string {
  if (task.hasInboundMessage || task.hasMissedCall) return "inbound";
  if (task.hasAppointmentToday) return "appointment";
  if (
    task.stageCode &&
    cfg.revenueWeightedStages.includes(task.stageCode as (typeof cfg.revenueWeightedStages)[number])
  )
    return "follow_up_revenue";
  if (task.dueDate && new Date(task.dueDate) < new Date()) return "overdue";
  return "regular";
}

function getDispoManagerTier(
  task: Task,
  cfg: (typeof TASK_SORT_CONFIG)["dispo_manager"]
): string {
  if (task.hasBuyerResponse) return "buyer_response";
  if (
    task.stageCode &&
    cfg.revenueWeightedStages.includes(task.stageCode as (typeof cfg.revenueWeightedStages)[number])
  )
    return "time_sensitive";
  if ((task.daysSinceLastContact ?? 0) >= (cfg.closingDayWarning ?? 7)) return "no_contact";
  return "regular";
}

export function sortTasks(
  tasks: Task[],
  role: string,
  config?: Partial<typeof TASK_SORT_CONFIG>
): Task[] {
  const cfg = {
    lead_manager: { ...TASK_SORT_CONFIG.lead_manager, ...config?.lead_manager },
    acquisition_manager: {
      ...TASK_SORT_CONFIG.acquisition_manager,
      ...config?.acquisition_manager,
    },
    dispo_manager: { ...TASK_SORT_CONFIG.dispo_manager, ...config?.dispo_manager },
  };
  const roleCfg = cfg[role as RoleKey] ?? cfg.lead_manager;
  const active = tasks.filter((t) => !t.completed);
  return active.sort((a, b) => {
    const tierA =
      role === "acquisition_manager"
        ? getAcquisitionManagerTier(a, roleCfg as (typeof cfg)["acquisition_manager"])
        : role === "dispo_manager"
          ? getDispoManagerTier(a, roleCfg as (typeof cfg)["dispo_manager"])
          : getLeadManagerTier(a, roleCfg as (typeof cfg)["lead_manager"]);
    const tierB =
      role === "acquisition_manager"
        ? getAcquisitionManagerTier(b, roleCfg as (typeof cfg)["acquisition_manager"])
        : role === "dispo_manager"
          ? getDispoManagerTier(b, roleCfg as (typeof cfg)["dispo_manager"])
          : getLeadManagerTier(b, roleCfg as (typeof cfg)["lead_manager"]);
    const idxA = getTierIndex(tierA, roleCfg.tiers);
    const idxB = getTierIndex(tierB, roleCfg.tiers);
    if (idxA !== idxB) return idxA - idxB;
    const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (dueA !== dueB) return dueA - dueB;
    return (b.dealValue ?? 0) - (a.dealValue ?? 0);
  });
}
