import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
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
}> = {
  check_off_task: {
    label: "Check Off Task",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950",
  },
  update_task: {
    label: "Update Task",
    icon: <Edit3 className="h-4 w-4" />,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950",
  },
  create_task: {
    label: "Create Task",
    icon: <ListTodo className="h-4 w-4" />,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950",
  },
  add_note: {
    label: "Add Note",
    icon: <StickyNote className="h-4 w-4" />,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950",
  },
  create_appointment: {
    label: "Add to Calendar",
    icon: <Calendar className="h-4 w-4" />,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950",
  },
  change_pipeline_stage: {
    label: "Move Pipeline Stage",
    icon: <ArrowRightLeft className="h-4 w-4" />,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950",
  },
  send_sms: {
    label: "Send SMS",
    icon: <MessageSquare className="h-4 w-4" />,
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50 dark:bg-teal-950",
  },
  schedule_sms: {
    label: "Schedule SMS",
    icon: <Clock className="h-4 w-4" />,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950",
  },
  add_to_workflow: {
    label: "Start Workflow",
    icon: <Play className="h-4 w-4" />,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950",
  },
  remove_from_workflow: {
    label: "Remove from Workflow",
    icon: <Square className="h-4 w-4" />,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950",
  },
};

const ALL_ACTION_TYPES = [
  "check_off_task", "update_task", "create_task", "add_note",
  "create_appointment", "change_pipeline_stage", "send_sms",
  "schedule_sms", "add_to_workflow", "remove_from_workflow",
];

/** Get the field config for each action type — defines which fields to show and how */
function getFieldsForAction(actionType: string): { key: string; label: string; type: "text" | "textarea" | "date" | "time" | "datetime" }[] {
  switch (actionType) {
    case "check_off_task":
      return [{ key: "taskKeyword", label: "Task keyword to match", type: "text" }];
    case "update_task":
      return [
        { key: "taskKeyword", label: "Task keyword to match", type: "text" },
        { key: "dueDate", label: "New due date", type: "date" },
        { key: "description", label: "New description", type: "textarea" },
      ];
    case "create_task":
      return [
        { key: "title", label: "Task title", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "dueDate", label: "Due date", type: "date" },
      ];
    case "add_note":
      return [{ key: "noteBody", label: "Note content", type: "textarea" }];
    case "create_appointment":
      return [
        { key: "title", label: "Appointment title", type: "text" },
        { key: "startTime", label: "Start time", type: "datetime" },
        { key: "endTime", label: "End time", type: "datetime" },
        { key: "calendarName", label: "Calendar", type: "text" },
      ];
    case "change_pipeline_stage":
      return [
        { key: "pipelineName", label: "Pipeline", type: "text" },
        { key: "stageName", label: "Stage", type: "text" },
      ];
    case "send_sms":
      return [{ key: "message", label: "SMS message", type: "textarea" }];
    case "schedule_sms":
      return [
        { key: "message", label: "SMS message", type: "textarea" },
        { key: "scheduledDate", label: "Send date", type: "date" },
        { key: "scheduledTime", label: "Send time", type: "time" },
      ];
    case "add_to_workflow":
      return [{ key: "workflowName", label: "Workflow", type: "text" }];
    case "remove_from_workflow":
      return [{ key: "workflowName", label: "Workflow", type: "text" }];
    default:
      return [];
  }
}

function getPayloadPreview(actionType: string, payload: Record<string, any>): string {
  switch (actionType) {
    case "add_note":
      return payload.noteBody || "Add a note";
    case "create_task":
      return payload.title || "Create a task";
    case "send_sms":
    case "schedule_sms":
      return payload.message || "Send SMS";
    case "change_pipeline_stage":
      return `${payload.pipelineName || ""} → ${payload.stageName || ""}`.trim();
    case "add_to_workflow":
      return payload.workflowName || "Start workflow";
    default:
      return actionType.replace(/_/g, " ");
  }
}

