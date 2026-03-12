import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Phone,
  MessageSquare,
  StickyNote,
  CalendarPlus,
  ExternalLink,
  GitBranch,
  Search,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import {
  ActionConfirmDialog,
  type ActionConfirmDialogProps,
} from "@/components/actions/ActionConfirmDialog";
import type { ActionType } from "@shared/types";

interface Task {
  id: string;
  title: string;
  contact?: string;
  due?: string;
}

interface TaskListProps {
  tasks: Task[];
  taskSearch: string;
  setTaskSearch: (v: string) => void;
  expandedTaskId: string | null;
  setExpandedTaskId: (id: string | null) => void;
  completedTasks: Set<string>;
  onComplete: (taskId: string, done: boolean) => void;
  taskTypeColors: Record<string, string>;
  resolveTaskType: (title: string) => string;
  stages: Array<{ code: string; name: string }>;
  propertyAlerts: number;
  amPm?: { amDone: boolean; pmDone: boolean } | null;
}

type PendingAction = Omit<ActionConfirmDialogProps["action"], "from"> & {
  from: { name: string; phone?: string; userId?: number };
};

const TASK_ACTIONS = [
  { icon: Phone, label: "Call", type: "sms" as ActionType },
  { icon: MessageSquare, label: "Text", type: "sms" as ActionType },
  { icon: StickyNote, label: "Add Note", type: "note" as ActionType },
  { icon: CalendarPlus, label: "Create Apt", type: "appointment" as ActionType },
  { icon: GitBranch, label: "Workflow", type: "workflow" as ActionType },
] as const;

export function TaskList({
  tasks,
  taskSearch,
  setTaskSearch,
  expandedTaskId,
  setExpandedTaskId,
  completedTasks,
  onComplete,
  taskTypeColors,
  resolveTaskType,
  stages,
  propertyAlerts,
  amPm,
}: TaskListProps) {
  const [actionDialog, setActionDialog] = useState<PendingAction | null>(null);

  const stageLabel = (code: string) => {
    const s = stages.find((st) => st.code === code);
    return s?.name ?? code.replace(/_/g, " ").toUpperCase();
  };

  const openAction = (task: Task, actionType: ActionType, label: string) => {
    if (label === "Call") {
      toast(`Calling ${task.contact || task.title}...`);
      return;
    }
    setActionDialog({
      type: actionType,
      from: { name: "You", userId: 0 },
      to: { name: task.contact || task.title, contactId: task.id },
      payload:
        actionType === "sms"
          ? { message: "" }
          : actionType === "note"
            ? { body: "" }
            : actionType === "appointment"
              ? { title: `Appointment with ${task.contact || task.title}`, startTime: "" }
              : { workflowId: "" },
    });
  };

  return (
    <>
      <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] overflow-hidden">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-[var(--g-text-primary)]">Tasks</h2>
            <Badge variant="secondary" className="text-xs">
              {tasks.length}
            </Badge>
            {propertyAlerts > 0 && (
              <Badge className="bg-[var(--g-grade-f)] text-white text-xs">
                {propertyAlerts} overdue
              </Badge>
            )}
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--g-text-tertiary)]" />
              <Input
                placeholder="Search tasks or contacts..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="h-8 w-56 pl-8 text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
              />
            </div>
            {/* AM/PM pills */}
            <div className="flex gap-1.5">
              <Badge
                className={cn(
                  "text-[10px] px-2",
                  amPm?.amDone
                    ? "bg-[var(--g-grade-a)] text-white"
                    : "bg-[var(--g-bg-inset)] text-[var(--g-text-tertiary)]",
                )}
              >
                AM {amPm?.amDone ? "✓" : ""}
              </Badge>
              <Badge
                className={cn(
                  "text-[10px] px-2",
                  amPm?.pmDone
                    ? "bg-[var(--g-grade-a)] text-white"
                    : "bg-[var(--g-bg-inset)] text-[var(--g-text-tertiary)]",
                )}
              >
                PM {amPm?.pmDone ? "✓" : ""}
              </Badge>
            </div>
          </div>

          {/* Task rows */}
          {!tasks.length ? (
            <EmptyState icon={CheckSquare} title="All caught up" description="No tasks due today" />
          ) : (
            <div className="space-y-1">
              {tasks.map((t, idx) => {
                const isExpanded = expandedTaskId === t.id;
                const isDone = completedTasks.has(t.id);
                const taskType = resolveTaskType(t.title);
                return (
                  <div key={t.id}>
                    <motion.div
                      whileHover={{ y: -1 }}
                      transition={{ duration: 0.1 }}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--g-bg-surface)]",
                        isDone && "opacity-50",
                      )}
                      onClick={() => setExpandedTaskId(isExpanded ? null : t.id)}
                    >
                      <span className="text-xs font-mono text-[var(--g-text-tertiary)] w-5 text-right shrink-0">
                        {idx + 1}
                      </span>
                      <Checkbox
                        checked={isDone}
                        onCheckedChange={(v) => onComplete(t.id, !!v)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5 shrink-0",
                          taskTypeColors[taskType] ??
                            "bg-[var(--g-bg-inset)] text-[var(--g-text-secondary)]",
                        )}
                      >
                        {stageLabel(taskType)}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm truncate text-[var(--g-text-primary)]",
                            isDone && "line-through",
                          )}
                        >
                          {t.title}
                        </p>
                        {t.contact && (
                          <p className="text-xs text-[var(--g-text-tertiary)]">{t.contact}</p>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-[var(--g-text-tertiary)] shrink-0" />
                      ) : (
                        <ChevronRight className="size-4 text-[var(--g-text-tertiary)] shrink-0" />
                      )}
                    </motion.div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="ml-8 pl-3 border-l-2 border-[var(--g-border-subtle)] pb-3 space-y-3">
                            {/* Instructions */}
                            <div className="text-sm text-[var(--g-text-secondary)] bg-[var(--g-bg-inset)] rounded-lg p-3">
                              {t.title}
                              {t.contact && (
                                <span className="block text-xs text-[var(--g-text-tertiary)] mt-1">
                                  Contact: {t.contact}
                                </span>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2">
                              {TASK_ACTIONS.map(({ icon: AIcon, label, type }) => (
                                <Button
                                  key={label}
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAction(t, type, label)}
                                >
                                  <AIcon className="size-3.5 mr-1" /> {label}
                                </Button>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toast("CRM link not yet configured for this contact")}
                              >
                                <ExternalLink className="size-3.5 mr-1" /> View in CRM
                              </Button>
                            </div>

                            {/* Activity — clean empty state */}
                            <div className="flex gap-4 text-xs text-[var(--g-text-tertiary)] border-t border-[var(--g-border-subtle)] pt-2">
                              <span className="text-[var(--g-accent-text)] font-medium">
                                Today&apos;s Activity
                              </span>
                            </div>
                            <div className="flex items-center gap-2 py-3 text-xs text-[var(--g-text-tertiary)]">
                              <Inbox className="size-4" />
                              <span>No activity recorded today</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Confirm Dialog */}
      {actionDialog && (
        <ActionConfirmDialog
          open={!!actionDialog}
          onOpenChange={(o) => !o && setActionDialog(null)}
          action={actionDialog}
          onConfirm={() => {
            toast("Action sent!");
            setActionDialog(null);
          }}
          onEdit={(edited) =>
            setActionDialog((prev) => (prev ? { ...prev, payload: edited } : null))
          }
        />
      )}
    </>
  );
}
