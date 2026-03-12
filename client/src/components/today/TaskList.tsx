import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Phone,
  MessageSquare,
  StickyNote,
  CalendarPlus,
  ExternalLink,
  Search,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Inbox,
  Clock,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ActionConfirmDialog,
  type ActionConfirmDialogProps,
} from "@/components/actions/ActionConfirmDialog";
import type { ActionType } from "@shared/types";
import type { TaskItem } from "@/hooks/useTodayData";
import { relativeTime } from "@/hooks/useTodayData";

interface TaskListProps {
  tasks: TaskItem[];
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
  { icon: ExternalLink, label: "View in CRM", type: "sms" as ActionType },
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
  const { user } = useAuth();
  const [actionDialog, setActionDialog] = useState<PendingAction | null>(null);

  const stageLabel = (code: string) => {
    const s = stages.find((st) => st.code === code);
    return s?.name ?? code.replace(/_/g, " ").toUpperCase();
  };

  const openAction = (task: TaskItem, actionType: ActionType, label: string) => {
    if (label === "Call") {
      toast(`Calling ${task.contact || task.title}...`);
      return;
    }
    if (label === "View in CRM") {
      toast("CRM link not yet configured for this contact");
      return;
    }
    setActionDialog({
      type: actionType,
      from: { name: user?.name ?? "Unknown", userId: user?.id ?? 0 },
      to: { name: task.contact || task.title, contactId: task.id },
      payload:
        actionType === "sms"
          ? { message: "" }
          : actionType === "note"
            ? { body: "" }
            : { title: `Appointment with ${task.contact || task.title}`, startTime: "" },
    });
  };

  return (
    <>
      <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] overflow-hidden">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-[var(--g-text-primary)]">Tasks</h2>
            <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
            {propertyAlerts > 0 && (
              <Badge className="bg-[var(--g-grade-f)] text-white text-xs">{propertyAlerts} overdue</Badge>
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
            <div className="flex gap-1.5">
              <Badge className={cn("text-[10px] px-2", amPm?.amDone ? "bg-[var(--g-grade-a)] text-white" : "bg-[var(--g-bg-inset)] text-[var(--g-text-tertiary)]")}>
                AM {amPm?.amDone ? "✓" : ""}
              </Badge>
              <Badge className={cn("text-[10px] px-2", amPm?.pmDone ? "bg-[var(--g-grade-a)] text-white" : "bg-[var(--g-bg-inset)] text-[var(--g-text-tertiary)]")}>
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
                      <span className="text-xs font-mono text-[var(--g-text-tertiary)] w-5 text-right shrink-0">{idx + 1}</span>
                      <Checkbox
                        checked={isDone}
                        onCheckedChange={(v) => onComplete(t.id, !!v)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Badge className={cn("text-[10px] px-1.5 shrink-0", taskTypeColors[taskType] ?? "bg-[var(--g-bg-inset)] text-[var(--g-text-secondary)]")}>
                        {stageLabel(taskType)}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate text-[var(--g-text-primary)]", isDone && "line-through")}>{t.title}</p>
                        {/* Subtitle: property address or contact */}
                        {(t.propertyAddress || t.contact) && (
                          <p className="text-xs text-[var(--g-text-tertiary)] truncate">
                            {t.propertyAddress || t.contact}
                          </p>
                        )}
                      </div>
                      {/* Stage badge */}
                      {t.currentStage && (
                        <Badge variant="outline" className="text-[10px] shrink-0 border-[var(--g-border-subtle)] text-[var(--g-text-secondary)]">
                          {stageLabel(t.currentStage)}
                        </Badge>
                      )}
                      {/* Assigned to chip */}
                      {t.assignedTo && (
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="size-5 rounded-full bg-[var(--g-bg-inset)] flex items-center justify-center">
                            <User className="size-3 text-[var(--g-text-tertiary)]" />
                          </div>
                          <span className="text-[10px] text-[var(--g-text-tertiary)] hidden sm:inline">{t.assignedTo}</span>
                        </div>
                      )}
                      {/* Due date chip */}
                      {t.dueDate && (
                        <div className="flex items-center gap-1 text-[10px] text-[var(--g-text-tertiary)] shrink-0">
                          <Clock className="size-3" />
                          <span>{t.dueDate}</span>
                        </div>
                      )}
                      {isExpanded
                        ? <ChevronDown className="size-4 text-[var(--g-text-tertiary)] shrink-0" />
                        : <ChevronRight className="size-4 text-[var(--g-text-tertiary)] shrink-0" />
                      }
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
                              {t.contact && <span className="block text-xs text-[var(--g-text-tertiary)] mt-1">Contact: {t.contact}</span>}
                              {t.propertyAddress && <span className="block text-xs text-[var(--g-text-tertiary)] mt-0.5">{t.propertyAddress}</span>}
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2">
                              {TASK_ACTIONS.map(({ icon: AIcon, label, type }) => (
                                <Button key={label} variant="outline" size="sm" onClick={() => openAction(t, type, label)}>
                                  <AIcon className="size-3.5 mr-1" /> {label}
                                </Button>
                              ))}
                            </div>

                            {/* Activity tabs */}
                            <TaskActivityTabs contactPhone={t.contact} />
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
          onConfirm={() => { toast("Action sent!"); setActionDialog(null); }}
          onEdit={(edited) => setActionDialog((prev) => (prev ? { ...prev, payload: edited } : null))}
        />
      )}
    </>
  );
}