function ActionCard({
  action,
  onPush,
  onEdit,
  onSkip,
  onDelete,
  isPushing,
}: {
  action: NextStepAction;
  onPush: (action: NextStepAction) => void;
  onEdit: (action: NextStepAction, updates: Partial<NextStepAction>) => void;
  onSkip: (action: NextStepAction) => void;
  onDelete: (action: NextStepAction) => void;
  isPushing: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPayload, setEditedPayload] = useState<Record<string, any>>({ ...action.payload });

  const config = ACTION_TYPE_CONFIG[action.actionType] || {
    label: action.actionType.replace(/_/g, " "),
    icon: <ListTodo className="h-4 w-4" />,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
  };

  const fields = getFieldsForAction(action.actionType);

  const handleStartEdit = () => {
    setEditedPayload({ ...action.payload });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onEdit(action, { payload: editedPayload });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedPayload({ ...action.payload });
    setIsEditing(false);
  };

  const updateField = (key: string, value: string) => {
    setEditedPayload(prev => ({ ...prev, [key]: value }));
  };

  const isDone = action.status === "pushed" || action.status === "skipped";
  const currentPayload = isEditing ? editedPayload : action.payload;

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${
      action.status === "pushed" ? "border-green-300 dark:border-green-800 opacity-80" :
      action.status === "skipped" ? "border-gray-200 dark:border-gray-800 opacity-60" :
      action.status === "failed" ? "border-red-300 dark:border-red-800" :
      "border-border"
    }`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${config.bgColor}`}>
        <span className={config.color}>{config.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
            {action.aiSuggested && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                AI
              </Badge>
            )}
            {action.status === "pushed" && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-300">
                <Check className="h-2.5 w-2.5 mr-0.5" />
                Pushed
              </Badge>
            )}
            {action.status === "skipped" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                Skipped
              </Badge>
            )}
            {action.status === "failed" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-red-50 text-red-600 border-red-300 dark:bg-red-950 dark:text-red-400">
                <X className="h-2.5 w-2.5 mr-0.5" />
                Failed
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Payload Content — ALWAYS visible, shows exactly what will be pushed */}
      <div className="px-4 py-3 space-y-2">
        {fields.length > 0 ? (
          fields.map(field => {
            const value = currentPayload[field.key];
            if (!isEditing && (!value || (typeof value === "string" && !value.trim()))) return null;

            if (isEditing) {
              return (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      value={editedPayload[field.key] || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="text-sm min-h-[80px] bg-background"
                      placeholder={`Enter ${field.label.toLowerCase()}...`}
                    />
                  ) : (
                    <Input
                      type={field.type === "date" ? "date" : field.type === "time" ? "time" : field.type === "datetime" ? "datetime-local" : "text"}
                      value={editedPayload[field.key] || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="text-sm bg-background"
                      placeholder={`Enter ${field.label.toLowerCase()}...`}
                    />
                  )}
                </div>
              );
            }

            // Read-only display
            const isLongText = field.type === "textarea";
            return (
              <div key={field.key}>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{field.label}</span>
                {isLongText ? (
                  <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap leading-relaxed bg-muted/40 rounded px-3 py-2">
                    {String(value)}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-foreground mt-0.5">{String(value)}</p>
                )}
              </div>
            );
          })
        ) : (
          // Fallback: show all payload keys if no field config
          Object.entries(currentPayload)
            .filter(([key]) => key !== "contactId" && key !== "contactName")
            .map(([key, value]) => {
              if (!value || (typeof value === "string" && !value.trim())) return null;
              const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
              if (isEditing) {
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      value={editedPayload[key] || ""}
                      onChange={(e) => updateField(key, e.target.value)}
                      className="text-sm"
                    />
                  </div>
                );
              }
              return (
                <div key={key}>
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
                  <p className="text-sm font-medium text-foreground mt-0.5">{String(value)}</p>
                </div>
              );
            })
        )}

        {/* AI Reasoning — shown below the content */}
        {action.reasoning && !isEditing && (
          <p className="text-xs text-muted-foreground italic border-t pt-2 mt-2">
            <Sparkles className="h-3 w-3 inline mr-1 text-purple-400" />
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

      {/* Action Buttons */}
      {!isDone && (
        <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/30">
          {isEditing ? (
            <>
              <Button size="sm" onClick={handleSaveEdit} className="h-7 text-xs">
                <Check className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-7 text-xs">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => onPush(action)}
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
            </>
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
}: {
  callId: number;
  contactName: string;
  ghlContactId?: string | null;
}) {
  const [actions, setActions] = useState<NextStepAction[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pushingActionId, setPushingActionId] = useState<string | null>(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionType, setNewActionType] = useState("");
  const [newActionSummary, setNewActionSummary] = useState("");
  const { isDemo, guardAction: guardDemoAction } = useDemo();

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
      // Reload from DB after generation
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

  const handleGenerate = () => {
    if (guardDemoAction("Generating next steps")) return;
    generateMutation.mutate({ callId });
  };

  const handlePush = async (action: NextStepAction) => {
    if (guardDemoAction("Pushing to GHL")) return;
    setPushingActionId(action.id);

    try {
      const pending = await createPendingMutation.mutateAsync({
        actionType: action.actionType,
        requestText: `Next step: ${getPayloadPreview(action.actionType, action.payload)}`,
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
        a.id === action.id
          ? { ...a, status: newStatus, result: resultMsg }
          : a
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
        a.id === action.id
          ? { ...a, status: "failed" as const, result: errMsg }
          : a
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

  const handleEdit = (action: NextStepAction, updates: Partial<NextStepAction>) => {
    setActions(prev => prev.map(a =>
      a.id === action.id ? { ...a, ...updates } : a
    ));
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Loading next steps...</p>
          </CardContent>
        </Card>
      )}

      {/* Generate Button — only if no stored actions */}
      {showGeneratePrompt && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
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
          </CardContent>
        </Card>
      )}

      {/* Actions List */}
      {(hasStoredActions || generateMutation.isPending) && (
        <>
          {/* Header with actions */}
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
            <Card className="border-dashed">
              <CardContent className="py-4 space-y-3">
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
              </CardContent>
            </Card>
          )}

          {/* Pending Actions */}
          {pendingActions.length > 0 && (
            <div className="space-y-3">
              {pendingActions.map(action => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onPush={handlePush}
                  onEdit={handleEdit}
                  onSkip={handleSkip}
                  onDelete={handleDelete}
                  isPushing={pushingActionId === action.id}
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
                  onEdit={handleEdit}
                  onSkip={handleSkip}
                  onDelete={handleDelete}
                  isPushing={pushingActionId === action.id}
                />
              ))}
            </div>
          )}

          {actions.length === 0 && !generateMutation.isPending && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
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
              </CardContent>
            </Card>
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
