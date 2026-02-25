import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";

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
  CheckCircle2,
  Edit3,
  ListTodo,
  StickyNote,
  Calendar,
  ArrowRightLeft,
  MessageSquare,
  Clock,
  Play,
  Square,
  Sparkles,
  Loader2,
  Send,
  Check,
  X,
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useDemo } from "@/hooks/useDemo";

interface NextStepAction {
  id: string;
  dbId?: number;
  actionType: string;
  reasoning: string;
  aiSuggested: boolean;
  payload: Record<string, any>;
  status: "pending" | "editing" | "pushing" | "pushed" | "failed" | "skipped";
  result?: string;
}

const ACTION_TYPE_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  check_off_task: {
    label: "Check Off Task",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950",
    borderColor: "border-l-green-500",
  },
  update_task: {
    label: "Update Task",
    icon: <Edit3 className="h-4 w-4" />,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    borderColor: "border-l-blue-500",
  },
  create_task: {
    label: "Create Task",
    icon: <ListTodo className="h-4 w-4" />,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950",
    borderColor: "border-l-indigo-500",
  },
  add_note: {
    label: "Add Note",
    icon: <StickyNote className="h-4 w-4" />,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-950",
    borderColor: "border-l-yellow-500",
  },
  create_appointment: {
    label: "Create Appointment",
    icon: <Calendar className="h-4 w-4" />,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-950",
    borderColor: "border-l-pink-500",
  },
  change_pipeline_stage: {
    label: "Change Pipeline Stage",
    icon: <ArrowRightLeft className="h-4 w-4" />,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950",
    borderColor: "border-l-orange-500",
  },
  send_sms: {
    label: "Send SMS",
    icon: <MessageSquare className="h-4 w-4" />,
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50 dark:bg-teal-950",
    borderColor: "border-l-teal-500",
  },
  schedule_sms: {
    label: "Schedule SMS",
    icon: <Clock className="h-4 w-4" />,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950",
    borderColor: "border-l-cyan-500",
  },
  add_to_workflow: {
    label: "Add to Workflow",
    icon: <Play className="h-4 w-4" />,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950",
    borderColor: "border-l-emerald-500",
  },
  remove_from_workflow: {
    label: "Remove from Workflow",
    icon: <Square className="h-4 w-4" />,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950",
    borderColor: "border-l-red-500",
  },
};

const ALL_ACTION_TYPES = [
  "check_off_task", "update_task", "create_task", "add_note",
  "create_appointment", "change_pipeline_stage", "send_sms",
  "schedule_sms", "add_to_workflow", "remove_from_workflow",
];

/** Field definitions for each action type — now includes "select" type for dropdowns */
type FieldType = "text" | "textarea" | "date" | "time" | "datetime" | "select-pipeline" | "select-stage" | "select-task" | "select-workflow" | "select-calendar" | "select-assignee";

function getFieldsForAction(actionType: string): { key: string; label: string; type: FieldType }[] {
  switch (actionType) {
    case "check_off_task":
      return [{ key: "taskKeyword", label: "Task to check off", type: "select-task" }];
    case "update_task":
      return [
        { key: "taskKeyword", label: "Task to update", type: "select-task" },
        { key: "title", label: "New title", type: "text" },
        { key: "dueDate", label: "New due date", type: "date" },
        { key: "assignedTo", label: "Assign to", type: "select-assignee" },
        { key: "description", label: "Updated description", type: "textarea" },
      ];
    case "create_task":
      return [
        { key: "title", label: "Task title", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "dueDate", label: "Due date", type: "date" },
        { key: "assignedTo", label: "Assign to", type: "select-assignee" },
      ];
    case "add_note":
      return [{ key: "noteBody", label: "Note content", type: "textarea" }];
    case "create_appointment":
      return [
        { key: "title", label: "Appointment title", type: "text" },
        { key: "startTime", label: "Start time", type: "datetime" },
        { key: "endTime", label: "End time", type: "datetime" },
        { key: "calendarName", label: "Calendar", type: "select-calendar" },
      ];
    case "change_pipeline_stage":
      return [
        { key: "pipelineName", label: "Pipeline", type: "select-pipeline" },
        { key: "stageName", label: "Move to stage", type: "select-stage" },
      ];
    case "send_sms":
      return [{ key: "message", label: "Message", type: "textarea" }];
    case "schedule_sms":
      return [
        { key: "message", label: "Message", type: "textarea" },
        { key: "scheduledDate", label: "Send date", type: "date" },
        { key: "scheduledTime", label: "Send time", type: "time" },
      ];
    case "add_to_workflow":
      return [{ key: "workflowName", label: "Workflow", type: "select-workflow" }];
    case "remove_from_workflow":
      return [{ key: "workflowName", label: "Workflow", type: "select-workflow" }];
    default:
      return [];
  }
}

