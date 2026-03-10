"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Plus,
  MessageSquare,
  StickyNote,
  ListTodo,
  ArrowRightLeft,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useAction } from "@/hooks/useActions";
import { ActionConfirmDialog } from "@/components/actions/ActionConfirmDialog";
import { trpc } from "@/lib/trpc";
import type { ActionType } from "@shared/types";

type PropertyItem = { id: number; address: string; city: string; state: string; status: string; leadSource: string | null; sellerName: string | null; sellerPhone: string | null; ghlContactId: string | null; stageChangedAt: Date | null; lastContactedAt: Date | null; lastConversationAt?: Date | string | null };

const STAGE_COLORS: Record<string, string> = { new: "bg-slate-500/15 text-slate-600 border-slate-500/30", lead: "bg-slate-500/15 text-slate-600 border-slate-500/30", contacted: "bg-blue-500/15 text-blue-600 border-blue-500/30", qualified: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", offer: "bg-amber-500/15 text-amber-600 border-amber-500/30", under_contract: "bg-violet-500/15 text-violet-600 border-violet-500/30" };

function daysInStage(ts: Date | string | null): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / (24 * 60 * 60 * 1000));
}

function sortInventoryClient<T extends { lastConversationAt?: Date | string | null; lastContactedAt?: Date | string | null; stageChangedAt?: Date | string | null }>(items: T[]): T[] {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return [...items].sort((a, b) => {
    const aConv = a.lastConversationAt ? new Date(a.lastConversationAt).getTime() : 0;
    const bConv = b.lastConversationAt ? new Date(b.lastConversationAt).getTime() : 0;
    const aNever = !(a.lastContactedAt || a.lastConversationAt);
    const bNever = !(b.lastContactedAt || b.lastConversationAt);
    const aRecent = aConv >= hourAgo, bRecent = bConv >= hourAgo;
    if (aRecent && !bRecent) return -1;
    if (!aRecent && bRecent) return 1;
    if (aNever && !bNever) return -1;
    if (!aNever && bNever) return 1;
    const aS = a.stageChangedAt ? new Date(a.stageChangedAt).getTime() : 0, bS = b.stageChangedAt ? new Date(b.stageChangedAt).getTime() : 0;
    return bS - aS;
  });
}

