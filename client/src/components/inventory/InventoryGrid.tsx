import { MessageSquare, StickyNote, ListTodo, ArrowRightLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PropertyItem } from "@/hooks/useInventoryData";
import type { StageDef, ActionType } from "@shared/types";

function daysInStage(ts: Date | string | null): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / (24 * 60 * 60 * 1000));
}

interface InventoryGridProps {
  items: PropertyItem[];
  stages: StageDef[];
  getStageColor: (code: string) => string;
  optimisticStages: Map<number, string>;
  onSelect: (item: PropertyItem) => void;
  onAction: (type: ActionType, item: PropertyItem, payload: Record<string, unknown>) => void;
  isLoading: boolean;
  assetLabel: string;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (fn: (p: number) => number) => void;
}

export function InventoryGrid({
  items,
  stages,
  getStageColor,
  optimisticStages,
  onSelect,
  onAction,
  isLoading,
  assetLabel,
  currentPage,
  totalPages,
  setCurrentPage,
}: InventoryGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm py-8 text-center text-[var(--g-text-tertiary)]">
        No {assetLabel.toLowerCase()} yet
      </p>
    );
  }

  return (
    <>
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const displayStage = optimisticStages.get(item.id) ?? item.status;
            const isOptimistic = optimisticStages.has(item.id);
            return (
              <Card
                key={item.id}
                className="cursor-pointer border transition-all hover:shadow-md border-[var(--g-border-subtle)]"
                onClick={() => onSelect(item)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate text-[var(--g-text-primary)]">{item.address}</p>
                      <p className="text-sm truncate text-[var(--g-text-tertiary)]">
                        {[item.city, item.state].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                    <Badge className={cn("border text-xs shrink-0 transition-opacity", getStageColor(displayStage), isOptimistic && "opacity-60")}>
                      {stages.find((s) => s.code === displayStage)?.name ?? displayStage}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--g-text-secondary)]">
                    <span>{item.leadSource ?? "—"}</span>
                    <span>{item.sellerName ?? "—"}</span>
                    <span>{daysInStage(item.stageChangedAt)}d in stage</span>
                    <span>Last: {item.lastContactedAt ? new Date(item.lastContactedAt).toLocaleDateString() : "—"}</span>
                  </div>
                  <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label="Send SMS" onClick={() => onAction("sms", item, { message: "" })}>
                      <MessageSquare className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Add note" onClick={() => onAction("note", item, { body: "" })}>
                      <StickyNote className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Create task" onClick={() => onAction("task", item, { title: "", description: "" })}>
                      <ListTodo className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Change stage" onClick={() => onAction("stage_change", item, { stageCode: item.status })}>
                      <ArrowRightLeft className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-[var(--g-text-secondary)]">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </>
  );
}