/** Required fields per action type — used for validation before pushing */
function getRequiredFields(actionType: string): string[] {
  switch (actionType) {
    case "check_off_task":
      return ["taskKeyword"];
    case "update_task":
      return ["taskKeyword"];
    case "create_task":
      return ["title", "dueDate"];
    case "add_note":
      return ["noteBody"];
    case "create_appointment":
      return ["title", "startTime", "calendarName"];
    case "change_pipeline_stage":
      return ["pipelineName", "stageName"];
    case "send_sms":
      return ["message"];
    case "schedule_sms":
      return ["message", "scheduledDate"];
    case "add_to_workflow":
      return ["workflowName"];
    case "remove_from_workflow":
      return ["workflowName"];
    default:
      return [];
  }
}

/** Validate payload against required fields, returns list of missing field labels */
function validatePayload(actionType: string, payload: Record<string, any>): string[] {
  const requiredKeys = getRequiredFields(actionType);
  const fields = getFieldsForAction(actionType);
  const missing: string[] = [];
  for (const key of requiredKeys) {
    const value = payload[key];
    if (!value || (typeof value === "string" && !value.trim())) {
      const field = fields.find(f => f.key === key);
      missing.push(field?.label || key);
    }
  }
  return missing;
}

/** Get the primary content to display prominently on the card */
function getPrimaryContent(actionType: string, payload: Record<string, any>): { label: string; value: string } | null {
  const val = (key: string) => payload[key] && String(payload[key]).trim() ? String(payload[key]) : "";
  switch (actionType) {
    case "add_note":
      return val("noteBody") ? { label: "Note", value: val("noteBody") } : null;
    case "create_task":
      return val("title") ? { label: "Task", value: val("title") } : null;
    case "update_task":
      return val("title") || val("taskKeyword") ? { label: "Task", value: val("title") || val("taskKeyword") } : null;
    case "check_off_task":
      return val("taskKeyword") ? { label: "Task", value: val("taskKeyword") } : null;
    case "send_sms":
    case "schedule_sms":
      return val("message") ? { label: "Message", value: val("message") } : null;
    case "change_pipeline_stage":
      return val("stageName") ? { label: "Stage", value: `${val("pipelineName") ? val("pipelineName") + " \u2192 " : ""}${val("stageName")}` } : null;
    case "add_to_workflow":
    case "remove_from_workflow":
      return val("workflowName") ? { label: "Workflow", value: val("workflowName") } : null;
    case "create_appointment":
      return val("title") ? { label: "Appointment", value: val("title") } : null;
    default:
      return null;
  }
}

/** Get secondary details to show below the primary content */
function getSecondaryDetails(actionType: string, payload: Record<string, any>): { label: string; value: string }[] {
  const val = (key: string) => payload[key] && String(payload[key]).trim() ? String(payload[key]) : "";
  const details: { label: string; value: string }[] = [];

  switch (actionType) {
    case "create_task":
    case "update_task":
      if (val("description")) details.push({ label: "Description", value: val("description") });
      if (val("dueDate")) details.push({ label: "Due", value: val("dueDate") });
      break;
    case "schedule_sms":
      if (val("scheduledDate")) details.push({ label: "Send date", value: val("scheduledDate") });
      if (val("scheduledTime")) details.push({ label: "Send time", value: val("scheduledTime") });
      break;
    case "create_appointment":
      if (val("startTime")) details.push({ label: "Start", value: val("startTime") });
      if (val("endTime")) details.push({ label: "End", value: val("endTime") });
      if (val("calendarName")) details.push({ label: "Calendar", value: val("calendarName") });
      break;
  }
  return details;
}

/** Shared GHL data hook — fetches pipelines, workflows, calendars, and tasks once */
function useGhlDropdownData(ghlContactId?: string | null) {
  const pipelinesQuery = trpc.calls.getAvailablePipelines.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
  const workflowsQuery = trpc.calls.getAvailableWorkflows.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const calendarsQuery = trpc.calls.getAvailableCalendars.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const tasksQuery = trpc.calls.getContactTasks.useQuery(
    { ghlContactId: ghlContactId || "" },
    {
      enabled: !!ghlContactId,
      staleTime: 2 * 60 * 1000,
      retry: 1,
    }
  );
  const teamMembersQuery = trpc.coachActions.smsTeamSenders.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    pipelines: pipelinesQuery.data?.pipelines || [],
    workflows: workflowsQuery.data?.workflows || [],
    calendars: calendarsQuery.data?.calendars || [],
    tasks: tasksQuery.data?.tasks || [],
    teamMembers: teamMembersQuery.data || [],
    isLoading: pipelinesQuery.isLoading || workflowsQuery.isLoading || calendarsQuery.isLoading,
  };
}

