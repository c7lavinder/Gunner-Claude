/**
 * Inventory Sort — ranks assets within a stage by urgency.
 *
 * Tier 1: Needs Immediate Attention (unread SMS, missed call, overdue callback)
 * Tier 2: New (never contacted, newest first)
 * Tier 3: Active Working (contacted before but not today, days since last contact desc)
 * Tier 4: Contacted Today (pushed to bottom)
 *
 * Config values come from Tenant Playbook → Industry Playbook → defaults below.
 */

export interface InventorySortConfig {
  newLeadMaxAgeMinutes: number;
  contactedTodayHours: number;
  amPmSplitHour: number;
  unreadMessageBoost: number;
  newLeadBoost: number;
  newLeadUrgencyMinutes: number;
  daysNoContactWeight: number;
  contactedTodayPenalty: number;
}

export const DEFAULT_INVENTORY_SORT_CONFIG: InventorySortConfig = {
  newLeadMaxAgeMinutes: 60,
  contactedTodayHours: 24,
  amPmSplitHour: 12,
  unreadMessageBoost: 1000,
  newLeadBoost: 500,
  newLeadUrgencyMinutes: 15,
  daysNoContactWeight: 10,
  contactedTodayPenalty: -200,
};

export interface SortableProperty {
  id: number;
  status: string;
  createdAt: Date | string | null;
  lastContactedAt: Date | string | null;
  lastConversationAt: Date | string | null;
  stageChangedAt: Date | string | null;
  hasUnreadMessage?: boolean;
  hasMissedCallToday?: boolean;
  hasOverdueCallback?: boolean;
}

function toMs(d: Date | string | null): number {
  if (!d) return 0;
  return new Date(d).getTime();
}

export function inventorySort<T extends SortableProperty>(
  items: T[],
  config: Partial<InventorySortConfig> = {}
): T[] {
  const c = { ...DEFAULT_INVENTORY_SORT_CONFIG, ...config };
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const currentHour = new Date().getHours();

  function score(item: T): number {
    let s = 0;

    // Tier 1: Immediate attention
    if (item.hasUnreadMessage) s += c.unreadMessageBoost;
    if (item.hasMissedCallToday) s += c.unreadMessageBoost * 0.9;
    if (item.hasOverdueCallback) s += c.unreadMessageBoost * 0.8;

    const lastContact = toMs(item.lastContactedAt);
    const createdAt = toMs(item.createdAt);
    const contactedToday = lastContact >= todayMs;

    // Tier 4: Contacted today → penalty
    if (contactedToday) {
      s += c.contactedTodayPenalty;
      // AM/PM split: if contacted this AM and it's now PM, smaller penalty
      if (currentHour >= c.amPmSplitHour && lastContact < todayMs + c.amPmSplitHour * 3600000) {
        s += Math.abs(c.contactedTodayPenalty) * 0.3;
      }
      return s;
    }

    // Tier 2: New (never contacted)
    if (!lastContact && createdAt) {
      s += c.newLeadBoost;
      const ageMinutes = (now - createdAt) / 60000;
      if (ageMinutes <= c.newLeadUrgencyMinutes) {
        s += c.newLeadBoost; // double boost for 15-min urgency
      }
      s += Math.max(0, c.newLeadMaxAgeMinutes - ageMinutes);
      return s;
    }

    // Tier 3: Active working
    if (lastContact) {
      const daysSince = (now - lastContact) / (24 * 3600000);
      s += daysSince * c.daysNoContactWeight;
    }

    return s;
  }

  return [...items].sort((a, b) => score(b) - score(a));
}
