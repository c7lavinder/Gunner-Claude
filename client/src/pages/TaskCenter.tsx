import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  Phone,
  MessageSquare,
  Zap,
  StickyNote,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  CalendarDays,
  RefreshCw,
  Users,
  Search,
  FileText,
  ExternalLink,
} from "lucide-react";

// ─── TYPES ──────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  body?: string;
  assignedTo: string;
  dueDate: string;
  completed: boolean;
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  overdueDays: number;
  group: "overdue" | "today" | "upcoming";
  assignedMemberName?: string;
}

interface TeamMember {
  id: number;
  name: string;
  ghlUserId: string | null;
}

// ─── TASK ROW COMPONENT ─────────────────────────────────

function TaskRow({
  task,
  onComplete,
  onExpand,
  isExpanded,
  isCompleting,
}: {
  task: Task;
  onComplete: () => void;
  onExpand: () => void;
  isExpanded: boolean;
  isCompleting: boolean;
}) {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const dueDateStr = dueDate
    ? dueDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: dueDate.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      })
    : "No date";

  const groupBorderColor =
    task.group === "overdue"
      ? "var(--g-accent)"
      : task.group === "today"
      ? "oklch(0.75 0.15 85)"
      : "var(--g-border-subtle)";

  return (
    <div
      className="rounded-lg transition-all duration-200"
      style={{
        border: `1px solid ${groupBorderColor}`,
        background: task.group === "overdue"
          ? "oklch(0.25 0.03 25 / 0.3)"
          : task.group === "today"
          ? "oklch(0.25 0.03 85 / 0.2)"
          : "var(--g-bg-card)",
      }}
    >
      <div
        className="flex items-center gap-3 p-3 cursor-pointer transition-colors"
        onClick={onExpand}
        style={{ borderRadius: "0.5rem" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--g-bg-inset)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Expand chevron */}
        <div style={{ color: "var(--g-text-tertiary)" }}>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>

        {/* Complete button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          style={{ color: "var(--g-text-tertiary)" }}
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          disabled={isCompleting}
        >
          {isCompleting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </Button>

        {/* Task info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="font-medium text-sm truncate"
              style={{ color: "var(--g-text-primary)" }}
            >
              {task.title}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "var(--g-text-secondary)" }}>
            {task.contactId && (
              <span className="font-medium" style={{ color: "var(--g-text-primary)", opacity: 0.7 }}>
                {task.contactName || "Contact"}
              </span>
            )}
            {task.contactAddress && (
              <span className="truncate max-w-[250px]" title={task.contactAddress}>
                {task.contactAddress}
              </span>
            )}
            {task.assignedMemberName && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {task.assignedMemberName}
              </span>
            )}
          </div>
        </div>

        {/* Due date */}
        <div className="flex items-center gap-2 shrink-0">
          {task.group === "overdue" && (
            <Badge
              className="text-xs"
              style={{
                background: "var(--g-accent)",
                color: "white",
                border: "none",
              }}
            >
              {task.overdueDays}d overdue
            </Badge>
          )}
          <span
            className="text-xs font-medium"
            style={{
              color: task.group === "overdue"
                ? "var(--g-accent)"
                : task.group === "today"
                ? "oklch(0.75 0.15 85)"
                : "var(--g-text-tertiary)",
            }}
          >
            {dueDateStr}
          </span>
        </div>
      </div>

      {/* Expanded section */}
      {isExpanded && <TaskExpandedSection task={task} />}
    </div>
  );
}

// ─── EXPANDED SECTION ───────────────────────────────────

