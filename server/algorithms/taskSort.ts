/**
 * Task Sort — role-specific task prioritization.
 *
 * Each role has a different tier ordering. Tasks are sorted into tiers
 * first, then within each tier by urgency/date.
 *
 * Config values come from Tenant Playbook → Industry Playbook → defaults below.
 */

export interface TaskSortConfig {
  [roleCode: string]: RoleTaskConfig;
  default: RoleTaskConfig;
}

export interface RoleTaskConfig {
  newLeadUrgencyMinutes: number;
  newLeadAlertMinutes: number;
  revenueWeightedStages: string[];
  closingDayWarning: number;
  tiers: string[];
}

export const DEFAULT_TASK_SORT_CONFIG: TaskSortConfig = {
  lead_manager: {
    newLeadUrgencyMinutes: 15,
    newLeadAlertMinutes: 60,
    revenueWeightedStages: [],
    closingDayWarning: 7,
    tiers: ["new_lead", "inbound", "callback", "overdue", "regular"],
  },
  acquisition_manager: {
    newLeadUrgencyMinutes: 30,
    newLeadAlertMinutes: 120,
    revenueWeightedStages: ["offer", "under_contract"],
    closingDayWarning: 7,
    tiers: ["inbound", "appointment", "follow_up_revenue", "overdue", "regular"],
  },
  dispo_manager: {
    newLeadUrgencyMinutes: 60,
    newLeadAlertMinutes: 240,
    revenueWeightedStages: ["under_contract", "closing"],
    closingDayWarning: 7,
    tiers: ["buyer_response", "time_sensitive", "no_contact", "regular"],
  },
  default: {
    newLeadUrgencyMinutes: 30,
    newLeadAlertMinutes: 120,
    revenueWeightedStages: [],
    closingDayWarning: 7,
    tiers: ["new_lead", "inbound", "callback", "overdue", "appointment", "regular"],
  },
};

export interface SortableTask {
  id: string | number;
  title: string;
  dueDate?: Date | string | null;
  isOverdue?: boolean;
  isNewLead?: boolean;
  isInbound?: boolean;
  isCallback?: boolean;
  isAppointment?: boolean;
  isBuyerResponse?: boolean;
  isTimeSensitive?: boolean;
  hasNoContact?: boolean;
  dealValue?: number;
  createdAt?: Date | string | null;
  stage?: string | null;
}

function tierIndex(task: SortableTask, tiers: string[]): number {
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    switch (tier) {
      case "new_lead": if (task.isNewLead) return i; break;
      case "inbound": if (task.isInbound) return i; break;
      case "callback": if (task.isCallback) return i; break;
      case "appointment": if (task.isAppointment) return i; break;
      case "buyer_response": if (task.isBuyerResponse) return i; break;
      case "time_sensitive": if (task.isTimeSensitive) return i; break;
      case "no_contact": if (task.hasNoContact) return i; break;
      case "overdue": if (task.isOverdue) return i; break;
      case "follow_up_revenue": if (task.stage && task.dealValue) return i; break;
      case "regular": return i;
    }
  }
  return tiers.length;
}

export function taskSort<T extends SortableTask>(
  tasks: T[],
  role: string,
  config: Partial<TaskSortConfig> = {}
): T[] {
  const c = { ...DEFAULT_TASK_SORT_CONFIG, ...config };
  const roleKey = role.replace(/[\s-]+/g, "_").toLowerCase();
  const roleConfig = c[roleKey] ?? c.default;
  const tiers = roleConfig.tiers;

  return [...tasks].sort((a, b) => {
    const aTier = tierIndex(a, tiers);
    const bTier = tierIndex(b, tiers);
    if (aTier !== bTier) return aTier - bTier;

    // Within same tier: revenue-weighted stages sort by deal value desc
    if (roleConfig.revenueWeightedStages.length > 0) {
      const aRevenue = a.stage && roleConfig.revenueWeightedStages.includes(a.stage) ? (a.dealValue ?? 0) : 0;
      const bRevenue = b.stage && roleConfig.revenueWeightedStages.includes(b.stage) ? (b.dealValue ?? 0) : 0;
      if (aRevenue !== bRevenue) return bRevenue - aRevenue;
    }

    // Fallback: due date ascending (most urgent first)
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return aDue - bDue;
  });
}
