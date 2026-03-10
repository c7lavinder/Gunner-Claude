"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  MessageSquare,
  StickyNote,
  ListTodo,
  ArrowRightLeft,
  PhoneMissed,
  PhoneIncoming,
  Circle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useAction } from "@/hooks/useActions";
import { ActionConfirmDialog } from "@/components/actions/ActionConfirmDialog";
import type { ActionType } from "@shared/types";
import {
  sortInventory,
  type InventoryItem,
} from "../../../server/algorithms/inventorySort";

const MOCK_STAGES = [
  { code: "new", name: "New", order: 1 },
  { code: "contacted", name: "Contacted", order: 2 },
  { code: "qualified", name: "Qualified", order: 3 },
  { code: "offer", name: "Offer", order: 4 },
  { code: "under_contract", name: "Under Contract", order: 5 },
];

interface MockItem extends InventoryItem {
  name: string;
  address: string;
  leadSource: string;
  assignedTo: string;
  contactId: string;
  contactName: string;
  contactPhone?: string;
}

function makeMockItem(
  overrides: Partial<MockItem> & Pick<MockItem, "id" | "name" | "address" | "stageCode">
): MockItem {
  const base: MockItem = {
    id: overrides.id,
    name: overrides.name,
    address: overrides.address,
    stageCode: overrides.stageCode,
    leadSource: "Website",
    assignedTo: "Sarah M.",
    contactId: `c-${overrides.id}`,
    contactName: "John Doe",
    contactPhone: "(555) 123-4567",
    hasUnreadMessage: false,
    hasMissedCall: false,
    hasCallbackToday: false,
    firstEnteredStageAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    lastContactedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  };
  return { ...base, ...overrides };
}

const MOCK_ITEMS: MockItem[] = [
  makeMockItem({ id: 1, name: "Oak Street Residence", address: "142 Oak St", stageCode: "new", hasUnreadMessage: true }),
  makeMockItem({ id: 2, name: "Riverside View", address: "88 River Rd", stageCode: "new", hasMissedCall: true }),
  makeMockItem({ id: 3, name: "Maple Lane Unit", address: "200 Maple Ln", stageCode: "new" }),
  makeMockItem({ id: 4, name: "Pine Grove House", address: "55 Pine Ave", stageCode: "contacted", hasCallbackToday: true }),
  makeMockItem({ id: 5, name: "Cedar Heights", address: "12 Cedar Dr", stageCode: "contacted" }),
  makeMockItem({ id: 6, name: "Birchwood Place", address: "301 Birch St", stageCode: "contacted" }),
  makeMockItem({ id: 7, name: "Elm Street Condo", address: "77 Elm St", stageCode: "qualified" }),
  makeMockItem({ id: 8, name: "Willow Creek", address: "99 Willow Way", stageCode: "qualified" }),
  makeMockItem({ id: 9, name: "Ashford Manor", address: "44 Ashford Rd", stageCode: "qualified" }),
  makeMockItem({ id: 10, name: "Summit View", address: "22 Summit Blvd", stageCode: "offer" }),
  makeMockItem({ id: 11, name: "Harbor Point", address: "5 Harbor Dr", stageCode: "offer" }),
  makeMockItem({ id: 12, name: "Lakeside Retreat", address: "100 Lake Rd", stageCode: "under_contract" }),
  makeMockItem({ id: 13, name: "Meadowbrook", address: "33 Meadow Ln", stageCode: "under_contract" }),
];

const STAGE_COLORS: Record<string, string> = {
  new: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  contacted: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  qualified: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  offer: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  under_contract: "bg-violet-500/15 text-violet-600 border-violet-500/30",
};

function daysInStage(firstEntered: Date | null): number {
  if (!firstEntered) return 0;
  return Math.floor((Date.now() - firstEntered.getTime()) / (24 * 60 * 60 * 1000));
}

