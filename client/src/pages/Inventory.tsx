import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionConfirmDialog } from "@/components/actions/ActionConfirmDialog";
import { useInventoryData } from "@/hooks/useInventoryData";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { InventoryGrid } from "@/components/inventory/InventoryGrid";
import { InventoryDetailSheet } from "@/components/inventory/InventoryDetailSheet";
import { StageChangeDialog } from "@/components/inventory/StageChangeDialog";
import { AddAssetDialog } from "@/components/inventory/AddAssetDialog";

export function Inventory() {
  const data = useInventoryData();
  const assetLabel = data.t?.assetPlural ?? "Properties";
  const assetSingular = data.t?.asset ?? "Property";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--g-text-primary)]">{assetLabel}</h1>
        <div className="flex flex-1 max-w-md gap-2">
          <InventoryFilters
            search={data.search}
            setSearch={data.setSearch}
            activeStage={data.activeStage}
            setActiveStage={data.setActiveStage}
            stageCounts={data.stageCounts}
            stages={data.stages}
            assetLabel={assetLabel}
          />
          <Button onClick={() => data.setAddDialogOpen(true)}>
            <Plus className="size-4" /> Add {assetSingular}
          </Button>
        </div>
      </div>

      <InventoryGrid
        items={data.items}
        stages={data.stages}
        getStageColor={data.getStageColor}
        optimisticStages={data.optimisticStages}
        onSelect={data.setDetailItem}
        onAction={data.openAction}
        isLoading={data.isLoading}
        assetLabel={assetLabel}
        currentPage={data.currentPage}
        totalPages={data.totalPages}
        setCurrentPage={data.setCurrentPage}
      />

      <InventoryDetailSheet
        asset={data.detailItem}
        open={!!data.detailItem}
        onClose={() => data.setDetailItem(null)}
        stages={data.stages}
        getStageColor={data.getStageColor}
        t={data.t}
        onAction={data.openAction}
        onStageChange={(item) =>
          data.setStageChangeDialog({
            open: true,
            item: { id: item.id, address: item.address, status: item.status },
            newStage: item.status,
          })
        }
      />

      {data.actionDialog && (
        <ActionConfirmDialog
          open={data.actionDialog.open}
          onOpenChange={(o) => !o && data.setActionDialog(null)}
          action={{
            type: data.actionDialog.type,
            from: { name: "You", phone: "" },
            to: {
              name: data.actionDialog.item.sellerName ?? data.t.contact,
              phone: data.actionDialog.item.sellerPhone ?? undefined,
            },
            payload: data.actionDialog.payload,
          }}
          onConfirm={data.handleActionConfirm}
          isExecuting={data.isExecuting}
          result={data.result}
        />
      )}

      <StageChangeDialog
        open={!!data.stageChangeDialog?.open}
        item={data.stageChangeDialog?.item ?? null}
        newStage={data.stageChangeDialog?.newStage ?? ""}
        onNewStageChange={(v) =>
          data.setStageChangeDialog((d) => (d ? { ...d, newStage: v } : null))
        }
        stages={data.stages}
        onConfirm={data.handleStageChangeConfirm}
        onCancel={() => data.setStageChangeDialog(null)}
        isPending={data.isStageChangePending}
      />

      <AddAssetDialog
        open={data.addDialogOpen}
        onOpenChange={data.setAddDialogOpen}
        t={data.t}
        newAddress={data.newAddress}
        setNewAddress={data.setNewAddress}
        newCity={data.newCity}
        setNewCity={data.setNewCity}
        newState={data.newState}
        setNewState={data.setNewState}
        newSellerName={data.newSellerName}
        setNewSellerName={data.setNewSellerName}
        newSellerPhone={data.newSellerPhone}
        setNewSellerPhone={data.setNewSellerPhone}
        onSubmit={data.handleCreate}
        isSubmitting={data.isCreating}
      />
    </div>
  );
}
