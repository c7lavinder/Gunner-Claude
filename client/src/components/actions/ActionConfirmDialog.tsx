"use client";

import { useState, useEffect } from "react";
import type { ActionType, ActionResult } from "@shared/types";
import { CheckIcon, Loader2Icon, PencilIcon, XIcon, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SearchableDropdown, type DropdownOption } from "@/components/ui/SearchableDropdown";

const TYPE_COLORS: Record<ActionType, string> = {
  sms: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  note: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  task: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  appointment: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  stage_change: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
  workflow: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  tag: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  field_update: "bg-orange-500/15 text-orange-600 border-orange-500/30",
};
const EDIT_TYPES = ["note", "task"] as const;

function formatContent(type: ActionType, payload: Record<string, unknown>): string {
  if (type === "sms") return String(payload.message ?? "");
  if (type === "note") return String(payload.body ?? "");
  if (type === "task") return `${payload.title ?? ""}${payload.description ? `\n${payload.description}` : ""}`;
  if (type === "appointment") return `${payload.title ?? ""} — ${payload.startTime ?? ""}`;
  return JSON.stringify(payload);
}

export interface SenderOption {
  id: string;
  name: string;
  phone?: string;
}

export interface ActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: {
    type: ActionType;
    from: { name: string; phone?: string; userId?: number };
    to: { name: string; phone?: string; contactId?: string };
    payload: Record<string, unknown>;
  };
  onConfirm: () => void;
  onEdit?: (edited: Record<string, unknown>) => void;
  onSenderChange?: (sender: SenderOption) => void;
  senders?: SenderOption[];
  isExecuting?: boolean;
  result?: ActionResult | null;
}

export function ActionConfirmDialog({
  open,
  onOpenChange,
  action,
  onConfirm,
  onEdit,
  onSenderChange,
  senders,
  isExecuting = false,
  result,
}: ActionConfirmDialogProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(formatContent(action.type, action.payload));
  // Optimistic: flip to sending immediately on confirm click, before parent state updates
  const [optimisticSending, setOptimisticSending] = useState(false);
  useEffect(() => {
    setEditValue(formatContent(action.type, action.payload));
  }, [action.type, action.payload]);
  // Reset optimistic state when the dialog closes or result arrives
  useEffect(() => {
    if (!open || result) setOptimisticSending(false);
  }, [open, result]);

  const handleConfirm = () => {
    setOptimisticSending(true);
    onConfirm();
  };

  const state = result ? "RESULT" : (isExecuting || optimisticSending) ? "EXECUTING" : "PREVIEW";
  const content = editing ? editValue : formatContent(action.type, action.payload);
  const isSms = action.type === "sms";

  const handleSaveEdit = () => {
    if (action.type === "sms") onEdit?.({ ...action.payload, message: editValue });
    else if (action.type === "note") onEdit?.({ ...action.payload, body: editValue });
    else if (action.type === "task") {
      const [title, ...rest] = editValue.split("\n");
      onEdit?.({ ...action.payload, title: title ?? "", description: rest.join("\n").trim() || undefined });
    }
    setEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className={cn("border", TYPE_COLORS[action.type])}>{action.type.replace("_", " ")}</Badge>
          </div>
          <DialogTitle className="sr-only">Confirm action</DialogTitle>
        </DialogHeader>

        {state === "PREVIEW" && (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground shrink-0">From:</span>
                {senders && senders.length > 1 && onSenderChange ? (
                  <SearchableDropdown
                    className="flex-1"
                    options={senders.map((s): DropdownOption => ({
                      value: s.id,
                      label: s.name,
                      sublabel: s.phone,
                      icon: <User className="size-3" />,
                    }))}
                    value={String(action.from.userId ?? senders[0]?.id ?? "")}
                    onChange={(v) => {
                      const sender = senders.find((s) => s.id === v);
                      if (sender) onSenderChange(sender);
                    }}
                    placeholder="Choose sender"
                    searchPlaceholder="Search team members..."
                  />
                ) : (
                  <span>{action.from.name}{isSms && action.from.phone && ` — ${action.from.phone}`}</span>
                )}
              </div>
              <div><span className="text-muted-foreground">To:</span> {action.to.name}{isSms && action.to.phone && ` — ${action.to.phone}`}</div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>What</Label>
                {onEdit && !editing && <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => setEditing(true)}><PencilIcon className="size-4" /></Button>}
              </div>
              {editing ? (
                <div className="space-y-2">
                  {EDIT_TYPES.includes(action.type as typeof EDIT_TYPES[number]) ? (
                    <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={4} className="resize-none" />
                  ) : (
                    <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                  )}
                  <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">{content || <span className="text-muted-foreground">(empty)</span>}</div>
              )}
            </div>
          </div>
        )}
        {state === "EXECUTING" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sending...</p>
          </div>
        )}
        {state === "RESULT" && result && (
          <div className="py-4 flex items-center gap-3">
            {result.success ? (
              <><div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15"><CheckIcon className="size-5 text-emerald-600" /></div><div><p className="font-medium text-emerald-600">Sent successfully</p><p className="text-xs text-muted-foreground">{result.timestamp}</p></div></>
            ) : (
              <><div className="flex size-10 items-center justify-center rounded-full bg-destructive/15"><XIcon className="size-5 text-destructive" /></div><div><p className="font-medium text-destructive">{result.message}</p>{result.error && <p className="text-xs">{result.error}</p>}</div></>
            )}
          </div>
        )}
        <DialogFooter>
          {state === "PREVIEW" && (<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleConfirm} disabled={editing}>Confirm</Button></>)}
          {state === "EXECUTING" && <Button disabled><Loader2Icon className="size-4 animate-spin" /> Sending...</Button>}
          {state === "RESULT" && (<>{!result?.success && <Button variant="outline" onClick={onConfirm}>Retry</Button>}<Button onClick={() => onOpenChange(false)}>Close</Button></>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