function TaskExpandedSection({ task }: { task: Task }) {
  const utils = trpc.useUtils();

  // Fetch contact context when expanded
  const { data: context, isLoading: contextLoading } = trpc.taskCenter.getTaskContext.useQuery(
    { contactId: task.contactId },
    { enabled: !!task.contactId }
  );

  // Quick action states
  const [showSmsDialog, setShowSmsDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState("");

  // Mutations
  const sendSmsMutation = trpc.taskCenter.sendSms.useMutation({
    onSuccess: () => {
      toast.success(`SMS sent to ${task.contactName || "contact"}`);
      setShowSmsDialog(false);
      setSmsMessage("");
    },
    onError: (err) => toast.error("Failed to send SMS", { description: err.message }),
  });

  const addNoteMutation = trpc.taskCenter.addNote.useMutation({
    onSuccess: () => {
      toast.success(`Note added to ${task.contactName || "contact"}`);
      setShowNoteDialog(false);
      setNoteBody("");
      utils.taskCenter.getTaskContext.invalidate({ contactId: task.contactId });
    },
    onError: (err) => toast.error("Failed to add note", { description: err.message }),
  });

  const startWorkflowMutation = trpc.taskCenter.startWorkflow.useMutation({
    onSuccess: () => {
      toast.success(`Workflow started for ${task.contactName || "contact"}`);
      setShowWorkflowDialog(false);
      setSelectedWorkflow("");
    },
    onError: (err) => toast.error("Failed to start workflow", { description: err.message }),
  });

  // Workflows (lazy load when dialog opens)
  const { data: workflows } = trpc.taskCenter.getWorkflows.useQuery(undefined, {
    enabled: showWorkflowDialog,
  });

  return (
    <div
      className="px-4 py-3 space-y-3"
      style={{ borderTop: "1px solid var(--g-border-subtle)" }}
    >
      {/* Task description */}
      {task.body && (
        <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
          {task.body}
        </p>
      )}

      {/* Quick Actions Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            if (task.contactPhone) {
              window.open(`tel:${task.contactPhone}`, "_self");
            } else {
              toast.error("No phone number on file for this contact");
            }
          }}
        >
          <Phone className="h-3.5 w-3.5 mr-1.5" />
          Call
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowSmsDialog(true)}
        >
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
          Text
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowWorkflowDialog(true)}
        >
          <Zap className="h-3.5 w-3.5 mr-1.5" />
          Workflow
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowNoteDialog(true)}
        >
          <StickyNote className="h-3.5 w-3.5 mr-1.5" />
          Add Note
        </Button>
      </div>

      {/* Contact Context */}
      {contextLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : context ? (
        <div className="space-y-3">
          {/* Contact info */}
          <div className="flex items-center gap-4 text-xs" style={{ color: "var(--g-text-tertiary)" }}>
            {context.contactPhone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {context.contactPhone}
              </span>
            )}
            {context.contactEmail && <span>{context.contactEmail}</span>}
          </div>

          {/* Last Call Summary from Gunner */}
          {context.lastCallSummary && (
            <div
              className="rounded-md p-3"
              style={{ background: "var(--g-bg-inset)" }}
            >
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <FileText className="h-3.5 w-3.5" style={{ color: "var(--g-accent)" }} />
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--g-text-primary)" }}
                >
                  Last Call Summary
                </span>
                {context.lastCallGrade && (
                  <Badge
                    variant="outline"
                    className="text-xs h-5"
                    style={{ borderColor: "var(--g-accent)", color: "var(--g-accent)" }}
                  >
                    {context.lastCallGrade}
                  </Badge>
                )}
                {context.lastCallDate && (
                  <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                    {new Date(context.lastCallDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
                {context.lastCallId && (
                  <a
                    href={`/calls/${context.lastCallId}`}
                    className="text-xs flex items-center gap-0.5 hover:underline"
                    style={{ color: "var(--g-accent)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p
                className="text-xs leading-relaxed line-clamp-3"
                style={{ color: "var(--g-text-secondary)" }}
              >
                {context.lastCallSummary}
              </p>
            </div>
          )}

          {/* Recent Notes */}
          {context.recentNotes.length > 0 && (
            <div>
              <span
                className="text-xs font-medium mb-1 block"
                style={{ color: "var(--g-text-tertiary)" }}
              >
                Recent Notes ({context.recentNotes.length})
              </span>
              <div className="space-y-1.5">
                {context.recentNotes.slice(0, 3).map((note: { id: string; body: string; dateAdded: string }) => (
                  <div
                    key={note.id}
                    className="text-xs rounded px-2.5 py-1.5"
                    style={{
                      color: "var(--g-text-secondary)",
                      background: "var(--g-bg-inset)",
                    }}
                  >
                    <span className="line-clamp-2">{note.body}</span>
                    {note.dateAdded && (
                      <span className="text-[10px] opacity-60 ml-2">
                        {new Date(note.dateAdded).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No context available */}
          {!context.lastCallSummary && context.recentNotes.length === 0 && (
            <p className="text-xs italic" style={{ color: "var(--g-text-tertiary)" }}>
              No call history or notes found for this contact.
            </p>
          )}
        </div>
      ) : null}

      {/* SMS Dialog */}
      <Dialog open={showSmsDialog} onOpenChange={setShowSmsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Text to {task.contactName || "Contact"}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Type your message..."
            value={smsMessage}
            onChange={(e) => setSmsMessage(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                sendSmsMutation.mutate({
                  contactId: task.contactId,
                  message: smsMessage,
                })
              }
              disabled={!smsMessage.trim() || sendSmsMutation.isPending}
            >
              {sendSmsMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note to {task.contactName || "Contact"}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Write your note..."
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                addNoteMutation.mutate({
                  contactId: task.contactId,
                  body: noteBody,
                })
              }
              disabled={!noteBody.trim() || addNoteMutation.isPending}
            >
              {addNoteMutation.isPending ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow Dialog */}
      <Dialog open={showWorkflowDialog} onOpenChange={setShowWorkflowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Workflow for {task.contactName || "Contact"}</DialogTitle>
          </DialogHeader>
          {workflows && workflows.length > 0 ? (
            <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
              <SelectTrigger>
                <SelectValue placeholder="Select a workflow..." />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w: { id: string; name: string }) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
              Loading workflows...
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkflowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                startWorkflowMutation.mutate({
                  contactId: task.contactId,
                  workflowId: selectedWorkflow,
                })
              }
              disabled={!selectedWorkflow || startWorkflowMutation.isPending}
            >
              {startWorkflowMutation.isPending ? "Starting..." : "Start Workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── TASK GROUP SECTION ─────────────────────────────────

function TaskGroupSection({
  title,
  icon,
  tasks,
  color,
  expandedTaskId,
  setExpandedTaskId,
  completingTaskIds,
  onComplete,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  color: string;
  expandedTaskId: string | null;
  setExpandedTaskId: (id: string | null) => void;
  completingTaskIds: Set<string>;
  onComplete: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold" style={{ color }}>
          {title}
        </h3>
        <Badge
          variant="secondary"
          className="text-xs h-5"
          style={{
            background: "var(--g-bg-inset)",
            color: "var(--g-text-secondary)",
          }}
        >
          {tasks.length}
        </Badge>
      </div>
      <div className="space-y-1.5">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onComplete={() => onComplete(task)}
            onExpand={() =>
              setExpandedTaskId(expandedTaskId === task.id ? null : task.id)
            }
            isExpanded={expandedTaskId === task.id}
            isCompleting={completingTaskIds.has(task.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────

export default function TaskCenter() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // State
  const [selectedMember, setSelectedMember] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());

  const isAdmin =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    (user as any)?.isTenantAdmin === "true";

  // Fetch tasks
  const { data, isLoading, isError, refetch } = trpc.taskCenter.getTasks.useQuery(
    {
      assignedToGhlUserId: selectedMember !== "all" ? selectedMember : undefined,
    },
    {
      refetchInterval: 60000, // Refresh every minute
    }
  );

  // Refresh tasks mutation (clears server-side cache)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTasksMutation = trpc.taskCenter.refreshTasks.useMutation({
    onSuccess: () => {
      utils.taskCenter.getTasks.invalidate();
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshTasksMutation.mutateAsync();
      toast.success("Tasks refreshed");
    } catch (err) {
      toast.error("Failed to refresh tasks");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Complete task mutation
  const completeTaskMutation = trpc.taskCenter.completeTask.useMutation({
    onMutate: ({ taskId }) => {
      setCompletingTaskIds((prev) => new Set(prev).add(taskId));
    },
    onSuccess: (_, { taskId }) => {
      toast.success("Task completed");
      setCompletingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      utils.taskCenter.getTasks.invalidate();
    },
    onError: (err, { taskId }) => {
      toast.error("Failed to complete task", { description: err.message });
      setCompletingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    },
  });

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!data?.tasks) return [];
    if (!searchQuery.trim()) return data.tasks;
    const q = searchQuery.toLowerCase();
    return data.tasks.filter(
      (t: Task) =>
        t.title.toLowerCase().includes(q) ||
        (t.contactName && t.contactName.toLowerCase().includes(q)) ||
        (t.assignedMemberName && t.assignedMemberName.toLowerCase().includes(q))
    );
  }, [data?.tasks, searchQuery]);

  // Group tasks
  const overdueTasks = useMemo(
    () => filteredTasks.filter((t: Task) => t.group === "overdue"),
    [filteredTasks]
  );
  const todayTasks = useMemo(
    () => filteredTasks.filter((t: Task) => t.group === "today"),
    [filteredTasks]
  );
  const upcomingTasks = useMemo(
    () => filteredTasks.filter((t: Task) => t.group === "upcoming"),
    [filteredTasks]
  );

  // Stats
  const totalTasks = filteredTasks.length;
  const overdueCount = overdueTasks.length;

  const handleComplete = (task: Task) => {
    completeTaskMutation.mutate({
      contactId: task.contactId,
      taskId: task.id,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--g-text-primary)" }}
        >
          Task Center
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--g-text-secondary)" }}>
          Manage tasks, take quick actions, and keep leads moving forward.
        </p>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: "var(--g-bg-card)",
            border: "1px solid var(--g-border-subtle)",
          }}
        >
          <CalendarDays className="h-4 w-4" style={{ color: "var(--g-text-tertiary)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>
            {totalTasks} tasks
          </span>
        </div>
        {overdueCount > 0 && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              background: "oklch(0.25 0.03 25 / 0.4)",
              border: "1px solid var(--g-accent)",
            }}
          >
            <AlertTriangle className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--g-accent)" }}>
              {overdueCount} overdue
            </span>
          </div>
        )}
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: "var(--g-bg-card)",
            border: "1px solid var(--g-border-subtle)",
          }}
        >
          <Clock className="h-4 w-4" style={{ color: "oklch(0.75 0.15 85)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>
            {todayTasks.length} due today
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: "var(--g-text-tertiary)" }}
          />
          <Input
            placeholder="Search tasks or contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Team member filter (admin only) */}
        {isAdmin && data?.teamMembers && data.teamMembers.length > 0 && (
          <Select value={selectedMember} onValueChange={setSelectedMember}>
            <SelectTrigger className="w-[200px] h-9">
              <Users className="h-4 w-4 mr-2" style={{ color: "var(--g-text-tertiary)" }} />
              <SelectValue placeholder="All Team Members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Team Members</SelectItem>
              {data.teamMembers
                .filter((m: TeamMember) => m.ghlUserId)
                .map((m: TeamMember) => (
                  <SelectItem key={m.id} value={m.ghlUserId!}>
                    {m.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading || isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div
          className="rounded-lg py-8 text-center"
          style={{
            background: "var(--g-bg-card)",
            border: "1px solid var(--g-border-subtle)",
          }}
        >
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-accent)" }} />
          <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
            Failed to load tasks. Make sure GHL is connected and try again.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      ) : totalTasks === 0 ? (
        <div
          className="rounded-lg py-12 text-center"
          style={{
            background: "var(--g-bg-card)",
            border: "1px solid var(--g-border-subtle)",
          }}
        >
          <CheckCircle2
            className="h-10 w-10 mx-auto mb-3"
            style={{ color: "oklch(0.7 0.15 150)" }}
          />
          <h3
            className="font-semibold text-lg"
            style={{ color: "var(--g-text-primary)" }}
          >
            All Clear
          </h3>
          <p className="text-sm mt-1" style={{ color: "var(--g-text-secondary)" }}>
            {selectedMember !== "all"
              ? "No pending tasks for this team member."
              : "No pending tasks. Great work!"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          <TaskGroupSection
            title="Overdue"
            icon={<AlertTriangle className="h-4 w-4" style={{ color: "var(--g-accent)" }} />}
            tasks={overdueTasks}
            color="var(--g-accent)"
            expandedTaskId={expandedTaskId}
            setExpandedTaskId={setExpandedTaskId}
            completingTaskIds={completingTaskIds}
            onComplete={handleComplete}
          />

          {/* Due Today */}
          <TaskGroupSection
            title="Due Today"
            icon={<Clock className="h-4 w-4" style={{ color: "oklch(0.75 0.15 85)" }} />}
            tasks={todayTasks}
            color="oklch(0.75 0.15 85)"
            expandedTaskId={expandedTaskId}
            setExpandedTaskId={setExpandedTaskId}
            completingTaskIds={completingTaskIds}
            onComplete={handleComplete}
          />

          {/* Upcoming */}
          <TaskGroupSection
            title="Upcoming"
            icon={<CalendarDays className="h-4 w-4" style={{ color: "oklch(0.65 0.15 250)" }} />}
            tasks={upcomingTasks}
            color="oklch(0.65 0.15 250)"
            expandedTaskId={expandedTaskId}
            setExpandedTaskId={setExpandedTaskId}
            completingTaskIds={completingTaskIds}
            onComplete={handleComplete}
          />
        </div>
      )}
    </div>
  );
}
