import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Phone,
  MessageCircle,
  Calendar,
  Tag,
  FileCheck,
} from "lucide-react";
import type { StatCard } from "@/hooks/useTodayData";
import { progressColor } from "@/hooks/useTodayData";

const KPI_ICONS: Record<string, typeof Phone> = {
  calls: Phone,
  convos: MessageCircle,
  apts: Calendar,
  offers: Tag,
  contracts: FileCheck,
};

interface KpiStatCardsProps {
  cards: StatCard[];
  kpiLabel: (key: string) => string;
  onClickCard: (metric: string) => void;
}

export function KpiStatCards({ cards, kpiLabel, onClickCard }: KpiStatCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map(({ key, actual, target }) => {
        const Icon = KPI_ICONS[key] ?? Phone;
        const pct = target > 0 ? (actual / target) * 100 : 0;
        return (
          <motion.div key={key} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
            <Card
              className="cursor-pointer border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] hover:bg-[var(--g-bg-card-hover)] transition-colors overflow-hidden"
              onClick={() => onClickCard(key)}
            >
              <CardContent className="p-4 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="size-4 text-[var(--g-accent-text)]" />
                  <span className="text-xs font-medium text-[var(--g-text-secondary)]">{kpiLabel(key)}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-[var(--g-text-primary)]">{actual}</span>
                  <span className="text-sm text-[var(--g-text-tertiary)]">/ {target}</span>
                </div>
              </CardContent>
              <div className="h-1 bg-[var(--g-bg-inset)]">
                <div
                  className={cn("h-full transition-all", progressColor(pct))}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