export function Inventory() {
  const { t, stages: configStages } = useTenantConfig();
  const stages = configStages?.length ? configStages : MOCK_STAGES;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [detailItem, setDetailItem] = useState<MockItem | null>(null);
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: ActionType;
    item: MockItem;
    payload: Record<string, unknown>;
  } | null>(null);
  const { executeAction, isExecuting, result, reset } = useAction();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return MOCK_ITEMS.filter(
      (i) =>
        (!q || i.name.toLowerCase().includes(q) || i.address.toLowerCase().includes(q)) &&
        (activeTab === "all" || i.stageCode === activeTab)
    );
  }, [search, activeTab]);

  const sorted = useMemo(() => sortInventory(filtered) as MockItem[], [filtered]);
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: MOCK_ITEMS.length };
    stages.forEach((s) => {
      counts[s.code] = MOCK_ITEMS.filter((i) => i.stageCode === s.code).length;
    });
    return counts;
  }, [stages]);

  const openAction = (type: ActionType, item: MockItem, payload: Record<string, unknown>) => {
    setActionDialog({ open: true, type, item, payload });
    reset();
  };

  const handleConfirm = () => {
    if (!actionDialog) return;
    executeAction(actionDialog.type, actionDialog.item.contactId, actionDialog.payload);
  };

  const assetLabel = t?.assetPlural ?? "Properties";
  const assetSingular = t?.asset ?? "Property";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--g-text-primary)" }}>
          {assetLabel}
        </h1>
        <div className="flex flex-1 max-w-md gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--g-text-tertiary)" }} />
            <Input
              placeholder="Search by name or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button>
            <Plus className="size-4" />
            Add {assetSingular}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="all">
            All <Badge variant="secondary" className="ml-1.5">{stageCounts.all}</Badge>
          </TabsTrigger>
          {stages.map((s) => (
            <TabsTrigger key={s.code} value={s.code}>
              {s.name} <Badge variant="secondary" className="ml-1.5">{stageCounts[s.code] ?? 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((item) => (
                <Card
                  key={item.id}
                  className="cursor-pointer border transition-all hover:shadow-md"
                  style={{ borderColor: "var(--g-border-subtle)" }}
                  onClick={() => setDetailItem(item)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate" style={{ color: "var(--g-text-primary)" }}>{item.name}</p>
                        <p className="text-sm truncate" style={{ color: "var(--g-text-tertiary)" }}>{item.address}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.hasUnreadMessage && <Circle className="size-2.5 fill-red-500 text-red-500" />}
                        {item.hasMissedCall && <PhoneMissed className="size-4 text-red-500" />}
                        {item.hasCallbackToday && <PhoneIncoming className="size-4 text-amber-500" />}
                        <Badge className={cn("border text-xs", STAGE_COLORS[item.stageCode] ?? "bg-gray-500/15")}>
                          {stages.find((s) => s.code === item.stageCode)?.name ?? item.stageCode}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--g-text-secondary)" }}>
                      <span>{item.leadSource}</span>
                      <span>{item.assignedTo}</span>
                      <span>{daysInStage(item.firstEnteredStageAt)}d in stage</span>
                      <span>Last: {item.lastContactedAt ? new Date(item.lastContactedAt).toLocaleDateString() : "—"}</span>
                    </div>
                    <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon-sm" onClick={() => openAction("sms", item, { message: "" })}>
                        <MessageSquare className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => openAction("note", item, { body: "" })}>
                        <StickyNote className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => openAction("task", item, { title: "", description: "" })}>
                        <ListTodo className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => openAction("stage_change", item, { stageCode: item.stageCode })}>
                        <ArrowRightLeft className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Sheet open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
        <SheetContent className="w-full sm:max-w-md" side="right">
          {detailItem && (
            <>
              <SheetHeader>
                <SheetTitle>{detailItem.name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <p style={{ color: "var(--g-text-secondary)" }}>{detailItem.address}</p>
                <Badge className={cn("border", STAGE_COLORS[detailItem.stageCode])}>
                  {stages.find((s) => s.code === detailItem.stageCode)?.name}
                </Badge>
                <Separator />
                <div className="space-y-2 text-sm">
                  <p><span style={{ color: "var(--g-text-tertiary)" }}>Lead source:</span> {detailItem.leadSource}</p>
                  <p><span style={{ color: "var(--g-text-tertiary)" }}>Assigned:</span> {detailItem.assignedTo}</p>
                  <p><span style={{ color: "var(--g-text-tertiary)" }}>Contact:</span> {detailItem.contactName} {detailItem.contactPhone}</p>
                  <p><span style={{ color: "var(--g-text-tertiary)" }}>Days in stage:</span> {daysInStage(detailItem.firstEnteredStageAt)}</p>
                </div>
                <Separator />
                <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Recent activity</p>
                <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>No recent activity</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" onClick={() => openAction("sms", detailItem, { message: "" })}><MessageSquare className="size-4 mr-1" />SMS</Button>
                  <Button size="sm" variant="outline" onClick={() => openAction("note", detailItem, { body: "" })}><StickyNote className="size-4 mr-1" />Note</Button>
                  <Button size="sm" variant="outline" onClick={() => openAction("task", detailItem, { title: "", description: "" })}><ListTodo className="size-4 mr-1" />Task</Button>
                  <Button size="sm" variant="outline" onClick={() => openAction("stage_change", detailItem, { stageCode: detailItem.stageCode })}><ArrowRightLeft className="size-4 mr-1" />Stage</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {actionDialog && (
        <ActionConfirmDialog
          open={actionDialog.open}
          onOpenChange={(o) => !o && setActionDialog(null)}
          action={{
            type: actionDialog.type,
            from: { name: "You", phone: "" },
            to: { name: actionDialog.item.contactName, phone: actionDialog.item.contactPhone },
            payload: actionDialog.payload,
          }}
          onConfirm={handleConfirm}
          isExecuting={isExecuting}
          result={result}
        />
      )}
    </div>
  );
}
