import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  ChevronDown,
  ChevronUp,
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
  actionType: string;
  summary: string;
  reasoning: string;
  aiSuggested: boolean;
  payload: Record<string, any>;
  status: "suggested" | "editing" | "pushing" | "pushed" | "failed" | "skipped";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(action.summary);
  const [editedPayload, setEditedPayload] = useState<Record<string, any>>(action.payload);

  const config = ACTION_TYPE_CONFIG[action.actionType] || {
    label: action.actionType.replace(/_/g, " "),
    icon: <ListTodo className="h-4 w-4" />,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
  };

  const handleSaveEdit = () => {
    onEdit(action, {
      summary: editedSummary,
      payload: editedPayload,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedSummary(action.summary);
    setEditedPayload(action.payload);
    setIsEditing(false);
  };

  const renderPayloadField = (key: string, value: any) => {
    if (key === "contactId" || key === "contactName") return null;
    const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
    
    if (isEditing) {
      if (typeof value === "string" && value.length > 60) {
        return (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Textarea
              value={editedPayload[key] || ""}
              onChange={(e) => setEditedPayload({ ...editedPayload, [key]: e.target.value })}
              className="text-sm min-h-[60px]"
            />
          </div>
        );
      }
      return (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <Input
            value={editedPayload[key] || ""}
            onChange={(e) => setEditedPayload({ ...editedPayload, [key]: e.target.value })}
            className="text-sm"
          />
        </div>
      );
    }

    return (
      <div key={key} className="flex gap-2 text-sm">
        <span className="text-muted-foreground shrink-0">{label}:</span>
        <span className="font-medium">{String(value)}</span>
      </div>
    );
  };

  const isDone = action.status === "pushed" || action.status === "skipped";

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
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
            {action.aiSuggested && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                AI Suggested
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
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                Failed
              </Badge>
            )}
          </div>
        </div>
        {!isDone && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="px-4 py-3">
        {isEditing ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Summary</Label>
            <Input
              value={editedSummary}
              onChange={(e) => setEditedSummary(e.target.value)}
              className="text-sm"
            />
          </div>
        ) : (
          <p className="text-sm">{action.summary}</p>
        )}
        
        {action.reasoning && !isEditing && (
          <p className="text-xs text-muted-foreground mt-1 italic">{action.reasoning}</p>
        )}

        {action.result && (
          <p className={`text-xs mt-1 ${action.status === "failed" ? "text-red-500" : "text-green-600"}`}>
            {action.result}
          </p>
        )}
      </div>

      {/* Expanded Details */}
      {(isExpanded || isEditing) && (
        <div className="px-4 pb-3 space-y-2 border-t pt-3">
          {Object.entries(action.payload).map(([key, value]) => renderPayloadField(key, value))}
        </div>
      )}

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
                onClick={() => setIsEditing(true)}
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
  const [isGenerated, setIsGenerated] = useState(false);
  const [pushingActionId, setPushingActionId] = useState<string | null>(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionType, setNewActionType] = useState("");
  const [newActionSummary, setNewActionSummary] = useState("");
  const { isDemo, guardAction: guardDemoAction } = useDemo();

  const generateMutation = trpc.calls.generateNextSteps.useMutation({
    onSuccess: (data) => {
      const mapped: NextStepAction[] = (data.actions || []).map((a: any, i: number) => ({
        id: `ai-${i}-${Date.now()}`,
        actionType: a.actionType,
        summary: a.summary,
        reasoning: a.reasoning || "",
        aiSuggested: true,
        payload: a.payload || {},
        status: "suggested" as const,
      }));
      setActions(mapped);
      setIsGenerated(true);
      if (mapped.length === 0) {
        toast.info("No specific next steps suggested for this call.");
      }
    },
    onError: (error) => {
      toast.error(`Failed to generate next steps: ${error.message}`);
    },
  });

  const createPendingMutation = trpc.coachActions.createPending.useMutation();
  const confirmExecuteMutation = trpc.coachActions.confirmAndExecute.useMutation();

  const handleGenerate = () => {
    if (guardDemoAction("Generating next steps")) return;
    generateMutation.mutate({ callId });
  };

  const handlePush = async (action: NextStepAction) => {
    if (guardDemoAction("Pushing to GHL")) return;
    setPushingActionId(action.id);

    try {
      // Create pending action
      const pending = await createPendingMutation.mutateAsync({
        actionType: action.actionType,
        requestText: `Next step from call: ${action.summary}`,
        targetContactId: ghlContactId || undefined,
        targetContactName: contactName || undefined,
        payload: action.payload,
      });

      // Immediately confirm and execute
      const result = await confirmExecuteMutation.mutateAsync({
        actionId: pending.actionId,
      });

      setActions(prev => prev.map(a =>
        a.id === action.id
          ? {
              ...a,
              status: result.success ? "pushed" as const : "failed" as const,
              result: result.success ? "Action completed successfully!" : (result.error || "Action failed"),
            }
          : a
      ));

      if (result.success) {
        toast.success(`${ACTION_TYPE_CONFIG[action.actionType]?.label || action.actionType} pushed to GHL!`);
      } else {
        toast.error(`Failed: ${result.error || "Unknown error"}`);
      }
    } catch (error: any) {
      setActions(prev => prev.map(a =>
        a.id === action.id
          ? { ...a, status: "failed" as const, result: error?.message || "Failed to push" }
          : a
      ));
      toast.error(`Failed to push: ${error?.message || "Unknown error"}`);
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
  };

  const handleDelete = (action: NextStepAction) => {
    setActions(prev => prev.filter(a => a.id !== action.id));
  };

  const handleAddAction = () => {
    if (!newActionType || !newActionSummary.trim()) {
      toast.error("Please select an action type and enter a summary");
      return;
    }

    const newAction: NextStepAction = {
      id: `manual-${Date.now()}`,
      actionType: newActionType,
      summary: newActionSummary,
      reasoning: "",
      aiSuggested: false,
      payload: buildDefaultPayload(newActionType, contactName, ghlContactId),
      status: "suggested",
    };

    setActions(prev => [...prev, newAction]);
    setNewActionType("");
    setNewActionSummary("");
    setShowAddAction(false);
  };

  const pendingActions = useMemo(() => actions.filter(a => a.status === "suggested" || a.status === "editing"), [actions]);
  const completedActions = useMemo(() => actions.filter(a => a.status === "pushed" || a.status === "skipped" || a.status === "failed"), [actions]);

  const handlePushAll = async () => {
    if (guardDemoAction("Pushing all to GHL")) return;
    for (const action of pendingActions) {
      await handlePush(action);
    }
  };

  return (
    <div className="space-y-4">
      {/* Generate Button */}
      {!isGenerated && (
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
      {isGenerated && (
        <>
          {/* Header with actions */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                {pendingActions.length > 0
                  ? `${pendingActions.length} suggested step${pendingActions.length !== 1 ? "s" : ""}`
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

          {actions.length === 0 && (
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
