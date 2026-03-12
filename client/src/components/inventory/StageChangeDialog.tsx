import { Button } from "@/components/ui/button";
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
import type { StageDef } from "@shared/types";

interface StageChangeDialogProps {
  open: boolean;
  item: { address: string; status: string } | null;
  newStage: string;
  onNewStageChange: (stage: string) => void;
  stages: StageDef[];
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function StageChangeDialog({ open, item, newStage, onNewStageChange, stages, onConfirm, onCancel, isPending }: StageChangeDialogProps) {
  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Change stage</DialogTitle></DialogHeader>
        <p className="text-sm text-[var(--g-text-secondary)]">{item.address}</p>
        <Select value={newStage} onValueChange={onNewStageChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm} disabled={isPending || newStage === item.status}>
            {isPending ? "Updating..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
