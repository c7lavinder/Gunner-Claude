import { useState, useMemo, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useAction } from "@/hooks/useActions";
import type { ActionType } from "@shared/types";

export type PropertyItem = {
  id: number;
  address: string;
  city: string;
  state: string;
  status: string;
  leadSource: string | null;
  sellerName: string | null;
  sellerPhone: string | null;
  ghlContactId: string | null;
  stageChangedAt: Date | null;
  lastContactedAt: Date | null;
  lastConversationAt?: Date | string | null;
  askingPrice?: number | null;
  arv?: number | null;
  condition?: string | null;
  motivation?: string | null;
};

/** Palette of Tailwind classes cycled across stages */
const STAGE_PALETTE = [
  "bg-slate-500/15 text-slate-600 border-slate-500/30",
  "bg-blue-500/15 text-blue-600 border-blue-500/30",
  "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  "bg-amber-500/15 text-amber-600 border-amber-500/30",
  "bg-violet-500/15 text-violet-600 border-violet-500/30",
  "bg-rose-500/15 text-rose-600 border-rose-500/30",
  "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
  "bg-orange-500/15 text-orange-600 border-orange-500/30",
];

const FALLBACK_STAGE_COLOR = "bg-[var(--g-accent-soft)] text-[var(--g-accent-text)]";

export type ActionDialogState = {
  open: boolean;
  type: ActionType;
  item: { id: number; address: string; sellerName: string | null; sellerPhone: string | null; ghlContactId: string | null };
  payload: Record<string, unknown>;
} | null;

export type StageChangeDialogState = {
  open: boolean;
  item: { id: number; address: string; status: string };
  newStage: string;
} | null;

export function useInventoryData() {
  const { t, stages: configStages } = useTenantConfig();
  const stages = configStages?.length
    ? configStages
    : [{ code: "new_lead", name: "New Lead", pipeline: "default", order: 0 }];

  // Build stage → color map dynamically from config stages
  const stageColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    stages.forEach((s, i) => {
      map[s.code] = STAGE_PALETTE[i % STAGE_PALETTE.length]!;
    });
    return map;
  }, [stages]);

  const getStageColor = useCallback(
    (code: string) => stageColorMap[code] ?? FALLBACK_STAGE_COLOR,
    [stageColorMap],
  );

  // ── State ──
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [activeStage, setActiveStage] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [detailItem, setDetailItem] = useState<PropertyItem | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState>(null);
  const [stageChangeDialog, setStageChangeDialog] = useState<StageChangeDialogState>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newSellerName, setNewSellerName] = useState("");
  const [newSellerPhone, setNewSellerPhone] = useState("");
  const [optimisticStages, setOptimisticStages] = useState<Map<number, string>>(new Map());
  const { executeAction, isExecuting, result, reset } = useAction();

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Queries ──
  const { data: inventoryData, isLoading } = trpc.inventory.list.useQuery({
    stage: activeStage === "all" ? undefined : activeStage,
    search: searchDebounced || undefined,
    page: currentPage,
    limit: 50,
  });
  const { data: stageCountsRaw } = trpc.inventory.getStageCounts.useQuery();
  const utils = trpc.useUtils();

  // ── Mutations ──
  const updateStageMutation = trpc.inventory.updateStage.useMutation();
  const createMutation = trpc.inventory.create.useMutation({
    onSuccess: () => {
      void utils.inventory.list.invalidate();
      void utils.inventory.getStageCounts.invalidate();
      setAddDialogOpen(false);
      setNewAddress("");
      setNewCity("");
      setNewState("");
      setNewSellerName("");
      setNewSellerPhone("");
    },
  });

  // ── Derived data ──
  const items = inventoryData?.items ?? [];
  const total = inventoryData?.total ?? 0;
  const limit = inventoryData?.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const stageCounts = useMemo(() => {
    const map: Record<string, number> = { all: 0 };
    (stageCountsRaw ?? []).forEach(({ stage, count }) => {
      map[stage] = count;
      map.all += count;
    });
    return map;
  }, [stageCountsRaw]);

  // ── Handlers ──
  const openAction = useCallback(
    (
      type: ActionType,
      item: PropertyItem,
      payload: Record<string, unknown>,
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
    },
    [reset],
  );

  const handleActionConfirm = useCallback(() => {
    if (!actionDialog) return;
    executeAction(actionDialog.type, actionDialog.item.ghlContactId ?? `p-${actionDialog.item.id}`, actionDialog.payload);
  }, [actionDialog, executeAction]);

  const handleStageChangeConfirm = useCallback(() => {
    if (!stageChangeDialog) return;
    const { item, newStage } = stageChangeDialog;
    const previousStage = item.status;
    setOptimisticStages((prev) => new Map(prev).set(item.id, newStage));
    setStageChangeDialog(null);
    updateStageMutation.mutate(
      { propertyId: item.id, newStage },
      {
        onSuccess: () => {
          setOptimisticStages((prev) => { const next = new Map(prev); next.delete(item.id); return next; });
          void utils.inventory.list.invalidate();
          void utils.inventory.getStageCounts.invalidate();
        },
        onError: () => {
          setOptimisticStages((prev) => { const next = new Map(prev); next.set(item.id, previousStage); return next; });
          void utils.inventory.list.invalidate();
          void utils.inventory.getStageCounts.invalidate();
        },
      },
    );
  }, [stageChangeDialog, updateStageMutation, utils]);

  const handleCreate = useCallback(() => {
    createMutation.mutate({
      address: newAddress.trim(),
      city: newCity.trim(),
      state: newState.trim(),
      sellerName: newSellerName.trim() || undefined,
      sellerPhone: newSellerPhone.trim() || undefined,
    });
  }, [createMutation, newAddress, newCity, newState, newSellerName, newSellerPhone]);

  const setActiveStageAndReset = useCallback((stage: string) => {
    setActiveStage(stage);
    setCurrentPage(1);
  }, []);

  return {
    // Config
    t,
    stages,
    stageColorMap,
    getStageColor,

    // List data
    items,
    isLoading,
    currentPage,
    setCurrentPage,
    totalPages,
    stageCounts,

    // Search & filter
    search,
    setSearch,
    activeStage,
    setActiveStage: setActiveStageAndReset,

    // Detail sheet
    detailItem,
    setDetailItem,

    // Actions
    openAction,
    actionDialog,
    setActionDialog,
    handleActionConfirm,
    isExecuting,
    result,

    // Stage change
    stageChangeDialog,
    setStageChangeDialog,
    handleStageChangeConfirm,
    isStageChangePending: updateStageMutation.isPending,

    // Add asset
    addDialogOpen,
    setAddDialogOpen,
    newAddress,
    setNewAddress,
    newCity,
    setNewCity,
    newState,
    setNewState,
    newSellerName,
    setNewSellerName,
    newSellerPhone,
    setNewSellerPhone,
    handleCreate,
    isCreating: createMutation.isPending,

    // Optimistic
    optimisticStages,
  };
}
