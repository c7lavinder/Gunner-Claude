import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
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
  Pencil,
  Trash2,
  CalendarPlus,
  Plus,
  Minus,
} from "lucide-react";

// ─── HELPERS ────────────────────────────────────────────

/** Strip HTML tags and decode common entities to get clean plain text */
function stripHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}

/** Format phone number from +1XXXXXXXXXX to (XXX) XXX-XXXX */
function formatPhone(phone: string): string {
  if (!phone) return "";
  // Strip all non-digits
  const digits = phone.replace(/\D/g, "");
  // Handle US numbers: 1XXXXXXXXXX or XXXXXXXXXX
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone; // Return original if not a standard US number
}

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
  onEdit,
  onDelete,
  onExpand,
  isExpanded,
  isCompleting,
}: {
  task: Task;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
        className="flex items-center gap-3 p-3 cursor-pointer transition-colors group"
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

        {/* Checkbox — Mark as complete */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{
                  border: isCompleting ? "none" : "2px solid var(--g-text-tertiary)",
                  background: isCompleting ? "oklch(0.7 0.15 150)" : "transparent",
                  cursor: isCompleting ? "wait" : "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isCompleting) onComplete();
                }}
                disabled={isCompleting}
                onMouseEnter={(e) => {
                  if (!isCompleting) {
                    e.currentTarget.style.borderColor = "oklch(0.7 0.15 150)";
                    e.currentTarget.style.background = "oklch(0.7 0.15 150 / 0.15)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCompleting) {
                    e.currentTarget.style.borderColor = "var(--g-text-tertiary)";
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                {isCompleting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "oklch(0.7 0.15 150)" }} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Mark as complete</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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

        {/* Actions: Edit & Delete */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
                  style={{ color: "var(--g-text-tertiary)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--g-bg-card)";
                    e.currentTarget.style.color = "var(--g-text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--g-text-tertiary)";
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Edit task</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
                  style={{ color: "var(--g-text-tertiary)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "oklch(0.25 0.03 25 / 0.5)";
                    e.currentTarget.style.color = "var(--g-accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--g-text-tertiary)";
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Delete task</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
  const [showAptDialog, setShowAptDialog] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [workflowAction, setWorkflowAction] = useState<"add" | "remove">("add");

  // Appointment form state
  const [aptTitle, setAptTitle] = useState("");
  const [aptDate, setAptDate] = useState("");
  const [aptTime, setAptTime] = useState("");
  const [aptCalendar, setAptCalendar] = useState("");
  const [aptNotes, setAptNotes] = useState("");

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

  const removeWorkflowMutation = trpc.taskCenter.removeFromWorkflow.useMutation({
    onSuccess: () => {
      toast.success(`Removed from workflow`);
      setShowWorkflowDialog(false);
      setSelectedWorkflow("");
    },
    onError: (err) => toast.error("Failed to remove from workflow", { description: err.message }),
  });

  const createAptMutation = trpc.taskCenter.createAppointment.useMutation({
    onSuccess: () => {
      toast.success(`Appointment created for ${task.contactName || "contact"}`);
      setShowAptDialog(false);
      setAptTitle("");
      setAptDate("");
      setAptTime("");
      setAptCalendar("");
      setAptNotes("");
    },
    onError: (err) => toast.error("Failed to create appointment", { description: err.message }),
  });

  // Workflows (lazy load when dialog opens)
  const { data: workflows } = trpc.taskCenter.getWorkflows.useQuery(undefined, {
    enabled: showWorkflowDialog,
  });

  // Calendars (lazy load when dialog opens)
  const { data: calendars } = trpc.taskCenter.getCalendars.useQuery(undefined, {
    enabled: showAptDialog,
  });

  return (
    <div
      className="px-4 py-3 space-y-3"
      style={{ borderTop: "1px solid var(--g-border-subtle)" }}
    >
      {/* Task description */}
      {task.body && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
          {stripHtml(task.body)}
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
          onClick={() => {
            setWorkflowAction("add");
            setSelectedWorkflow("");
            setShowWorkflowDialog(true);
          }}
        >
          <Zap className="h-3.5 w-3.5 mr-1.5" />
          Update Workflow
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setAptTitle(`Appointment with ${task.contactName || "Contact"}`);
            setAptDate("");
            setAptTime("");
            setAptCalendar("");
            setAptNotes("");
            setShowAptDialog(true);
          }}
        >
          <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
          Create Apt
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
                {formatPhone(context.contactPhone)}
              </span>
            )}
            {context.contactEmail && <span>{context.contactEmail}</span>}
          </div>

          {/* Last call summary from Gunner */}
          {context.lastCallSummary && (
            <div
              className="rounded-md p-3"
              style={{
                background: "var(--g-bg-inset)",
                border: "1px solid var(--g-border-subtle)",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <FileText className="h-3.5 w-3.5" style={{ color: "oklch(0.65 0.15 250)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--g-text-primary)" }}>
                  Last Call Summary
                </span>
                {context.lastCallGrade && (
                  <Badge
                    className="text-xs h-4"
                    style={{
                      background: "var(--g-bg-card)",
                      color: "var(--g-text-secondary)",
                      border: "1px solid var(--g-border-subtle)",
                    }}
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
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
                {context.lastCallSummary.length > 300
                  ? context.lastCallSummary.slice(0, 300) + "..."
                  : context.lastCallSummary}
              </p>
              {context.lastCallId && (
                <a
                  href={`/calls/${context.lastCallId}`}
                  className="text-xs mt-1.5 inline-flex items-center gap-1 hover:underline"
                  style={{ color: "oklch(0.65 0.15 250)" }}
                >
                  View full call <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Recent Notes */}
          {context.recentNotes && context.recentNotes.length > 0 && (
            <div>
              <span className="text-xs font-semibold" style={{ color: "var(--g-text-primary)" }}>
                Recent Notes
              </span>
              <div className="mt-1.5 space-y-1.5">
                {context.recentNotes.slice(0, 3).map((note: { id: string; body: string; dateAdded: string }) => (
                  <div
                    key={note.id}
                    className="rounded-md px-3 py-2"
                    style={{
                      background: "var(--g-bg-inset)",
                      border: "1px solid var(--g-border-subtle)",
                    }}
                  >
                    <p className="text-xs" style={{ color: "var(--g-text-secondary)" }}>
                      {note.body.length > 200 ? note.body.slice(0, 200) + "..." : note.body}
                    </p>
                    {note.dateAdded && (
                      <span className="text-xs mt-1 block" style={{ color: "var(--g-text-tertiary)" }}>
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
        </div>
      ) : null}

      {/* SMS Dialog */}
      <Dialog open={showSmsDialog} onOpenChange={setShowSmsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send SMS to {task.contactName || "Contact"}</DialogTitle>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note to {task.contactName || "Contact"}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Write a note..."
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Workflow for {task.contactName || "Contact"}</DialogTitle>
            <DialogDescription>
              Add this contact to a workflow or remove them from one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add / Remove toggle */}
            <div className="flex gap-2">
              <Button
                variant={workflowAction === "add" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => { setWorkflowAction("add"); setSelectedWorkflow(""); }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add to Workflow
              </Button>
              <Button
                variant={workflowAction === "remove" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => { setWorkflowAction("remove"); setSelectedWorkflow(""); }}
              >
                <Minus className="h-3.5 w-3.5 mr-1.5" />
                Remove from Workflow
              </Button>
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkflowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (workflowAction === "add") {
                  startWorkflowMutation.mutate({
                    contactId: task.contactId,
                    workflowId: selectedWorkflow,
                  });
                } else {
                  removeWorkflowMutation.mutate({
                    contactId: task.contactId,
                    workflowId: selectedWorkflow,
                  });
                }
              }}
              disabled={!selectedWorkflow || startWorkflowMutation.isPending || removeWorkflowMutation.isPending}
              variant={workflowAction === "remove" ? "destructive" : "default"}
            >
              {(startWorkflowMutation.isPending || removeWorkflowMutation.isPending)
                ? (workflowAction === "add" ? "Adding..." : "Removing...")
                : (workflowAction === "add" ? "Add to Workflow" : "Remove from Workflow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Appointment Dialog */}
      <Dialog open={showAptDialog} onOpenChange={setShowAptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Appointment</DialogTitle>
            <DialogDescription>
              Schedule a calendar appointment for {task.contactName || "this contact"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apt-title">Title</Label>
              <Input
                id="apt-title"
                value={aptTitle}
                onChange={(e) => setAptTitle(e.target.value)}
                placeholder="Appointment title..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="apt-date">Date</Label>
                <Input
                  id="apt-date"
                  type="date"
                  value={aptDate}
                  onChange={(e) => setAptDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-time">Time</Label>
                <Input
                  id="apt-time"
                  type="time"
                  value={aptTime}
                  onChange={(e) => setAptTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apt-calendar">Calendar</Label>
              {calendars && calendars.length > 0 ? (
                <Select value={aptCalendar} onValueChange={setAptCalendar}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a calendar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((c: { id: string; name: string }) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
                  Loading calendars...
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="apt-notes">Notes (optional)</Label>
              <Textarea
                id="apt-notes"
                value={aptNotes}
                onChange={(e) => setAptNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAptDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!aptDate || !aptTime) {
                  toast.error("Please select a date and time");
                  return;
                }
                const startTime = new Date(`${aptDate}T${aptTime}:00`).toISOString();
                const endTime = new Date(new Date(`${aptDate}T${aptTime}:00`).getTime() + 60 * 60 * 1000).toISOString();
                createAptMutation.mutate({
                  contactId: task.contactId,
                  calendarId: aptCalendar,
                  title: aptTitle,
                  startTime,
                  endTime,
                  notes: aptNotes || undefined,
                });
              }}
              disabled={!aptTitle.trim() || !aptDate || !aptTime || !aptCalendar || createAptMutation.isPending}
            >
              {createAptMutation.isPending ? "Creating..." : "Create Appointment"}
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
  onEdit,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  color: string;
  expandedTaskId: string | null;
  setExpandedTaskId: (id: string | null) => void;
  completingTaskIds: Set<string>;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
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
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task)}
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

  // Edit dialog state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  // Delete confirmation dialog state
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

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

  // Edit task mutation
  const editTaskMutation = trpc.taskCenter.editTask.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditingTask(null);
      utils.taskCenter.getTasks.invalidate();
    },
    onError: (err) => toast.error("Failed to update task", { description: err.message }),
  });

  // Delete task mutation
  const deleteTaskMutation = trpc.taskCenter.deleteTask.useMutation({
    onSuccess: () => {
      toast.success("Task deleted");
      setDeletingTask(null);
      utils.taskCenter.getTasks.invalidate();
    },
    onError: (err) => toast.error("Failed to delete task", { description: err.message }),
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
        (t.assignedMemberName && t.assignedMemberName.toLowerCase().includes(q)) ||
        (t.contactAddress && t.contactAddress.toLowerCase().includes(q))
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

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditBody(task.body || "");
    // Format date for input[type="date"]
    if (task.dueDate) {
      const d = new Date(task.dueDate);
      setEditDueDate(d.toISOString().split("T")[0]);
    } else {
      setEditDueDate("");
    }
  };

  const handleDelete = (task: Task) => {
    setDeletingTask(task);
  };

  const submitEdit = () => {
    if (!editingTask) return;
    editTaskMutation.mutate({
      contactId: editingTask.contactId,
      taskId: editingTask.id,
      title: editTitle,
      body: editBody,
      dueDate: editDueDate ? new Date(editDueDate + "T12:00:00").toISOString() : undefined,
    });
  };

  const confirmDelete = () => {
    if (!deletingTask) return;
    deleteTaskMutation.mutate({
      contactId: deletingTask.contactId,
      taskId: deletingTask.id,
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
            onEdit={handleEdit}
            onDelete={handleDelete}
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
            onEdit={handleEdit}
            onDelete={handleDelete}
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
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update the task details below. Changes will sync to GHL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Task title..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-body">Description</Label>
              <Textarea
                id="edit-body"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Task description (optional)..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-due-date">Due Date</Label>
              <Input
                id="edit-due-date"
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitEdit}
              disabled={!editTitle.trim() || editTaskMutation.isPending}
            >
              {editTaskMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingTask} onOpenChange={(open) => !open && setDeletingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be undone and will also remove it from GHL.
            </DialogDescription>
          </DialogHeader>
          {deletingTask && (
            <div
              className="rounded-md p-3"
              style={{
                background: "var(--g-bg-inset)",
                border: "1px solid var(--g-border-subtle)",
              }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>
                {deletingTask.title}
              </p>
              {deletingTask.contactName && (
                <p className="text-xs mt-1" style={{ color: "var(--g-text-secondary)" }}>
                  {deletingTask.contactName}
                  {deletingTask.contactAddress ? ` — ${deletingTask.contactAddress}` : ""}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTask(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteTaskMutation.isPending}
            >
              {deleteTaskMutation.isPending ? "Deleting..." : "Delete Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
