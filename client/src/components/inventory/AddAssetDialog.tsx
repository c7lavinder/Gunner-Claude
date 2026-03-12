import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Terminology } from "@shared/types";

interface AddAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: Terminology;
  newAddress: string;
  setNewAddress: (v: string) => void;
  newCity: string;
  setNewCity: (v: string) => void;
  newState: string;
  setNewState: (v: string) => void;
  newSellerName: string;
  setNewSellerName: (v: string) => void;
  newSellerPhone: string;
  setNewSellerPhone: (v: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function AddAssetDialog({
  open,
  onOpenChange,
  t,
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
  onSubmit,
  isSubmitting,
}: AddAssetDialogProps) {
  const assetSingular = t?.asset ?? "Property";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add {assetSingular}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <Input placeholder="Address *" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="City" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
            <Input placeholder="State" value={newState} onChange={(e) => setNewState(e.target.value)} />
          </div>
          <Input placeholder={`${t.contact} name`} value={newSellerName} onChange={(e) => setNewSellerName(e.target.value)} />
          <Input placeholder={`${t.contact} phone`} value={newSellerPhone} onChange={(e) => setNewSellerPhone(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!newAddress.trim() || isSubmitting} onClick={onSubmit}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