function ActionCard({
  action,
  onPush,
  onSaveEdit,
  onAiEdit,
  onSkip,
  onDelete,
  isPushing,
  isAiEditing,
  ghlData,
  teamMemberName,
  autoEdit,
  onAutoEditConsumed,
}: {
  action: NextStepAction;
  onPush: (action: NextStepAction) => void;
  onSaveEdit: (action: NextStepAction, newPayload: Record<string, any>) => void;
  onAiEdit: (action: NextStepAction, instruction: string) => void;
  onSkip: (action: NextStepAction) => void;
  onDelete: (action: NextStepAction) => void;
  isPushing: boolean;
  isAiEditing: boolean;
  ghlData: ReturnType<typeof useGhlDropdownData>;
  teamMemberName?: string | null;
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPayload, setEditedPayload] = useState<Record<string, any>>({});
  const [aiInstruction, setAiInstruction] = useState("");
  const [showReasoning, setShowReasoning] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const requiredFieldKeys = useMemo(() => getRequiredFields(action.actionType), [action.actionType]);

  // Auto-open edit mode for manually added actions
  useEffect(() => {
    if (autoEdit && !isEditing) {
      handleStartEdit();
      onAutoEditConsumed?.();
    }
  }, [autoEdit]);

  const config = ACTION_TYPE_CONFIG[action.actionType] || {
    label: action.actionType.replace(/_/g, " "),
    icon: <ListTodo className="h-4 w-4" />,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-l-gray-500",
  };

  const fields = getFieldsForAction(action.actionType);
  const primaryContent = getPrimaryContent(action.actionType, action.payload);
  const secondaryDetails = getSecondaryDetails(action.actionType, action.payload);
  const hasContent = primaryContent !== null;

  // Determine stages for the currently selected pipeline
  const selectedPipelineName = editedPayload.pipelineName || "";
  const stagesForSelectedPipeline = useMemo(() => {
    if (!selectedPipelineName) return [];
    const pipeline = ghlData.pipelines.find(
      p => p.name.toLowerCase() === selectedPipelineName.toLowerCase()
    );
    return pipeline?.stages || [];
  }, [selectedPipelineName, ghlData.pipelines]);

  const handleStartEdit = () => {
    setValidationErrors([]);
    const payload = { ...action.payload };

    // Auto-assign for create_task: default to the team member who made the call
    if (action.actionType === "create_task" && !payload.assignedTo && teamMemberName) {
      const match = ghlData.teamMembers.find(
        m => m.name.toLowerCase() === teamMemberName.toLowerCase()
      );
      if (match) {
        payload.assignedTo = match.ghlUserId;
      }
    }

    // Auto-assign for update_task: default to the task's current assignee
    if (action.actionType === "update_task" && !payload.assignedTo && payload.taskKeyword) {
      const matchedTask = ghlData.tasks.find(
        t => t.title.toLowerCase() === payload.taskKeyword.toLowerCase()
      );
      if (matchedTask && (matchedTask as any).assignedToGhlId) {
        payload.assignedTo = (matchedTask as any).assignedToGhlId;
      }
    }

    setEditedPayload(payload);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    // Validate required fields before saving
    const missingKeys = getRequiredFields(action.actionType).filter(key => {
      const val = editedPayload[key];
      return !val || (typeof val === "string" && !val.trim());
    });
    if (missingKeys.length > 0) {
      setValidationErrors(missingKeys);
      const fields = getFieldsForAction(action.actionType);
      const labels = missingKeys.map(k => fields.find(f => f.key === k)?.label || k);
      toast.error(`Please fill in: ${labels.join(", ")}`);
      return;
    }
    setValidationErrors([]);
    onSaveEdit(action, editedPayload);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedPayload({ ...action.payload });
    setIsEditing(false);
    setAiInstruction("");
  };

  const handleAiEdit = () => {
    if (!aiInstruction.trim()) return;
    onAiEdit(action, aiInstruction);
    setAiInstruction("");
    setIsEditing(false);
  };

  const updateField = (key: string, value: string) => {
    setEditedPayload(prev => ({ ...prev, [key]: value }));
  };

  const isDone = action.status === "pushed" || action.status === "skipped";

  /** Render a single field — either a dropdown select or a standard input */
  const renderField = (field: { key: string; label: string; type: FieldType }) => {
    const value = editedPayload[field.key] || "";

    switch (field.type) {
      case "select-pipeline": {
        const options = ghlData.pipelines;
        return (
          <Select
            value={value}
            onValueChange={(v) => {
              updateField(field.key, v);
              // When pipeline changes, clear the stage since it depends on pipeline
              updateField("stageName", "");
            }}
          >
            <SelectTrigger className="text-sm bg-background">
              <SelectValue placeholder="Select pipeline..." />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {ghlData.isLoading ? "Loading pipelines..." : "No pipelines found"}
                </div>
              ) : (
                options.map(p => (
                  <SelectItem key={p.id} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );
      }

      case "select-stage": {
        const options = stagesForSelectedPipeline;
        return (
          <Select
            value={value}
            onValueChange={(v) => updateField(field.key, v)}
          >
            <SelectTrigger className="text-sm bg-background">
              <SelectValue placeholder={selectedPipelineName ? "Select stage..." : "Select a pipeline first..."} />
            </SelectTrigger>
            <SelectContent>
              {!selectedPipelineName ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Select a pipeline first
                </div>
              ) : options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No stages found for this pipeline
                </div>
              ) : (
                options.map(s => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );
      }

      case "select-task": {
        const options = ghlData.tasks;
        // If there are tasks, show dropdown; otherwise fallback to text input
        if (options.length === 0) {
          return (
            <Input
              type="text"
              value={value}
              onChange={(e) => updateField(field.key, e.target.value)}
              className="text-sm bg-background"
              placeholder="Enter task name or keyword..."
            />
          );
        }
        return (
          <Select
            value={value}
            onValueChange={(v) => {
              updateField(field.key, v);
              // Auto-populate assignedTo when a task is selected (for update_task)
              if (action.actionType === "update_task") {
                const selectedTask = options.find(t => t.title === v);
                if (selectedTask && (selectedTask as any).assignedToGhlId) {
                  updateField("assignedTo", (selectedTask as any).assignedToGhlId);
                }
              }
            }}
          >
            <SelectTrigger className="text-sm bg-background">
              <SelectValue placeholder="Select task..." />
            </SelectTrigger>
            <SelectContent>
              {options.map(t => (
                <SelectItem key={t.id} value={t.title}>
                  <div className="flex flex-col">
                    <span>{t.title}</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {t.dueDate && (
                        <span>Due: {new Date(t.dueDate).toLocaleDateString()}</span>
                      )}
                      {t.assignedTo && (
                        <span className="inline-flex items-center gap-0.5">
                          <span className="text-[9px]">{"\u2022"}</span> {t.assignedTo}
                        </span>
                      )}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "select-workflow": {
        const options = ghlData.workflows;
        return (
          <Select
            value={value}
            onValueChange={(v) => updateField(field.key, v)}
          >
            <SelectTrigger className="text-sm bg-background">
              <SelectValue placeholder="Select workflow..." />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {ghlData.isLoading ? "Loading workflows..." : "No workflows found"}
                </div>
              ) : (
                options.map(w => (
                  <SelectItem key={w.id} value={w.name}>
                    {w.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );
      }

      case "select-calendar": {
        const options = ghlData.calendars;
        return (
          <Select
            value={value}
            onValueChange={(v) => updateField(field.key, v)}
          >
            <SelectTrigger className="text-sm bg-background">
              <SelectValue placeholder="Select calendar..." />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {ghlData.isLoading ? "Loading calendars..." : "No calendars found"}
                </div>
              ) : (
                options.map(c => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );
      }

      case "select-assignee": {
        const members = ghlData.teamMembers;
        return (
          <Select
            value={value}
            onValueChange={(v) => updateField(field.key, v)}
          >
            <SelectTrigger className="text-sm bg-background">
              <SelectValue placeholder="Select team member..." />
            </SelectTrigger>
            <SelectContent>
              {members.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {ghlData.isLoading ? "Loading team members..." : "No team members found"}
                </div>
              ) : (
                members.map(m => (
                  <SelectItem key={m.ghlUserId} value={m.ghlUserId}>
                    {m.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        );
      }

      case "textarea":
        return (
          <Textarea
            value={value}
            onChange={(e) => updateField(field.key, e.target.value)}
            className="text-sm min-h-[80px] bg-background"
            placeholder={`Enter ${field.label.toLowerCase()}...`}
          />
        );

      default:
        return (
          <Input
            type={field.type === "date" ? "date" : field.type === "time" ? "time" : field.type === "datetime" ? "datetime-local" : "text"}
            value={value}
            onChange={(e) => updateField(field.key, e.target.value)}
            className="text-sm bg-background"
            placeholder={`Enter ${field.label.toLowerCase()}...`}
          />
        );
    }
  };

  return (
    <div className={`border rounded-lg overflow-hidden transition-all border-l-4 ${config.borderColor} ${
      action.status === "pushed" ? "opacity-70" :
      action.status === "skipped" ? "opacity-50" :
      action.status === "failed" ? "border-l-red-500" :
      ""
    }`}>
      {/* Header — action type + badges */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${config.bgColor}`}>
        <span className={config.color}>{config.icon}</span>
        <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
        {action.aiSuggested && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
            AI
          </Badge>
        )}
        {action.status === "pushed" && (
          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700 border-green-300">
            <Check className="h-2.5 w-2.5 mr-0.5" /> Pushed
          </Badge>
        )}
        {action.status === "skipped" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Skipped</Badge>
        )}
        {action.status === "failed" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-red-50 text-red-600 border-red-300">
            <X className="h-2.5 w-2.5 mr-0.5" /> Failed
          </Badge>
        )}
      </div>

      {/* CONTENT AREA — the main event */}
      <div className="px-4 py-3">
        {isEditing ? (
          /* ===== EDIT MODE ===== */
          <div className="space-y-3">
            {/* Manual field editing with dropdowns */}
            {fields.map(field => {
              const isRequired = requiredFieldKeys.includes(field.key);
              const isEmpty = !editedPayload[field.key] || (typeof editedPayload[field.key] === "string" && !editedPayload[field.key].trim());
              const showError = validationErrors.includes(field.key) && isEmpty;
              return (
                <div key={field.key} className="space-y-1">
                  <Label className={`text-xs font-medium ${showError ? "text-red-500" : "text-muted-foreground"}`}>
                    {field.label}
                    {isRequired && <span className="text-red-400 ml-0.5">*</span>}
                  </Label>
                  <div className={showError ? "[&>*]:ring-2 [&>*]:ring-red-400 [&>*]:rounded-md" : ""}>
                    {renderField(field)}
                  </div>
                  {showError && (
                    <p className="text-[11px] text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {field.label} is required
                    </p>
                  )}
                </div>
              );
            })}

            {/* AI-assisted edit input */}
            <div className="border-t pt-3 mt-3">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5">
                <MessageCircle className="h-3 w-3" />
                Or tell AI what to change
              </Label>
              <div className="flex gap-2">
                <Input
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder='e.g. "make the note shorter" or "change due date to next Friday"'
                  className="text-sm flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiInstruction.trim()) {
                      handleAiEdit();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAiEdit}
                  disabled={!aiInstruction.trim() || isAiEditing}
                  className="h-9 text-xs shrink-0"
                >
                  {isAiEditing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 mr-1" />
                      Apply
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSaveEdit} className="h-7 text-xs">
                <Check className="h-3 w-3 mr-1" />
                Save Changes
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-7 text-xs">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* ===== READ MODE — content first ===== */
          <div className="space-y-2">
            {hasContent ? (
              <>
                {/* Primary content — the exact text/value */}
                {primaryContent!.value.length > 100 ? (
                  <div className="bg-muted/40 rounded-md px-3 py-2">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {primaryContent!.value}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-foreground">
                    {primaryContent!.value}
                  </p>
                )}

                {/* Secondary details — due date, time, etc. */}
                {secondaryDetails.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {secondaryDetails.map(d => (
                      <span key={d.label} className="text-xs text-muted-foreground">
                        <span className="font-medium">{d.label}:</span> {d.value}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* No content — show a placeholder prompting to edit */
              <p className="text-sm text-muted-foreground italic">
                No content generated yet. Click Edit to add details or Regenerate to retry.
              </p>
            )}

            {/* AI Reasoning — collapsible, secondary to content */}
            {action.reasoning && (
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Sparkles className="h-3 w-3 text-purple-400" />
                <span className="italic">Why this action?</span>
                {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
            {showReasoning && action.reasoning && (
              <p className="text-xs text-muted-foreground italic pl-4 border-l-2 border-purple-200 dark:border-purple-800">
                {action.reasoning}
              </p>
            )}

            {/* Result message */}
            {action.result && (
              <p className={`text-xs mt-1 ${action.status === "failed" ? "text-red-500" : "text-green-600"}`}>
                {action.result}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!isDone && !isEditing && (
        <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/30">
          <Button
            size="sm"
            onClick={() => {
              const missing = validatePayload(action.actionType, action.payload);
              if (missing.length > 0) {
                toast.error(`Missing required fields: ${missing.join(", ")}. Click Edit to fill them in.`);
                return;
              }
              onPush(action);
            }}
            disabled={isPushing}
            className="h-7 text-xs"
          >
            {isPushing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Send className="h-3 w-3 mr-1" />
            )}
            Push to GHL
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleStartEdit}
            className="h-7 text-xs"
          >
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSkip(action)}
            className="h-7 text-xs text-muted-foreground"
          >
            Skip
          </Button>
          {!action.aiSuggested && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(action)}
              className="h-7 text-xs text-red-500 hover:text-red-700 ml-auto"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function NextStepsTab({
  callId,
  contactName,
  ghlContactId,
  teamMemberName,
}: {
  callId: number;
  contactName: string;
  ghlContactId?: string | null;
  teamMemberName?: string | null;
}) {
  const [actions, setActions] = useState<NextStepAction[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [autoEditActionId, setAutoEditActionId] = useState<string | null>(null);
  const [pushingActionId, setPushingActionId] = useState<string | null>(null);
  const [aiEditingActionId, setAiEditingActionId] = useState<string | null>(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionType, setNewActionType] = useState("");
  const [newActionSummary, setNewActionSummary] = useState("");
  const { isDemo, guardAction: guardDemoAction } = useDemo();

  // Fetch GHL dropdown data (pipelines, workflows, calendars, tasks)
  const ghlData = useGhlDropdownData(ghlContactId);

  // Load stored next steps from DB on mount
  const storedQuery = trpc.calls.getNextSteps.useQuery(
    { callId },
    { enabled: !!callId }
  );

  // When stored data loads, populate actions
  useEffect(() => {
    if (storedQuery.data && !isLoaded) {
      const stored = storedQuery.data.actions;
      if (stored.length > 0) {
        const mapped: NextStepAction[] = stored.map((a, i) => ({
          id: a.dbId ? `db-${a.dbId}` : `stored-${i}`,
          dbId: a.dbId,
          actionType: a.actionType,
          reasoning: a.reason || "",
          aiSuggested: a.suggested,
          payload: a.payload || {},
          status: (a.status === "pushed" || a.status === "skipped" || a.status === "failed")
            ? a.status
            : "pending" as const,
          result: a.result,
        }));
        setActions(mapped);
      }
      setIsLoaded(true);
    }
  }, [storedQuery.data, isLoaded]);

  const generateMutation = trpc.calls.generateNextSteps.useMutation({
    onSuccess: (data) => {
      storedQuery.refetch().then((res) => {
        if (res.data) {
          const stored = res.data.actions;
          const mapped: NextStepAction[] = stored.map((a, i) => ({
            id: a.dbId ? `db-${a.dbId}` : `gen-${i}`,
            dbId: a.dbId,
            actionType: a.actionType,
            reasoning: a.reason || "",
            aiSuggested: a.suggested,
            payload: a.payload || {},
            status: "pending" as const,
            result: undefined,
          }));
          setActions(mapped);
        }
      });
      if ((data.actions || []).length === 0) {
        toast.info("No specific next steps suggested for this call.");
      }
    },
    onError: (error) => {
      toast.error(`Failed to generate next steps: ${error.message}`);
    },
  });

  const createPendingMutation = trpc.coachActions.createPending.useMutation();
  const confirmExecuteMutation = trpc.coachActions.confirmAndExecute.useMutation();
  const updateStatusMutation = trpc.calls.updateNextStepStatus.useMutation();
  const editNextStepMutation = trpc.calls.editNextStep.useMutation();

  const handleGenerate = () => {
    if (guardDemoAction("Generating next steps")) return;
    setIsLoaded(false);
    generateMutation.mutate({ callId });
  };

  const handlePush = async (action: NextStepAction) => {
    if (guardDemoAction("Pushing to GHL")) return;
    setPushingActionId(action.id);

    try {
      const primary = getPrimaryContent(action.actionType, action.payload);
      const pending = await createPendingMutation.mutateAsync({
        actionType: action.actionType,
        requestText: `Next step: ${primary?.value || action.actionType}`,
        targetContactId: ghlContactId || undefined,
        targetContactName: contactName || undefined,
        payload: action.payload,
      });

      const result = await confirmExecuteMutation.mutateAsync({
        actionId: pending.actionId,
      });

      const newStatus = result.success ? "pushed" as const : "failed" as const;
      const resultMsg = result.success ? "Action completed successfully!" : (result.error || "Action failed");

      setActions(prev => prev.map(a =>
        a.id === action.id ? { ...a, status: newStatus, result: resultMsg } : a
      ));

      if (action.dbId) {
        updateStatusMutation.mutate({
          nextStepId: action.dbId,
          status: newStatus,
          result: resultMsg,
        });
      }

      if (result.success) {
        toast.success(`${ACTION_TYPE_CONFIG[action.actionType]?.label || action.actionType} pushed to GHL!`);
      } else {
        toast.error(`Failed: ${result.error || "Unknown error"}`);
      }
    } catch (error: any) {
      const errMsg = error?.message || "Failed to push";
      setActions(prev => prev.map(a =>
        a.id === action.id ? { ...a, status: "failed" as const, result: errMsg } : a
      ));
      if (action.dbId) {
        updateStatusMutation.mutate({
          nextStepId: action.dbId,
          status: "failed",
          result: errMsg,
        });
      }
      toast.error(`Failed to push: ${errMsg}`);
    } finally {
      setPushingActionId(null);
    }
  };

  const handleSaveEdit = (action: NextStepAction, newPayload: Record<string, any>) => {
    setActions(prev => prev.map(a =>
      a.id === action.id ? { ...a, payload: newPayload } : a
    ));
    // Persist to DB
    if (action.dbId) {
      editNextStepMutation.mutate({
        nextStepId: action.dbId,
        payload: newPayload,
      });
    }
    toast.success("Changes saved");
  };

  const handleAiEdit = async (action: NextStepAction, instruction: string) => {
    if (!action.dbId) {
      toast.error("Cannot AI-edit an unsaved action");
      return;
    }
    setAiEditingActionId(action.id);
    try {
      const result = await editNextStepMutation.mutateAsync({
        nextStepId: action.dbId,
        aiInstruction: instruction,
        currentAction: {
          actionType: action.actionType,
          payload: action.payload,
        },
      });
      if (result.success && result.action?.payload) {
        setActions(prev => prev.map(a =>
          a.id === action.id ? { ...a, payload: result.action!.payload } : a
        ));
        toast.success("AI updated the action");
      } else {
        toast.error("AI edit failed \u2014 try again or edit manually");
      }
    } catch (error: any) {
      toast.error(`AI edit failed: ${error?.message || "Unknown error"}`);
    } finally {
      setAiEditingActionId(null);
    }
  };

  const handleSkip = (action: NextStepAction) => {
    setActions(prev => prev.map(a =>
      a.id === action.id ? { ...a, status: "skipped" as const } : a
    ));
    if (action.dbId) {
      updateStatusMutation.mutate({
        nextStepId: action.dbId,
        status: "skipped",
      });
    }
  };

  const handleDelete = (action: NextStepAction) => {
    setActions(prev => prev.filter(a => a.id !== action.id));
    if (action.dbId) {
      updateStatusMutation.mutate({
        nextStepId: action.dbId,
        status: "skipped",
        result: "Deleted by user",
      });
    }
  };

  const handleAddAction = () => {
    if (!newActionType || !newActionSummary.trim()) {
      toast.error("Please select an action type and enter a summary");
      return;
    }

    const defaultPayload = buildDefaultPayload(newActionType, contactName, ghlContactId);
    const enrichedPayload = { ...defaultPayload };
    if (newActionType === "create_task") enrichedPayload.title = newActionSummary;
    else if (newActionType === "add_note") enrichedPayload.noteBody = newActionSummary;
    else if (newActionType === "send_sms" || newActionType === "schedule_sms") enrichedPayload.message = newActionSummary;
    else if (newActionType === "create_appointment") enrichedPayload.title = newActionSummary;

    const newAction: NextStepAction = {
      id: `manual-${Date.now()}`,
      actionType: newActionType,
      reasoning: "",
      aiSuggested: false,
      payload: enrichedPayload,
      status: "pending",
    };

    setActions(prev => [...prev, newAction]);
    setAutoEditActionId(newAction.id);
    setNewActionType("");
    setNewActionSummary("");
    setShowAddAction(false);
  };

  const pendingActions = useMemo(() => actions.filter(a => a.status === "pending" || a.status === "editing"), [actions]);
  const completedActions = useMemo(() => actions.filter(a => a.status === "pushed" || a.status === "skipped" || a.status === "failed"), [actions]);

  const handlePushAll = async () => {
    if (guardDemoAction("Pushing all to GHL")) return;
    for (const action of pendingActions) {
      await handlePush(action);
    }
  };

  const hasStoredActions = isLoaded && actions.length > 0;
  const showGeneratePrompt = isLoaded && actions.length === 0;
  const isLoadingStored = !isLoaded && storedQuery.isLoading;

  return (
    <div className="space-y-4">
      {/* Loading state */}
      {isLoadingStored && (
        <div className="obs-panel">
          <div className="flex flex-col items-center justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Loading next steps...</p>
          </div>
        </div>
      )}

      {/* Generate Button — only if no stored actions */}
      {showGeneratePrompt && (
        <div className="obs-panel">
          <div className="flex flex-col items-center justify-center py-10">
            <Sparkles className="h-10 w-10 text-purple-500 mb-3" />
            <h3 className="text-lg font-semibold mb-1">AI-Suggested Next Steps</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Analyze the call transcript, prior communication, and your action patterns to suggest the best next steps for this lead.
            </p>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="gap-2"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing call...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Next Steps
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Actions List */}
      {(hasStoredActions || generateMutation.isPending) && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                {pendingActions.length > 0
                  ? `${pendingActions.length} pending step${pendingActions.length !== 1 ? "s" : ""}`
                  : "All steps processed"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Review, edit, and push each action to GHL
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddAction(!showAddAction)}
                className="h-8 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Action
              </Button>
              {pendingActions.length > 1 && (
                <Button
                  size="sm"
                  onClick={handlePushAll}
                  disabled={!!pushingActionId}
                  className="h-8 text-xs"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Push All ({pendingActions.length})
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="h-8 text-xs"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Regenerate"
                )}
              </Button>
            </div>
          </div>

          {/* Add Action Form */}
          {showAddAction && (
            <div className="obs-panel" style={{ borderStyle: 'dashed' }}>
              <div className="py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Action Type</Label>
                    <Select value={newActionType} onValueChange={setNewActionType}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ACTION_TYPES.map(type => (
                          <SelectItem key={type} value={type}>
                            <span className="flex items-center gap-2">
                              {ACTION_TYPE_CONFIG[type]?.icon}
                              {ACTION_TYPE_CONFIG[type]?.label || type}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Summary</Label>
                    <Input
                      value={newActionSummary}
                      onChange={(e) => setNewActionSummary(e.target.value)}
                      placeholder="What should this action do?"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddAction} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddAction(false)} className="h-7 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Pending Actions */}
          {pendingActions.length > 0 && (
            <div className="space-y-3">
              {pendingActions.map(action => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onPush={handlePush}
                  onSaveEdit={handleSaveEdit}
                  onAiEdit={handleAiEdit}
                  onSkip={handleSkip}
                  onDelete={handleDelete}
                  isPushing={pushingActionId === action.id}
                  isAiEditing={aiEditingActionId === action.id}
                  ghlData={ghlData}
                  teamMemberName={teamMemberName}
                  autoEdit={autoEditActionId === action.id}
                  onAutoEditConsumed={() => setAutoEditActionId(null)}
                />
              ))}
            </div>
          )}

          {/* Completed Actions */}
          {completedActions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Completed
              </h4>
              {completedActions.map(action => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onPush={handlePush}
                  onSaveEdit={handleSaveEdit}
                  onAiEdit={handleAiEdit}
                  onSkip={handleSkip}
                  onDelete={handleDelete}
                  isPushing={pushingActionId === action.id}
                  isAiEditing={aiEditingActionId === action.id}
                  ghlData={ghlData}
                  teamMemberName={teamMemberName}
                  autoEdit={autoEditActionId === action.id}
                  onAutoEditConsumed={() => setAutoEditActionId(null)}
                />
              ))}
            </div>
          )}

          {actions.length === 0 && !generateMutation.isPending && (
            <div className="obs-panel">
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No next steps suggested. The AI didn't identify specific actions needed for this call.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddAction(true)}
                  className="mt-3"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Action Manually
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildDefaultPayload(actionType: string, contactName: string, ghlContactId?: string | null): Record<string, any> {
  const base: Record<string, any> = {};
  if (ghlContactId) base.contactId = ghlContactId;
  if (contactName) base.contactName = contactName;

  switch (actionType) {
    case "create_task":
      return { ...base, title: "", dueDate: "" };
    case "update_task":
      return { ...base, dueDate: "" };
    case "check_off_task":
      return { ...base };
    case "add_note":
      return { ...base, noteBody: "" };
    case "send_sms":
      return { ...base, message: "" };
    case "schedule_sms":
      return { ...base, message: "", scheduledTime: "" };
    case "change_pipeline_stage":
      return { ...base, pipelineName: "", stageName: "" };
    case "create_appointment":
      return { ...base, title: "", startTime: "", endTime: "" };
    case "add_to_workflow":
      return { ...base, workflowName: "" };
    case "remove_from_workflow":
      return { ...base, workflowName: "" };
    default:
      return base;
  }
}