/* ── Task Activity Tabs ── */

function TaskActivityTabs({ contactPhone }: { contactPhone?: string }) {
  const [activeTab, setActiveTab] = useState<"activity" | "notes">("activity");

  // Only fetch if we have a phone to look up
  const { data: activity, isLoading } = trpc.today.getContactContext.useQuery(
    { phone: contactPhone ?? "" },
    { enabled: !!contactPhone },
  );

  return (
    <div>
      <div className="flex gap-4 text-xs border-t border-[var(--g-border-subtle)] pt-2">
        {(["activity", "notes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "font-medium transition-colors",
              activeTab === tab ? "text-[var(--g-accent-text)]" : "text-[var(--g-text-tertiary)] hover:text-[var(--g-text-secondary)]",
            )}
          >
            {tab === "activity" ? "Activity" : "Notes"}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {activeTab === "activity" && (
          <>
            {!contactPhone ? (
              <div className="flex items-center gap-2 py-3 text-xs text-[var(--g-text-tertiary)]">
                <Inbox className="size-4" />
                <span>No contact phone to look up activity</span>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="size-4 animate-spin rounded-full border-2 border-[var(--g-border-medium)] border-t-[var(--g-accent)]" />
              </div>
            ) : !activity?.length ? (
              <div className="flex items-center gap-2 py-3 text-xs text-[var(--g-text-tertiary)]">
                <Inbox className="size-4" />
                <span>No activity recorded</span>
              </div>
            ) : (
              <ScrollArea className="max-h-[160px]">
                <div className="space-y-1.5">
                  {activity.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 rounded-lg bg-[var(--g-bg-inset)] px-3 py-2">
                      <Phone className="size-3.5 text-[var(--g-text-tertiary)] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[var(--g-text-secondary)]">
                            Call with {item.contactName}
                          </span>
                          {item.grade && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{item.grade}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--g-text-tertiary)]">
                          {item.duration != null && <span>{Math.floor(item.duration / 60)}m {item.duration % 60}s</span>}
                          <span>{item.createdAt ? relativeTime(item.createdAt) : ""}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}

        {activeTab === "notes" && (
          <div className="flex items-center gap-2 py-3 text-xs text-[var(--g-text-tertiary)]">
            <StickyNote className="size-4" />
            <span>No notes yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
