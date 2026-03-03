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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
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
  ArrowRight,
  ChevronsUpDown,
  Check,
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

  // Fetch user phone info for from/to display
  const { data: userPhoneInfo } = trpc.taskCenter.getUserPhoneInfo.useQuery();

  // Fetch today's activity for this contact
  const { data: todayActivity, isLoading: activityLoading } = trpc.taskCenter.getContactActivity.useQuery(
    { contactId: task.contactId },
    { enabled: !!task.contactId }
  );

  // Fetch workflow history for this contact (for Remove mode)
  const { data: workflowHistory } = trpc.taskCenter.getContactWorkflowHistory.useQuery(
    { contactId: task.contactId },
    { enabled: !!task.contactId }
  );

  // Active tab: "actions" (default) | "activity" | "notes"
  const [activeTab, setActiveTab] = useState<"actions" | "activity" | "notes">("actions");

  // Quick action states
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showSmsDialog, setShowSmsDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [showAptDialog, setShowAptDialog] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [noteBody, setNoteBody] = useState("");

  // SMS/Call from/to state
  const [smsFromGhlUserId, setSmsFromGhlUserId] = useState<string>("");
  const [smsFromOpen, setSmsFromOpen] = useState(false);
  const [callFromGhlUserId, setCallFromGhlUserId] = useState<string>("");
  const [callFromOpen, setCallFromOpen] = useState(false);
  // SMS To override (editable phone number)
  const [smsToPhone, setSmsToPhone] = useState("");
  const [callToPhone, setCallToPhone] = useState("");
  // SMS scheduling
  const [smsScheduleMode, setSmsScheduleMode] = useState<"now" | "later">("now");
  const [smsScheduleDate, setSmsScheduleDate] = useState("");
  const [smsScheduleTime, setSmsScheduleTime] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [workflowAction, setWorkflowAction] = useState<"add" | "remove">("add");
  const [workflowSearchOpen, setWorkflowSearchOpen] = useState(false);
  const [calendarSearchOpen, setCalendarSearchOpen] = useState(false);

  // Appointment form state
  const [aptTitle, setAptTitle] = useState("");
  const [aptDate, setAptDate] = useState("");
  const [aptTime, setAptTime] = useState("");
  const [aptCalendar, setAptCalendar] = useState("");
  const [aptNotes, setAptNotes] = useState("");

  // Derive the contact phone (from task data or context)
  const contactPhone = task.contactPhone || context?.contactPhone || "";

  // Helper: get sender info for a given GHL user ID (or current user if empty)
  const getSenderInfo = (ghlUserId: string) => {
    if (!ghlUserId || !userPhoneInfo?.teamMembers) {
      return { name: userPhoneInfo?.userName || "You", phone: userPhoneInfo?.userPhone || null };
    }
    const member = userPhoneInfo.teamMembers.find(m => m.ghlUserId === ghlUserId);
    if (member) return { name: member.name, phone: member.lcPhone };
    return { name: userPhoneInfo?.userName || "You", phone: userPhoneInfo?.userPhone || null };
  };

  // Derive enrolled workflows (most recent "added" that hasn't been "removed")
  const enrolledWorkflows = useMemo(() => {
    if (!workflowHistory || workflowHistory.length === 0) return [];
    const workflowMap = new Map<string, { workflowId: string; workflowName: string; addedAt: string }>(); 
    // Process in chronological order (oldest first)
    const sorted = [...workflowHistory].reverse();
    for (const entry of sorted) {
      if (entry.action === "added") {
        workflowMap.set(entry.workflowId, { workflowId: entry.workflowId, workflowName: entry.workflowName, addedAt: entry.addedAt });
      } else if (entry.action === "removed") {
        workflowMap.delete(entry.workflowId);
      }
    }
    return Array.from(workflowMap.values());
  }, [workflowHistory]);

  // Mutations
  const sendSmsMutation = trpc.taskCenter.sendSms.useMutation({
    onSuccess: (data: any) => {
      if (data?.scheduled) {
        toast.success(`SMS scheduled for ${new Date(data.scheduledAt).toLocaleString()}`);
      } else {
        toast.success(`SMS sent to ${task.contactName || "contact"}`);
      }
      setShowSmsDialog(false);
      setSmsMessage("");
      setSmsFromGhlUserId("");
      setSmsScheduleMode("now");
      setSmsScheduleDate("");
      setSmsScheduleTime("");
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
              setShowCallDialog(true);
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

      {/* Contact Info Line */}
      <div className="flex items-center gap-4 text-xs" style={{ color: "var(--g-text-tertiary)" }}>
        {contactPhone && (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {formatPhone(contactPhone)}
          </span>
        )}
        {(task.contactEmail || context?.contactEmail) && (
          <span>{task.contactEmail || context?.contactEmail}</span>
        )}
      </div>

      {/* Tabs: Actions | Today's Activity | Notes */}
      <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--g-bg-inset)" }}>
        {(["actions", "activity", "notes"] as const).map((tab) => (
          <button
            key={tab}
            className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: activeTab === tab ? "var(--g-bg-card)" : "transparent",
              color: activeTab === tab ? "var(--g-text-primary)" : "var(--g-text-tertiary)",
              boxShadow: activeTab === tab ? "0 1px 2px rgba(0,0,0,0.15)" : "none",
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "actions" ? "Quick Actions" : tab === "activity" ? "Today's Activity" : "Notes & Calls"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "activity" ? (
        <div className="space-y-3">
          {activityLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : todayActivity ? (
            <>
              {/* Activity summary badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <MessageSquare className="h-3 w-3" style={{ color: "oklch(0.65 0.15 250)" }} />
                  {todayActivity.smsSent} SMS
                </div>
                <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <Phone className="h-3 w-3" style={{ color: "oklch(0.7 0.15 150)" }} />
                  {todayActivity.callsMade} Calls
                </div>
                <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <FileText className="h-3 w-3" style={{ color: "oklch(0.75 0.15 85)" }} />
                  {todayActivity.emailsSent} Emails
                </div>
              </div>
              {/* Activity timeline */}
              {todayActivity.messages.length > 0 ? (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {todayActivity.messages.map((msg: any) => (
                    <div
                      key={msg.id}
                      className="rounded-md px-3 py-2 flex items-start gap-2"
                      style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}
                    >
                      <div className="shrink-0 mt-0.5">
                        {msg.type === "sms" ? <MessageSquare className="h-3 w-3" style={{ color: "oklch(0.65 0.15 250)" }} /> :
                         msg.type === "call" ? <Phone className="h-3 w-3" style={{ color: "oklch(0.7 0.15 150)" }} /> :
                         <FileText className="h-3 w-3" style={{ color: "oklch(0.75 0.15 85)" }} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: "var(--g-text-primary)" }}>
                            {msg.type.toUpperCase()} {msg.direction === "inbound" ? "↓" : "↑"}
                          </span>
                          <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                            {new Date(msg.dateAdded).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        {msg.body && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--g-text-secondary)" }}>
                            {msg.body.length > 120 ? msg.body.slice(0, 120) + "..." : msg.body}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: "var(--g-text-tertiary)" }}>
                  No activity recorded for this contact today.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-center py-4" style={{ color: "var(--g-text-tertiary)" }}>
              Unable to load activity data.
            </p>
          )}
        </div>
      ) : activeTab === "notes" ? (
        <div className="space-y-3">
          {contextLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : context ? (
            <>
              {/* Last call summary */}
              {context.lastCallSummary && (
                <div className="rounded-md p-3" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileText className="h-3.5 w-3.5" style={{ color: "oklch(0.65 0.15 250)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--g-text-primary)" }}>Last Call Summary</span>
                    {context.lastCallGrade && (
                      <Badge className="text-xs h-4" style={{ background: "var(--g-bg-card)", color: "var(--g-text-secondary)", border: "1px solid var(--g-border-subtle)" }}>
                        {context.lastCallGrade}
                      </Badge>
                    )}
                    {context.lastCallDate && (
                      <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                        {new Date(context.lastCallDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
                    {context.lastCallSummary.length > 300 ? context.lastCallSummary.slice(0, 300) + "..." : context.lastCallSummary}
                  </p>
                  {context.lastCallId && (
                    <a href={`/calls/${context.lastCallId}`} className="text-xs mt-1.5 inline-flex items-center gap-1 hover:underline" style={{ color: "oklch(0.65 0.15 250)" }}>
                      View full call <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
              {/* Recent Notes */}
              {context.recentNotes && context.recentNotes.length > 0 ? (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {context.recentNotes.slice(0, 5).map((note: { id: string; body: string; dateAdded: string }) => (
                    <div key={note.id} className="rounded-md px-3 py-2" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                      <p className="text-xs" style={{ color: "var(--g-text-secondary)" }}>
                        {note.body.length > 200 ? note.body.slice(0, 200) + "..." : note.body}
                      </p>
                      {note.dateAdded && (
                        <span className="text-xs mt-1 block" style={{ color: "var(--g-text-tertiary)" }}>
                          {new Date(note.dateAdded).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: "var(--g-text-tertiary)" }}>
                  No recent notes for this contact.
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {/* Call Confirmation Dialog */}
      <Dialog open={showCallDialog} onOpenChange={(open) => {
        setShowCallDialog(open);
        if (!open) { setCallFromGhlUserId(""); setCallFromOpen(false); setCallToPhone(""); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Call {task.contactName || "Contact"}</DialogTitle>
            <DialogDescription>Confirm call details before dialing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* From selector */}
            <div>
              <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>From</Label>
              <Popover open={callFromOpen} onOpenChange={setCallFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-auto py-2">
                    <div className="text-left">
                      <div className="font-semibold text-sm">{getSenderInfo(callFromGhlUserId).name}</div>
                      <div className="text-xs" style={{ color: "var(--g-text-secondary)" }}>
                        {getSenderInfo(callFromGhlUserId).phone ? formatPhone(getSenderInfo(callFromGhlUserId).phone!) : "No phone on file"}
                      </div>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search team members..." />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No team members found.</CommandEmpty>
                      <CommandGroup>
                        {(userPhoneInfo?.teamMembers || []).map(m => (
                          <CommandItem
                            key={m.ghlUserId}
                            value={m.name}
                            onSelect={() => { setCallFromGhlUserId(m.ghlUserId); setCallFromOpen(false); }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${callFromGhlUserId === m.ghlUserId ? "opacity-100" : "opacity-0"}`} />
                            <div>
                              <div className="text-sm">{m.name}</div>
                              <div className="text-xs" style={{ color: "var(--g-text-secondary)" }}>{m.lcPhone ? formatPhone(m.lcPhone) : "No phone"}</div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRight className="h-5 w-5 rotate-90" style={{ color: "var(--g-text-tertiary)" }} />
            </div>
            {/* To (editable) */}
            <div>
              <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>To</Label>
              <div className="rounded-lg p-2" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                <div className="font-semibold text-sm" style={{ color: "var(--g-text-primary)" }}>{task.contactName || "Contact"}</div>
                <Input
                  className="mt-1 h-7 text-xs bg-transparent border-dashed"
                  placeholder="Enter phone number..."
                  value={callToPhone || (contactPhone ? formatPhone(contactPhone) : "")}
                  onChange={(e) => setCallToPhone(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCallDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const dialNumber = callToPhone || contactPhone;
                if (dialNumber) {
                  // Strip formatting to get raw number
                  const rawNumber = dialNumber.replace(/[^\d+]/g, "");
                  window.open(`tel:${rawNumber}`, "_self");
                }
                setShowCallDialog(false);
              }}
              disabled={!callToPhone && !contactPhone}
            >
              <Phone className="h-4 w-4 mr-1.5" />
              Call Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <Dialog open={showSmsDialog} onOpenChange={(open) => {
        setShowSmsDialog(open);
        if (!open) {
          setSmsFromGhlUserId(""); setSmsFromOpen(false); setSmsToPhone("");
          setSmsScheduleMode("now"); setSmsScheduleDate(""); setSmsScheduleTime("");
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send SMS to {task.contactName || "Contact"}</DialogTitle>
            <DialogDescription>Choose sender, recipient, and when to send.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* From / To row */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
              {/* From selector */}
              <div>
                <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>From</Label>
                <Popover open={smsFromOpen} onOpenChange={setSmsFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-auto py-2 text-left">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{getSenderInfo(smsFromGhlUserId).name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--g-text-secondary)" }}>
                          {getSenderInfo(smsFromGhlUserId).phone ? formatPhone(getSenderInfo(smsFromGhlUserId).phone!) : "No phone on file"}
                        </div>
                      </div>
                      <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search team members..." />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No team members found.</CommandEmpty>
                        <CommandGroup>
                          {(userPhoneInfo?.teamMembers || []).map(m => (
                            <CommandItem
                              key={m.ghlUserId}
                              value={m.name}
                              onSelect={() => { setSmsFromGhlUserId(m.ghlUserId); setSmsFromOpen(false); }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${smsFromGhlUserId === m.ghlUserId ? "opacity-100" : "opacity-0"}`} />
                              <div>
                                <div className="text-sm">{m.name}</div>
                                <div className="text-xs" style={{ color: "var(--g-text-secondary)" }}>{m.lcPhone ? formatPhone(m.lcPhone) : "No phone"}</div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {/* Arrow */}
              <div className="flex items-center pt-6">
                <ArrowRight className="h-5 w-5" style={{ color: "var(--g-text-tertiary)" }} />
              </div>
              {/* To (editable) */}
              <div>
                <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>To</Label>
                <div className="rounded-lg p-2 h-auto" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <div className="font-semibold text-sm truncate" style={{ color: "var(--g-text-primary)" }}>{task.contactName || "Contact"}</div>
                  <Input
                    className="mt-1 h-7 text-xs bg-transparent border-dashed"
                    placeholder="Enter phone number..."
                    value={smsToPhone || (contactPhone ? formatPhone(contactPhone) : "")}
                    onChange={(e) => setSmsToPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Message */}
            <Textarea
              placeholder="Type your message..."
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              rows={3}
            />

            {/* Send Now / Schedule toggle */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={smsScheduleMode === "now" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSmsScheduleMode("now")}
                >
                  Send Now
                </Button>
                <Button
                  variant={smsScheduleMode === "later" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSmsScheduleMode("later")}
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Schedule for Later
                </Button>
              </div>
              {smsScheduleMode === "later" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs mb-1 block">Date</Label>
                    <Input type="date" value={smsScheduleDate} onChange={(e) => setSmsScheduleDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Time</Label>
                    <Input type="time" value={smsScheduleTime} onChange={(e) => setSmsScheduleTime(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const mutationInput: any = {
                  contactId: task.contactId,
                  message: smsMessage,
                };
                if (smsFromGhlUserId) {
                  mutationInput.fromGhlUserId = smsFromGhlUserId;
                }
                if (smsScheduleMode === "later" && smsScheduleDate && smsScheduleTime) {
                  mutationInput.scheduledAt = new Date(`${smsScheduleDate}T${smsScheduleTime}`).toISOString();
                }
                sendSmsMutation.mutate(mutationInput);
              }}
              disabled={!smsMessage.trim() || sendSmsMutation.isPending || (smsScheduleMode === "later" && (!smsScheduleDate || !smsScheduleTime))}
            >
              {sendSmsMutation.isPending
                ? "Sending..."
                : smsScheduleMode === "later"
                  ? "Schedule SMS"
                  : "Send Now"}
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
        <DialogContent className="sm:max-w-md">
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
            {/* Searchable workflow selector */}
            {workflowAction === "remove" && enrolledWorkflows.length === 0 ? (
              <div className="rounded-md p-4 text-center" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
                  No workflows found for this contact. Only workflows added through Gunner are tracked.
                </p>
              </div>
            ) : (
              <Popover open={workflowSearchOpen} onOpenChange={setWorkflowSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={workflowSearchOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedWorkflow
                      ? (workflowAction === "remove"
                          ? (enrolledWorkflows.find(w => w.workflowId === selectedWorkflow)?.workflowName || "Select a workflow...")
                          : (workflows?.find((w: { id: string; name: string }) => w.id === selectedWorkflow)?.name || "Select a workflow..."))
                      : "Select a workflow..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search workflows..." />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No workflows found.</CommandEmpty>
                      <CommandGroup>
                        {workflowAction === "remove" ? (
                          enrolledWorkflows.map(w => (
                            <CommandItem
                              key={w.workflowId}
                              value={w.workflowName}
                              onSelect={() => {
                                setSelectedWorkflow(w.workflowId);
                                setWorkflowSearchOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${selectedWorkflow === w.workflowId ? "opacity-100" : "opacity-0"}`} />
                              {w.workflowName}
                            </CommandItem>
                          ))
                        ) : (
                          (workflows || []).map((w: { id: string; name: string }) => (
                            <CommandItem
                              key={w.id}
                              value={w.name}
                              onSelect={() => {
                                setSelectedWorkflow(w.id);
                                setWorkflowSearchOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${selectedWorkflow === w.id ? "opacity-100" : "opacity-0"}`} />
                              {w.name}
                            </CommandItem>
                          ))
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
              <Label>Calendar</Label>
              <Popover open={calendarSearchOpen} onOpenChange={setCalendarSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={calendarSearchOpen}
                    className="w-full justify-between font-normal"
                  >
                    {aptCalendar && calendars
                      ? (calendars.find((c: { id: string; name: string }) => c.id === aptCalendar)?.name || "Select a calendar...")
                      : "Select a calendar..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search calendars..." />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No calendars found.</CommandEmpty>
                      <CommandGroup>
                        {(calendars || []).map((c: { id: string; name: string }) => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => {
                              setAptCalendar(c.id);
                              setCalendarSearchOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${aptCalendar === c.id ? "opacity-100" : "opacity-0"}`} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