export function Inventory() {
  const { t, stages: configStages } = useTenantConfig();
  const stages = configStages?.length ? configStages : [{ code: "lead", name: "Lead", pipeline: "default", order: 0 }];
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [activeStage, setActiveStage] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [detailItem, setDetailItem] = useState<PropertyItem | null>(null);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; type: ActionType; item: { id: number; address: string; sellerName: string | null; sellerPhone: string | null; ghlContactId: string | null }; payload: Record<string, unknown> } | null>(null);
  const [stageChangeDialog, setStageChangeDialog] = useState<{ open: boolean; item: { id: number; address: string; status: string }; newStage: string } | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newSellerName, setNewSellerName] = useState("");
  const [newSellerPhone, setNewSellerPhone] = useState("");
  const { executeAction, isExecuting, result, reset } = useAction();

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: inventoryData, isLoading } = trpc.inventory.list.useQuery({
    stage: activeStage === "all" ? undefined : activeStage,
    search: searchDebounced || undefined,
    page: currentPage,
    limit: 50,
  });
  const { data: stageCountsRaw } = trpc.inventory.getStageCounts.useQuery();
  const utils = trpc.useUtils();
  const updateStageMutation = trpc.inventory.updateStage.useMutation({
    onSuccess: () => {
      void utils.inventory.list.invalidate();
      void utils.inventory.getStageCounts.invalidate();
      setStageChangeDialog(null);
    },
  });
  const createMutation = trpc.inventory.create.useMutation({
    onSuccess: () => {
      void utils.inventory.list.invalidate();
      void utils.inventory.getStageCounts.invalidate();
      setAddDialogOpen(false);
      setNewAddress(""); setNewCity(""); setNewState(""); setNewSellerName(""); setNewSellerPhone("");
    },
  });

  const items = inventoryData?.items ?? [];
  const sorted = useMemo(() => sortInventoryClient(items), [items]);
  const stageCountMap = useMemo(() => {
    const map: Record<string, number> = { all: 0 };
    (stageCountsRaw ?? []).forEach(({ stage, count }) => {
      map[stage] = count;
      map.all += count;
    });
    return map;
  }, [stageCountsRaw]);

  const openAction = (
    type: ActionType,
    item: { id: number; address: string; status: string; sellerName: string | null; sellerPhone: string | null; ghlContactId: string | null },
    payload: Record<string, unknown>
  ) => {
    if (type === "stage_change") {
      setStageChangeDialog({ open: true, item: { id: item.id, address: item.address, status: item.status }, newStage: item.status });
      return;
    }
    setActionDialog({
      open: true,
      type,
      item: { id: item.id, address: item.address, sellerName: item.sellerName, sellerPhone: item.sellerPhone, ghlContactId: item.ghlContactId },
      payload,
    });
    reset();
  };

  const handleConfirm = () => {
    if (!actionDialog) return;
    executeAction(actionDialog.type, actionDialog.item.ghlContactId ?? `p-${actionDialog.item.id}`, actionDialog.payload);
  };

  const handleStageChangeConfirm = () => {
    if (!stageChangeDialog) return;
    updateStageMutation.mutate({ propertyId: stageChangeDialog.item.id, newStage: stageChangeDialog.newStage });
  };

  const assetLabel = t?.assetPlural ?? "Properties";
  const assetSingular = t?.asset ?? "Property";
  const total = inventoryData?.total ?? 0;
  const limit = inventoryData?.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--g-text-primary)" }}>{assetLabel}</h1>
        <div className="flex flex-1 max-w-md gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--g-text-tertiary)" }} />
            <Input placeholder="Search by address or seller..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={() => setAddDialogOpen(true)}><Plus className="size-4" /> Add {assetSingular}</Button>
        </div>
      </div>

      <Tabs value={activeStage} onValueChange={(v) => { setActiveStage(v); setCurrentPage(1); }}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="all">
            All <Badge variant="secondary" className="ml-1.5">{stageCountMap.all}</Badge>
          </TabsTrigger>
          {stages.map((s) => <TabsTrigger key={s.code} value={s.code}>{s.name} <Badge variant="secondary" className="ml-1.5">{stageCountMap[s.code] ?? 0}</Badge></TabsTrigger>)}
        </TabsList>

        <TabsContent value={activeStage} className="mt-4">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="g-shimmer h-[140px] rounded-lg" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--g-text-tertiary)" }}>
              No properties yet
            </p>
          ) : (
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
                          <p className="font-semibold truncate" style={{ color: "var(--g-text-primary)" }}>{item.address}</p>
                          <p className="text-sm truncate" style={{ color: "var(--g-text-tertiary)" }}>{[item.city, item.state].filter(Boolean).join(", ") || "—"}</p>
                        </div>
                        <Badge className={cn("border text-xs shrink-0", STAGE_COLORS[item.status] ?? "bg-gray-500/15")}>{stages.find((s) => s.code === item.status)?.name ?? item.status}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--g-text-secondary)" }}>
                        <span>{item.leadSource ?? "—"}</span><span>{item.sellerName ?? "—"}</span>
                        <span>{daysInStage(item.stageChangedAt)}d in stage</span><span>Last: {item.lastContactedAt ? new Date(item.lastContactedAt).toLocaleDateString() : "—"}</span>
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
                        <Button variant="ghost" size="icon-sm" onClick={() => openAction("stage_change", item, { stageCode: item.status })}>
                          <ArrowRightLeft className="size-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
          {totalPages > 1 && !isLoading && sorted.length > 0 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Page {currentPage} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next</Button></div>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
        <SheetContent className="w-full sm:max-w-md" side="right">
          {detailItem && (
            <>
              <SheetHeader>
                <SheetTitle>{detailItem.address}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <p style={{ color: "var(--g-text-secondary)" }}>{[detailItem.address, detailItem.city, detailItem.state].filter(Boolean).join(", ") || detailItem.address}</p>
                <Badge className={cn("border", STAGE_COLORS[detailItem.status])}>{stages.find((s) => s.code === detailItem.status)?.name ?? detailItem.status}</Badge>
                <Separator />
                <div className="space-y-2 text-sm">
                  <p><span style={{ color: "var(--g-text-tertiary)" }}>Lead source:</span> {detailItem.leadSource ?? "—"}</p>
                  <p><span style={{ color: "var(--g-text-tertiary)" }}>Seller:</span> {detailItem.sellerName ?? "—"} {detailItem.sellerPhone ?? ""}</p>
                  <p><span style={{ color: "var(--g-text-tertiary)" }}>Days in stage:</span> {daysInStage(detailItem.stageChangedAt)}</p>
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" onClick={() => detailItem && openAction("sms", detailItem, { message: "" })}><MessageSquare className="size-4 mr-1" />SMS</Button>
                  <Button size="sm" variant="outline" onClick={() => detailItem && openAction("note", detailItem, { body: "" })}><StickyNote className="size-4 mr-1" />Note</Button>
                  <Button size="sm" variant="outline" onClick={() => detailItem && openAction("task", detailItem, { title: "", description: "" })}><ListTodo className="size-4 mr-1" />Task</Button>
                  <Button size="sm" variant="outline" onClick={() => detailItem && setStageChangeDialog({ open: true, item: { id: detailItem.id, address: detailItem.address, status: detailItem.status }, newStage: detailItem.status })}><ArrowRightLeft className="size-4 mr-1" />Stage</Button></div>
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
            to: { name: actionDialog.item.sellerName ?? "Contact", phone: actionDialog.item.sellerPhone ?? undefined },
            payload: actionDialog.payload,
          }}
          onConfirm={handleConfirm}
          isExecuting={isExecuting}
          result={result}
        />
      )}

      {stageChangeDialog && (
        <Dialog open={stageChangeDialog.open} onOpenChange={(o) => !o && setStageChangeDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Change stage</DialogTitle></DialogHeader>
            <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>{stageChangeDialog.item.address}</p>
            <Select value={stageChangeDialog.newStage} onValueChange={(v) => setStageChangeDialog((d) => d ? { ...d, newStage: v } : null)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStageChangeDialog(null)}>Cancel</Button>
              <Button onClick={handleStageChangeConfirm} disabled={updateStageMutation.isPending || stageChangeDialog.newStage === stageChangeDialog.item.status}>{updateStageMutation.isPending ? "Updating..." : "Confirm"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add {assetSingular}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Input placeholder="Address *" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
              <Input placeholder="State" value={newState} onChange={(e) => setNewState(e.target.value)} />
            </div>
            <Input placeholder="Seller name" value={newSellerName} onChange={(e) => setNewSellerName(e.target.value)} />
            <Input placeholder="Seller phone" value={newSellerPhone} onChange={(e) => setNewSellerPhone(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!newAddress.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ address: newAddress.trim(), city: newCity.trim(), state: newState.trim(), sellerName: newSellerName.trim() || undefined, sellerPhone: newSellerPhone.trim() || undefined })}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
