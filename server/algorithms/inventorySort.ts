export const INVENTORY_SORT_CONFIG = {
  newLeadMaxAgeMinutes: 60,
  contactedTodayHours: 24,
  amPmSplitHour: 12,
  unreadMessageBoost: 1000,
  newLeadBoost: 500,
  newLeadUrgencyMinutes: 15,
  daysNoContactWeight: 10,
  contactedTodayPenalty: -200,
};

export interface InventoryItem {
  id: number;
  stageCode: string;
  hasUnreadMessage: boolean;
  hasMissedCall: boolean;
  hasCallbackToday: boolean;
  firstEnteredStageAt: Date | null;
  lastContactedAt: Date | null;
  createdAt: Date;
}

type Tier = 1 | 2 | 3 | 4;

function getTier(item: InventoryItem, cfg: typeof INVENTORY_SORT_CONFIG): Tier {
  if (item.hasUnreadMessage || item.hasMissedCall || item.hasCallbackToday) return 1;
  const now = new Date();
  const contactedToday =
    item.lastContactedAt &&
    (now.getTime() - item.lastContactedAt.getTime()) / (1000 * 60 * 60) < cfg.contactedTodayHours;
  if (contactedToday) return 4;
  const neverContacted = !item.lastContactedAt;
  const enteredRecently =
    item.firstEnteredStageAt &&
    (now.getTime() - item.firstEnteredStageAt.getTime()) / (1000 * 60) < cfg.newLeadMaxAgeMinutes;
  if (neverContacted && enteredRecently) return 2;
  return 3;
}

function daysSince(d: Date | null): number {
  if (!d) return Infinity;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
}

export function sortInventory(
  items: InventoryItem[],
  config?: Partial<typeof INVENTORY_SORT_CONFIG>
): InventoryItem[] {
  const cfg = { ...INVENTORY_SORT_CONFIG, ...config };
  return [...items].sort((a, b) => {
    const tierA = getTier(a, cfg);
    const tierB = getTier(b, cfg);
    if (tierA !== tierB) return tierA - tierB;
    if (tierA === 1)
      return (b.firstEnteredStageAt?.getTime() ?? 0) - (a.firstEnteredStageAt?.getTime() ?? 0);
    if (tierA === 2)
      return (b.firstEnteredStageAt?.getTime() ?? b.createdAt.getTime()) -
        (a.firstEnteredStageAt?.getTime() ?? a.createdAt.getTime());
    if (tierA === 3) return daysSince(b.lastContactedAt) - daysSince(a.lastContactedAt);
    return (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0);
  });
}
