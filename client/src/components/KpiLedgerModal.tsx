import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function gradeColor(grade: string | null): string {
  if (!grade) return "bg-[var(--g-text-tertiary)]";
  const g = grade.toUpperCase();
  if (g.startsWith("A")) return "bg-[var(--g-grade-a)]";
  if (g.startsWith("B")) return "bg-[var(--g-grade-b)]";
  if (g.startsWith("C")) return "bg-[var(--g-grade-c)]";
  if (g.startsWith("D")) return "bg-[var(--g-grade-d)]";
  return "bg-[var(--g-grade-f)]";
}

interface KpiLedgerModalProps {
  kpiType: string;
  label: string;
  date: string;
  onClose: () => void;
}

export function KpiLedgerModal({ kpiType, label, date, onClose }: KpiLedgerModalProps) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newContact, setNewContact] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.today.getKpiLedger.useQuery({ kpiType, date });
  const addMutation = trpc.today.addManualKpiEntry.useMutation({
    onSuccess: () => {
      void utils.today.getKpiLedger.invalidate();
      void utils.today.getDayHubStats.invalidate();
      setAdding(false);
      setNewContact("");
      setNewNotes("");
    },
  });

  const q = search.toLowerCase().trim();
  const autoEntries = useMemo(
    () => (data?.autoEntries ?? []).filter((e) => !q || e.contactName.toLowerCase().includes(q)),
    [data?.autoEntries, q]
  );
  const manualEntries = useMemo(
    () => (data?.manualEntries ?? []).filter((e) => !q || e.contactName.toLowerCase().includes(q)),
    [data?.manualEntries, q]
  );

  const dateDisplay = new Date(date + "T12:00:00").toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {label} Ledger
            <Badge variant="outline" className="text-xs font-normal">{dateDisplay}</Badge>
          </DialogTitle>
          <p className="text-sm text-[var(--g-text-tertiary)]">
            All {label.toLowerCase()} counted toward today&apos;s KPI total.
          </p>
        </DialogHeader>

        <Input
          placeholder="Search entries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
        />

        <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-[var(--g-bg-inset)] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Auto-Detected */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-[var(--g-text-secondary)] uppercase tracking-wide">Auto-Detected</p>
                  <Badge variant="secondary" className="text-[10px]">{autoEntries.length}</Badge>
                </div>
                {autoEntries.length === 0 ? (
                  <p className="text-sm text-[var(--g-text-tertiary)] py-2">No auto-detected entries.</p>
                ) : (
                  <div className="space-y-1">
                    {autoEntries.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-[var(--g-bg-surface)]">
                        <span className="text-xs text-[var(--g-text-tertiary)] w-16 shrink-0">{fmtTime(e.time)}</span>
                        <span className="text-sm text-[var(--g-text-primary)] flex-1 truncate">{e.contactName}</span>
                        {e.assignedTo && (
                          <Badge variant="outline" className="text-[10px] shrink-0">{e.assignedTo}</Badge>
                        )}
                        {e.duration != null && (
                          <span className="text-xs text-[var(--g-text-tertiary)] shrink-0">{fmtDuration(e.duration)}</span>
                        )}
                        {e.grade && (
                          <div className={cn("size-6 rounded-full flex items-center justify-center text-[10px] font-bold text-[var(--g-text-inverse)] shrink-0", gradeColor(e.grade))}>
                            {e.grade}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Entries */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-[var(--g-text-secondary)] uppercase tracking-wide">Manual Entries</p>
                  <Badge variant="secondary" className="text-[10px]">{manualEntries.length}</Badge>
                </div>
                {manualEntries.length === 0 ? (
                  <p className="text-sm text-[var(--g-text-tertiary)] py-2">No manual entries.</p>
                ) : (
                  <div className="space-y-1">
                    {manualEntries.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-[var(--g-bg-surface)]">
                        <span className="text-xs text-[var(--g-text-tertiary)] w-16 shrink-0">{fmtTime(e.time)}</span>
                        <span className="text-sm text-[var(--g-text-primary)] flex-1 truncate">{e.contactName}</span>
                        {e.notes && <span className="text-xs text-[var(--g-text-tertiary)] truncate max-w-[120px]">{e.notes}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </ScrollArea>

        {adding ? (
          <div className="space-y-2 pt-2 border-t border-[var(--g-border-subtle)]">
            <Input
              placeholder="Contact name"
              value={newContact}
              onChange={(e) => setNewContact(e.target.value)}
              className="h-8 text-sm bg-[var(--g-bg-surface)]"
            />
            <Input
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="h-8 text-sm bg-[var(--g-bg-surface)]"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  addMutation.mutate({
                    kpiType,
                    contactName: newContact.trim() || undefined,
                    notes: newNotes.trim() || undefined,
                  })
                }
                disabled={addMutation.isPending}
              >
                {addMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setAdding(true)}>
            <Plus className="size-3.5 mr-1" /> Add Manual Entry
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
