import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Phone, 
  PhoneIncoming,
  PhoneOutgoing,
  Clock, 
  User, 
  RefreshCw, 
  MessageSquare,
  CheckCircle,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  ArrowRight,
  Send,
  Bot,
  Sparkles,
  Loader2,
  Upload,
  FileAudio,
  Cloud,
  CloudOff,
  Filter,
  ChevronDown,
  X,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Tag,
  Pencil
} from "lucide-react";
import { Link, useSearch, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Streamdown } from "streamdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

function GradeBadge({ grade }: { grade: string }) {
  const gradeClass = `grade-${grade.toLowerCase()}`;
  return <span className={`grade-badge ${gradeClass}`}>{grade}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    transcribing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    grading: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    skipped: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${variants[status] || variants.pending}`}>
      {status}
    </span>
  );
}

const CALL_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  cold_call: { label: "Cold Call", color: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800" },
  qualification: { label: "Qualification", color: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800" },
  follow_up: { label: "Follow-Up", color: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" },
  offer: { label: "Offer", color: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800" },
  seller_callback: { label: "Seller Callback", color: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800" },
  admin_callback: { label: "Admin Callback", color: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800" },
};

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  interested: { label: "Interested", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  not_interested: { label: "Not Interested", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  appointment_set: { label: "Apt Set", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  callback_scheduled: { label: "Callback", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  offer_made: { label: "Offer Made", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  offer_accepted: { label: "Offer Accepted", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  offer_rejected: { label: "Offer Rejected", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  left_voicemail: { label: "Voicemail", color: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
  no_answer: { label: "No Answer", color: "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400" },
  wrong_number: { label: "Wrong #", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  do_not_call: { label: "DNC", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  other: { label: "Other", color: "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400" },
};

function CallCard({ call, grade }: { call: any; grade: any }) {
  const timeAgo = call.createdAt ? formatDistanceToNow(new Date(call.createdAt), { addSuffix: true }) : "Unknown";
  const callTypeInfo = CALL_TYPE_LABELS[call.callType] || CALL_TYPE_LABELS.qualification;
  const outcomeInfo = call.callOutcome ? OUTCOME_LABELS[call.callOutcome] : null;
  
  return (
    <Link href={`/calls/${call.id}`}>
      <Card className="card-hover cursor-pointer">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-sm sm:text-base truncate">
                  {call.contactName || call.contactPhone || "Unknown Contact"}
                </h3>
                {/* Call direction badge - hidden on mobile */}
                {call.callDirection === "inbound" ? (
                  <Badge variant="outline" className="hidden sm:flex text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                    <PhoneIncoming className="h-3 w-3 mr-1" />
                    Inbound
                  </Badge>
                ) : (
                  <Badge variant="outline" className="hidden sm:flex text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                    <PhoneOutgoing className="h-3 w-3 mr-1" />
                    Outbound
                  </Badge>
                )}
                {/* Call type badge */}
                <Badge variant="outline" className={`text-[10px] sm:text-xs ${callTypeInfo.color}`}>
                  {callTypeInfo.label}
                </Badge>
                {/* Outcome tag */}
                {outcomeInfo && (
                  <Badge variant="secondary" className={`text-[10px] sm:text-xs ${outcomeInfo.color}`}>
                    {outcomeInfo.label}
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                {call.teamMemberName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {call.teamMemberName}
                  </span>
                )}
                {call.duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, "0")}
                  </span>
                )}
                <span className="hidden sm:flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {timeAgo}
                </span>
                <span className="sm:hidden text-[10px]">{timeAgo}</span>
              </div>

              {/* Property address pill */}
              {call.propertyAddress && (
                <div className="mt-1.5">
                  <Badge variant="outline" className="text-[10px] sm:text-xs font-normal bg-muted/50 border-muted-foreground/20">
                    <MapPin className="h-3 w-3 mr-1 shrink-0" />
                    <span className="truncate max-w-[200px] sm:max-w-[300px]">{call.propertyAddress}</span>
                  </Badge>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-1 sm:gap-2 shrink-0">
              {call.status === "completed" && grade ? (
                <>
                  <GradeBadge grade={grade.overallGrade || "?"} />
                  <span className="text-xs sm:text-sm font-medium">
                    {grade.overallScore ? `${Math.round(parseFloat(grade.overallScore))}%` : ""}
                  </span>
                </>
              ) : (
                <StatusBadge status={call.status} />
              )}
            </div>
          </div>

          {grade?.summary && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 sm:mt-3 line-clamp-2 border-t pt-2 sm:pt-3">
              {grade.summary}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// Feedback Types
const FEEDBACK_TYPES = {
  score_too_high: { label: "Score Too High", icon: ThumbsDown, color: "text-red-500" },
  score_too_low: { label: "Score Too Low", icon: ThumbsUp, color: "text-green-500" },
  wrong_criteria: { label: "Wrong Criteria", icon: AlertTriangle, color: "text-yellow-500" },
  missed_issue: { label: "Missed Issue", icon: XCircle, color: "text-orange-500" },
  incorrect_feedback: { label: "Incorrect Feedback", icon: MessageSquare, color: "text-purple-500" },
  general_correction: { label: "General Correction", icon: MessageSquare, color: "text-blue-500" },
  praise: { label: "Praise", icon: ThumbsUp, color: "text-green-500" },
};

const STATUS_BADGES = {
  pending: { label: "Pending", variant: "secondary" as const, icon: Clock },
  reviewed: { label: "Reviewed", variant: "outline" as const, icon: CheckCircle },
  incorporated: { label: "Incorporated", variant: "default" as const, icon: CheckCircle },
  dismissed: { label: "Dismissed", variant: "destructive" as const, icon: XCircle },
};

function FeedbackCard({ 
  feedback, 
  onStatusChange,
  showActions = false
}: { 
  feedback: any;
  onStatusChange?: (id: number, status: "reviewed" | "incorporated" | "dismissed") => void;
  showActions?: boolean;
}) {
  const feedbackType = FEEDBACK_TYPES[feedback.feedbackType as keyof typeof FEEDBACK_TYPES] || FEEDBACK_TYPES.general_correction;
  const statusInfo = STATUS_BADGES[feedback.status as keyof typeof STATUS_BADGES] || STATUS_BADGES.pending;
  const Icon = feedbackType.icon;
  const StatusIcon = statusInfo.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted ${feedbackType.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {feedbackType.label}
                <Badge variant={statusInfo.variant}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusInfo.label}
                </Badge>
              </CardTitle>
              <CardDescription>
                {feedback.criteriaName && `Criteria: ${feedback.criteriaName} • `}
                {new Date(feedback.createdAt).toLocaleString()}
              </CardDescription>
            </div>
          </div>
          {feedback.callId && (
            <Link href={`/calls/${feedback.callId}`}>
              <Button variant="ghost" size="sm">
                View Call
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(feedback.originalScore || feedback.suggestedScore) && (
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            {feedback.originalScore && (
              <div>
                <p className="text-xs text-muted-foreground">Original</p>
                <p className="text-lg font-bold">{feedback.originalScore}%</p>
              </div>
            )}
            {feedback.originalScore && feedback.suggestedScore && (
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            )}
            {feedback.suggestedScore && (
              <div>
                <p className="text-xs text-muted-foreground">Suggested</p>
                <p className="text-lg font-bold text-primary">{feedback.suggestedScore}%</p>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-1">Explanation</p>
          <p className="text-sm text-muted-foreground">{feedback.explanation}</p>
        </div>

        {feedback.correctBehavior && (
          <div>
            <p className="text-sm font-medium mb-1">Correct Behavior</p>
            <p className="text-sm text-muted-foreground">{feedback.correctBehavior}</p>
          </div>
        )}

        {showActions && onStatusChange && (
          <div className="flex items-center gap-2 pt-2 border-t">
            {feedback.status === "pending" && (
              <>
                <Button size="sm" variant="outline" onClick={() => onStatusChange(feedback.id, "reviewed")}>
                  Mark Reviewed
                </Button>
                <Button size="sm" onClick={() => onStatusChange(feedback.id, "incorporated")}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Incorporate
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onStatusChange(feedback.id, "dismissed")}>
                  Dismiss
                </Button>
              </>
            )}
            {feedback.status === "reviewed" && (
              <>
                <Button size="sm" onClick={() => onStatusChange(feedback.id, "incorporated")}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Incorporate
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onStatusChange(feedback.id, "dismissed")}>
                  Dismiss
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// AI Coach Q&A Component
type ConversationMessage = 
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "action_card"; actionId: number; actionType: string; summary: string; contactName: string; status: "pending" | "confirmed" | "cancelled" | "executed" | "failed"; result?: string; payload?: any };

const ACTION_TYPE_LABELS: Record<string, string> = {
  add_note_contact: "Add Note to Contact",
  add_note_opportunity: "Add Note to Opportunity",
  change_pipeline_stage: "Change Pipeline Stage",
  send_sms: "Send SMS",
  create_task: "Create Task",
  add_tag: "Add Tag",
  remove_tag: "Remove Tag",
  update_field: "Update Field",
};

const ACTION_ICONS: Record<string, string> = {
  add_note_contact: "📝",
  add_note_opportunity: "📝",
  change_pipeline_stage: "🔄",
  send_sms: "💬",
  create_task: "✅",
  add_tag: "🏷️",
  remove_tag: "🏷️",
  update_field: "✏️",
};

function AICoachQA() {
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [contactSearchResults, setContactSearchResults] = useState<Array<{id: string; name: string; phone?: string; email?: string}>>([]);
  const [pendingAction, setPendingAction] = useState<{intent: any; message: string} | null>(null);
  // Track which action card is being edited and its edited content
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [editedContent, setEditedContent] = useState("");
  
  const askCoachMutation = trpc.coach.askQuestion.useMutation({
    onSuccess: (response) => {
      setConversation(prev => [...prev, { role: "assistant", content: response.answer }]);
      setIsAsking(false);
    },
    onError: (error) => {
      toast.error("Failed to get answer: " + error.message);
      setIsAsking(false);
    },
  });

  const parseIntentMutation = trpc.coachActions.parseIntent.useMutation();
  const searchContactsMutation = trpc.coachActions.searchContacts.useMutation();
  const createPendingMutation = trpc.coachActions.createPending.useMutation();
  const confirmExecuteMutation = trpc.coachActions.confirmAndExecute.useMutation();
  const cancelActionMutation = trpc.coachActions.cancel.useMutation();

  const handleAsk = async () => {
    if (!question.trim()) return;
    const userMessage = question.trim();
    setConversation(prev => [...prev, { role: "user", content: userMessage }]);
    setIsAsking(true);
    setQuestion("");

    try {
      // First, parse the intent to see if it's an action command
      const intent = await parseIntentMutation.mutateAsync({ message: userMessage });
      
      if (intent.actionType !== "none") {
        // It's an action command!
        if (intent.needsContactSearch && intent.contactName) {
          // Need to search for the contact first
          const contacts = await searchContactsMutation.mutateAsync({ query: intent.contactName });
          if (contacts.length === 0) {
            setConversation(prev => [...prev, { role: "assistant", content: `I couldn't find a contact named "${intent.contactName}" in GHL. Please check the name and try again.` }]);
            setIsAsking(false);
            return;
          } else if (contacts.length === 1) {
            // Auto-select the only match
            intent.contactId = contacts[0].id;
            intent.contactName = contacts[0].name || intent.contactName;
            await createActionCard(intent, userMessage);
          } else {
            // Multiple matches — show selection
            setContactSearchResults(contacts.map(c => ({ id: c.id, name: c.name || "Unknown", phone: c.phone || undefined, email: c.email || undefined })));
            setPendingAction({ intent, message: userMessage });
            setConversation(prev => [...prev, { role: "assistant", content: `I found ${contacts.length} contacts matching "${intent.contactName}". Please select the right one:` }]);
            setIsAsking(false);
            return;
          }
        } else {
          await createActionCard(intent, userMessage);
        }
      } else {
        // Regular coaching question
        askCoachMutation.mutate({ question: userMessage });
        return; // Don't setIsAsking(false) here, the mutation callback handles it
      }
    } catch (error: any) {
      toast.error("Failed to process: " + error.message);
    }
    setIsAsking(false);
  };

  const createActionCard = async (intent: any, userMessage: string) => {
    try {
      const result = await createPendingMutation.mutateAsync({
        actionType: intent.actionType,
        requestText: userMessage,
        targetContactId: intent.contactId || undefined,
        targetContactName: intent.contactName || undefined,
        payload: intent.params,
      });

      setConversation(prev => [...prev, {
        role: "action_card",
        actionId: result.actionId,
        actionType: intent.actionType,
        summary: intent.summary,
        contactName: intent.contactName || "",
        status: "pending",
        payload: intent.params,
      }]);
    } catch (error: any) {
      setConversation(prev => [...prev, { role: "assistant", content: `Failed to create action: ${error.message}` }]);
    }
  };

  const handleSelectContact = async (contactId: string, contactName: string) => {
    if (!pendingAction) return;
    setContactSearchResults([]);
    setIsAsking(true);
    const intent = { ...pendingAction.intent, contactId, contactName };
    await createActionCard(intent, pendingAction.message);
    setPendingAction(null);
    setIsAsking(false);
  };

  // Get the editable content field from a payload based on action type
  const getEditableContent = (actionType: string, payload: any): string => {
    if (!payload) return "";
    switch (actionType) {
      case "send_sms": return payload.message || "";
      case "add_note_contact":
      case "add_note_opportunity": return payload.noteBody || "";
      case "create_task": return payload.title || "";
      default: return "";
    }
  };

  // Check if an action type has editable content
  const isEditableAction = (actionType: string): boolean => {
    return ["send_sms", "add_note_contact", "add_note_opportunity", "create_task"].includes(actionType);
  };

  // Start editing an action card
  const handleStartEdit = (actionId: number, actionType: string, payload: any) => {
    setEditingActionId(actionId);
    setEditedContent(getEditableContent(actionType, payload));
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingActionId(null);
    setEditedContent("");
  };

  // Build edited payload from the edited content
  const buildEditedPayload = (actionType: string, originalPayload: any, newContent: string): any => {
    const edited = { ...originalPayload };
    switch (actionType) {
      case "send_sms": edited.message = newContent; break;
      case "add_note_contact":
      case "add_note_opportunity": edited.noteBody = newContent; break;
      case "create_task": edited.title = newContent; break;
    }
    return edited;
  };

  const handleConfirmAction = async (actionId: number) => {
    // Find the action card to check if it was edited
    const actionCard = conversation.find(
      (msg): msg is Extract<ConversationMessage, { role: "action_card" }> =>
        msg.role === "action_card" && msg.actionId === actionId
    );

    let editedPayload: any = undefined;
    if (editingActionId === actionId && actionCard) {
      const originalContent = getEditableContent(actionCard.actionType, actionCard.payload);
      if (editedContent !== originalContent) {
        editedPayload = buildEditedPayload(actionCard.actionType, actionCard.payload, editedContent);
      }
    }

    // Clear editing state
    setEditingActionId(null);
    setEditedContent("");

    // Update card status to confirmed (and update summary if edited)
    setConversation(prev => prev.map(msg => 
      msg.role === "action_card" && msg.actionId === actionId 
        ? { 
            ...msg, 
            status: "confirmed" as const,
            ...(editedPayload ? { payload: editedPayload, summary: `${msg.summary} (edited)` } : {})
          }
        : msg
    ));

    try {
      const result = await confirmExecuteMutation.mutateAsync({ actionId, editedPayload });
      setConversation(prev => prev.map(msg => 
        msg.role === "action_card" && msg.actionId === actionId 
          ? { ...msg, status: result.success ? "executed" as const : "failed" as const, result: result.success ? "Action completed successfully!" : (result.error || "Action failed") }
          : msg
      ));
      if (result.success) {
        toast.success("Action executed successfully!");
      } else {
        toast.error(result.error || "Action failed");
      }
    } catch (error: any) {
      setConversation(prev => prev.map(msg => 
        msg.role === "action_card" && msg.actionId === actionId 
          ? { ...msg, status: "failed" as const, result: error.message }
          : msg
      ));
      toast.error("Failed to execute: " + error.message);
    }
  };

  const handleCancelAction = async (actionId: number) => {
    try {
      await cancelActionMutation.mutateAsync({ actionId });
      setConversation(prev => prev.map(msg => 
        msg.role === "action_card" && msg.actionId === actionId 
          ? { ...msg, status: "cancelled" as const }
          : msg
      ));
    } catch (error: any) {
      toast.error("Failed to cancel: " + error.message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const clearConversation = () => {
    setConversation([]);
    setContactSearchResults([]);
    setPendingAction(null);
  };

  return (
    <Card className="h-[650px] flex flex-col border-2 overflow-hidden">
      <CardHeader className="pb-2 flex-shrink-0 px-3 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            AI Coach
          </CardTitle>
          {conversation.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearConversation} className="h-7 text-xs">
              Clear
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Ask questions or give CRM commands</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden px-3 pb-3 pt-0">
        <div className="flex-1 overflow-y-auto">
          {conversation.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                Ask questions or take actions
              </p>
              <div className="flex flex-col gap-1.5 w-full">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-1">Coaching</p>
                {[
                  "How do I handle price objections?",
                  "Tips for building rapport quickly",
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuestion(prompt);
                      setConversation([{ role: "user", content: prompt }]);
                      setIsAsking(true);
                      askCoachMutation.mutate({ question: prompt });
                    }}
                    className="text-xs text-left px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-2">Actions</p>
                {[
                  'Add note to John Smith: "Called back, interested"',
                  "Create task: Follow up with seller tomorrow",
                  'Send SMS to Jane Doe: "Are you still interested in selling?"',
                ].map((prompt, i) => (
                  <button
                    key={`action-${i}`}
                    onClick={() => {
                      setQuestion(prompt);
                    }}
                    className="text-xs text-left px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    ⚡ {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {conversation.map((msg, i) => {
                if (msg.role === "action_card") {
                  const statusColors = {
                    pending: "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20",
                    confirmed: "border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20",
                    executed: "border-green-500/50 bg-green-50/50 dark:bg-green-950/20",
                    cancelled: "border-gray-400/50 bg-gray-50/50 dark:bg-gray-800/20 opacity-60",
                    failed: "border-red-500/50 bg-red-50/50 dark:bg-red-950/20",
                  };
                  const statusIcons = {
                    pending: "⏳",
                    confirmed: "🔄",
                    executed: "✅",
                    cancelled: "❌",
                    failed: "⚠️",
                  };
                  return (
                    <div key={i} className={`rounded-xl border-2 p-3 ${statusColors[msg.status]}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{ACTION_ICONS[msg.actionType] || "⚡"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">
                              {ACTION_TYPE_LABELS[msg.actionType] || msg.actionType}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {statusIcons[msg.status]} {msg.status}
                            </span>
                          </div>
                          {msg.contactName && (
                            <p className="text-xs text-muted-foreground mt-0.5">Contact: {msg.contactName}</p>
                          )}
                          {/* Show editable content or summary */}
                          {msg.status === "pending" && editingActionId === msg.actionId ? (
                            <div className="mt-1">
                              <Textarea
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                className="text-sm min-h-[60px] resize-none"
                                autoFocus
                              />
                              <p className="text-[10px] text-muted-foreground mt-1">Edit the content above, then confirm or cancel</p>
                            </div>
                          ) : (
                            <p className="text-sm mt-1">{msg.summary}</p>
                          )}
                          {msg.result && (
                            <p className={`text-xs mt-1 ${msg.status === "executed" ? "text-green-600" : "text-red-600"}`}>
                              {msg.result}
                            </p>
                          )}
                          {msg.status === "pending" && (
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleConfirmAction(msg.actionId)}
                                disabled={confirmExecuteMutation.isPending}
                              >
                                {confirmExecuteMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                )}
                                {editingActionId === msg.actionId ? "Confirm Edit" : "Confirm"}
                              </Button>
                              {editingActionId === msg.actionId ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={handleCancelEdit}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Cancel Edit
                                </Button>
                              ) : (
                                <>
                                  {isEditableAction(msg.actionType) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => handleStartEdit(msg.actionId, msg.actionType, msg.payload)}
                                    >
                                      <Pencil className="h-3 w-3 mr-1" />
                                      Edit
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleCancelAction(msg.actionId)}
                                    disabled={cancelActionMutation.isPending}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Cancel
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1">
                        <Bot className="h-3 w-3 text-primary" />
                      </div>
                    )}
                    <div className={`rounded-xl px-3 py-2 ${
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground max-w-[80%]" 
                        : "bg-muted/60 flex-1"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert">
                          <Streamdown>{msg.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="text-sm">{msg.content}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Contact search results */}
              {contactSearchResults.length > 0 && (
                <div className="space-y-1">
                  {contactSearchResults.slice(0, 5).map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => handleSelectContact(contact.id, contact.name)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="font-medium">{contact.name}</span>
                      {contact.phone && <span className="text-muted-foreground ml-2 text-xs">{contact.phone}</span>}
                      {contact.email && <span className="text-muted-foreground ml-2 text-xs">{contact.email}</span>}
                    </button>
                  ))}
                </div>
              )}

              {isAsking && (
                <div className="flex justify-start">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="bg-muted/60 rounded-xl px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex gap-2 mt-2 pt-2 border-t flex-shrink-0">
          <Textarea
            placeholder="Ask a question or give a command..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-[60px] resize-none text-sm flex-1"
            disabled={isAsking}
          />
          <Button 
            onClick={handleAsk} 
            disabled={!question.trim() || isAsking}
            size="sm"
            className="self-end h-[40px] w-[40px] p-0 flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Manual Upload Dialog Component
function ManualUploadDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [selectedCallType, setSelectedCallType] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  const { data: teamMembers } = trpc.team.list.useQuery();
  const uploadMutation = trpc.calls.uploadManual.useMutation({
    onSuccess: () => {
      toast.success("Call uploaded successfully! Processing will begin shortly.");
      setOpen(false);
      resetForm();
      onSuccess();
    },
    onError: (error) => {
      toast.error("Failed to upload call: " + error.message);
      setIsUploading(false);
    },
  });

  const resetForm = () => {
    setAudioFile(null);
    setContactName("");
    setContactPhone("");
    setPropertyAddress("");
    setSelectedCallType("");
    setIsUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/webm", "audio/ogg"];
    const validExtensions = [".mp3", ".wav", ".m4a", ".webm", ".ogg"];
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      toast.error("Please upload an audio file (MP3, WAV, M4A, WebM, or OGG)");
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      toast.error("File size must be less than 16MB");
      return;
    }

    setAudioFile(file);
  };

  const handleSubmit = async () => {
    if (!audioFile) {
      toast.error("Please select an audio file");
      return;
    }
    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          audioData: base64,
          audioType: audioFile.type || "audio/mpeg",
          fileName: audioFile.name,
          contactName: contactName || undefined,
          contactPhone: contactPhone || undefined,
          propertyAddress: propertyAddress || undefined,
        });
      };
      reader.onerror = () => {
        toast.error("Failed to read audio file");
        setIsUploading(false);
      };
      reader.readAsDataURL(audioFile);
    } catch (error) {
      toast.error("Failed to process audio file");
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Upload Call
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Call Recording</DialogTitle>
          <DialogDescription>
            Upload a call recording to transcribe and grade. Supports MP3, WAV, M4A, WebM, and OGG files.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Audio File Upload */}
          <div className="space-y-2">
            <Label>Audio File *</Label>
            <div className="border-2 border-dashed rounded-lg p-4 hover:border-primary/50 transition-colors">
              {audioFile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileAudio className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">{audioFile.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setAudioFile(null)}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload audio file</span>
                  <span className="text-xs text-muted-foreground mt-1">Max 16MB</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".mp3,.wav,.m4a,.webm,.ogg,audio/*"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Team member is automatically set from logged-in user */}

          {/* Optional Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input
                placeholder="John Smith"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                placeholder="(555) 123-4567"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Property Address</Label>
            <Input
              placeholder="123 Main St, Nashville, TN"
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Call Type <span className="text-xs text-muted-foreground">(optional — AI will auto-detect if not set)</span></Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedCallType}
              onChange={(e) => setSelectedCallType(e.target.value)}
            >
              <option value="">Auto-detect from transcript</option>
              <option value="cold_call">Cold Call</option>
              <option value="qualification">Qualification</option>
              <option value="follow_up">Follow-Up</option>
              <option value="offer">Offer</option>
              <option value="seller_callback">Seller Callback</option>
              <option value="admin_callback">Admin Callback</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isUploading || !audioFile}>
            {isUploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />Upload & Process</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// BatchDialer Sync Button Component
function BatchDialerSyncButton({ onSyncComplete }: { onSyncComplete: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.teamRole === 'admin';

  const syncMutation = trpc.calls.syncBatchDialer.useMutation({
    onSuccess: (stats) => {
      if (stats.imported === 0 && stats.skipped === 0 && stats.errors === 0) {
        toast.info("No new calls found from BatchDialer");
      } else {
        toast.success(
          `BatchDialer sync complete! Imported: ${stats.imported}, Skipped: ${stats.skipped}${stats.errors > 0 ? `, Errors: ${stats.errors}` : ""}`
        );
      }
      onSyncComplete();
    },
    onError: (error) => {
      toast.error(`BatchDialer sync failed: ${error.message}`);
    },
  });

  // Only show for admin users
  if (!isAdmin) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => syncMutation.mutate()}
      disabled={syncMutation.isPending}
      className="h-8 sm:h-9"
    >
      {syncMutation.isPending ? (
        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Syncing...</>
      ) : (
        <><Cloud className="h-4 w-4 mr-2" />Sync BatchDialer</>
      )}
    </Button>
  );
}

// GHL Sync Status Component
function GHLSyncStatus({ onSyncComplete }: { onSyncComplete: () => void }) {
  const { data: status, refetch: refetchStatus } = trpc.ghlSync.status.useQuery();
  const syncNowMutation = trpc.ghlSync.syncNow.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Synced ${result.synced} calls from GoHighLevel`);
        onSyncComplete();
      } else {
        toast.error("Sync failed: " + result.errors.join(", "));
      }
      refetchStatus();
    },
    onError: (error) => {
      toast.error("Sync failed: " + error.message);
    },
  });

  const lastSyncText = status?.lastPollTime 
    ? formatDistanceToNow(new Date(status.lastPollTime), { addSuffix: true })
    : null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => syncNowMutation.mutate()}
      disabled={syncNowMutation.isPending || status?.isPolling}
      title={lastSyncText ? `Last synced ${lastSyncText}` : undefined}
    >
      {syncNowMutation.isPending || status?.isPolling ? (
        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Syncing...</>
      ) : (
        <><Cloud className="h-4 w-4 mr-2" />Sync from GHL{lastSyncText && <span className="ml-1 text-muted-foreground font-normal">({lastSyncText})</span>}</>
      )}
    </Button>
  );
}

// Multi-select filter component
function MultiSelectFilter({ 
  label, 
  options, 
  selected, 
  onChange,
  icon: Icon
}: { 
  label: string; 
  options: { value: string; label: string }[]; 
  selected: string[]; 
  onChange: (values: string[]) => void;
  icon?: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  
  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const clearAll = () => {
    onChange([]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          {Icon && <Icon className="h-3.5 w-3.5 mr-2" />}
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-2 rounded-sm px-1 font-normal">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 ml-2 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-2">
          {options.map((option) => (
            <div
              key={option.value}
              className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
              onClick={() => toggleOption(option.value)}
            >
              <Checkbox
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggleOption(option.value)}
              />
              <span className="text-sm">{option.label}</span>
            </div>
          ))}
          {selected.length > 0 && (
            <div className="border-t pt-2 mt-2">
              <Button variant="ghost" size="sm" className="w-full justify-center" onClick={clearAll}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const PAGE_SIZE = 25;

export default function CallInbox() {
  const { user } = useAuth();
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  // Parse initial filter state from URL query params
  const initialParams = useMemo(() => {
    const sp = new URLSearchParams(searchString);
    return {
      tab: sp.get('tab') || 'calls',
      page: parseInt(sp.get('page') || '0', 10),
      team: sp.get('team') ? sp.get('team')!.split(',') : [],
      types: sp.get('types') ? sp.get('types')!.split(',') : [],
      outcomes: sp.get('outcomes') ? sp.get('outcomes')!.split(',') : [],
      scores: sp.get('scores') ? sp.get('scores')!.split(',') : [],
      date: sp.get('date') || '1d',
    };
  }, []); // Only parse once on mount

  const [activeTab, setActiveTab] = useState(initialParams.tab);
  const [page, setPage] = useState(initialParams.page);
  const utils = trpc.useUtils();

  // Filter states
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>(initialParams.team);
  const [selectedCallTypes, setSelectedCallTypes] = useState<string[]>(initialParams.types);
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>(initialParams.outcomes);
  const [selectedScoreRanges, setSelectedScoreRanges] = useState<string[]>(initialParams.scores);

  const [dateRange, setDateRange] = useState<string>(initialParams.date);
  const [showFilters, setShowFilters] = useState(
    initialParams.team.length > 0 || initialParams.types.length > 0 || 
    initialParams.outcomes.length > 0 || initialParams.scores.length > 0 || 
    initialParams.date !== '1d'
  );

  // Sync filter state to URL query params (replaceState to avoid polluting history)
  useEffect(() => {
    const sp = new URLSearchParams();
    if (activeTab !== 'calls') sp.set('tab', activeTab);
    if (page > 0) sp.set('page', String(page));
    if (selectedTeamMembers.length > 0) sp.set('team', selectedTeamMembers.join(','));
    if (selectedCallTypes.length > 0) sp.set('types', selectedCallTypes.join(','));
    if (selectedOutcomes.length > 0) sp.set('outcomes', selectedOutcomes.join(','));
    if (selectedScoreRanges.length > 0) sp.set('scores', selectedScoreRanges.join(','));
    if (dateRange !== '1d') sp.set('date', dateRange);
    const qs = sp.toString();
    const newUrl = qs ? `/calls?${qs}` : '/calls';
    window.history.replaceState(null, '', newUrl);
  }, [activeTab, page, selectedTeamMembers, selectedCallTypes, selectedOutcomes, selectedScoreRanges, dateRange]);

  // Compute date range
  const dateFilter = useMemo(() => {
    const now = new Date();
    let startDate: string | undefined;
    if (dateRange === "1d") {
      const d = new Date(now); d.setDate(d.getDate() - 1); startDate = d.toISOString();
    } else if (dateRange === "7d") {
      const d = new Date(now); d.setDate(d.getDate() - 7); startDate = d.toISOString();
    } else if (dateRange === "30d") {
      const d = new Date(now); d.setDate(d.getDate() - 30); startDate = d.toISOString();
    } else if (dateRange === "90d") {
      const d = new Date(now); d.setDate(d.getDate() - 90); startDate = d.toISOString();
    }
    // "all" = no date filter
    return { startDate };
  }, [dateRange]);

  // Build query params for "All Calls" tab (graded calls with server-side filters)
  const queryParams = useMemo(() => ({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    startDate: dateFilter.startDate,
    statuses: ["completed"],
    callTypes: selectedCallTypes.length > 0 ? selectedCallTypes : undefined,
    outcomes: selectedOutcomes.length > 0 ? selectedOutcomes : undefined,
    teamMembers: selectedTeamMembers.length > 0 ? selectedTeamMembers : undefined,
  }), [page, dateFilter, selectedCallTypes, selectedOutcomes, selectedTeamMembers]);
  const { data: callsData, isLoading, refetch, isRefetching } = trpc.calls.withGrades.useQuery(queryParams);
  
  // Separate query for needs review (pending + flagged) and skipped
  const { data: reviewData, refetch: refetchReview } = trpc.calls.withGrades.useQuery({
    limit: 100,
    statuses: ["pending", "transcribing", "grading", "failed"],
  });
  const { data: skippedData, refetch: refetchSkipped } = trpc.calls.withGrades.useQuery({
    limit: 100,
    statuses: ["skipped"],
  });

  const { data: allFeedback, isLoading: feedbackLoading } = trpc.feedback.list.useQuery({ limit: 100 });
  const updateStatusMutation = trpc.feedback.updateStatus.useMutation();
  const reclassifyMutation = trpc.calls.reclassify.useMutation({
    onSuccess: () => {
      toast.success("Call reclassified - grading will begin shortly");
      handleRefresh();
    },
    onError: (error) => {
      toast.error(`Failed to reclassify: ${error.message}`);
    },
  });
  const resetStuckMutation = trpc.calls.resetStuck.useMutation({
    onSuccess: (result) => {
      if (result.resetCount > 0) {
        toast.success(`Reset ${result.resetCount} stuck call(s) - they will be reprocessed`);
      } else {
        toast.info("No stuck calls found");
      }
      handleRefresh();
    },
    onError: (error) => {
      toast.error(`Failed to reset stuck calls: ${error.message}`);
    },
  });

  const handleRefresh = () => {
    refetch();
    refetchReview();
    refetchSkipped();
    utils.feedback.list.invalidate();
  };

  const handleStatusChange = async (id: number, status: "reviewed" | "incorporated" | "dismissed") => {
    await updateStatusMutation.mutateAsync({ id, status });
    utils.feedback.list.invalidate();
  };

  // Paginated graded calls
  const gradedCalls = callsData?.items || [];
  const totalCalls = callsData?.total || 0;
  const totalPages = Math.ceil(totalCalls / PAGE_SIZE);

  // Apply client-side score filter (score isn't in the DB query)
  const filteredGradedCalls = useMemo(() => {
    if (selectedScoreRanges.length === 0) return gradedCalls;
    return gradedCalls.filter((c: any) => {
      const score = parseFloat(c.grade?.overallScore || "0");
      return selectedScoreRanges.some(range => {
        if (range === "high") return score >= 80;
        if (range === "medium") return score >= 60 && score < 80;
        if (range === "low") return score < 60;
        return false;
      });
    });
  }, [gradedCalls, selectedScoreRanges]);

  // Needs Review items: pending/processing + failed + flagged feedback
  const reviewItems = reviewData?.items || [];
  const pendingCalls = reviewItems.filter((c: any) => c.status === "pending" || c.status === "transcribing" || c.status === "grading");
  const failedCalls = reviewItems.filter((c: any) => c.status === "failed");
  const pendingFeedback = allFeedback?.filter(f => f.status === "pending") || [];
  const processedFeedback = allFeedback?.filter(f => f.status !== "pending") || [];
  const needsReviewCount = pendingCalls.length + failedCalls.length + pendingFeedback.length;

  // Skipped calls
  const skippedItems = skippedData?.items || [];
  const skippedCalls = skippedItems.filter((c: any) => 
    c.status === "skipped" || (c.classification && c.classification !== "conversation" && c.classification !== "pending" && c.classification !== "admin_call")
  );

  // Get unique team members from current results for filter options
  const teamMemberOptions = useMemo(() => {
    const members = new Set<string>();
    gradedCalls.forEach((c: any) => {
      if (c.teamMemberName) members.add(c.teamMemberName);
    });
    return Array.from(members).sort().map(name => ({ value: name, label: name }));
  }, [gradedCalls]);

  // Call type options - all 6 types
  const callTypeOptions = [
    { value: "cold_call", label: "Cold Call" },
    { value: "qualification", label: "Qualification" },
    { value: "follow_up", label: "Follow-Up" },
    { value: "offer", label: "Offer" },
    { value: "seller_callback", label: "Seller Callback" },
    { value: "admin_callback", label: "Admin Callback" },
  ];

  // Outcome options
  const outcomeOptions = [
    { value: "interested", label: "Interested" },
    { value: "not_interested", label: "Not Interested" },
    { value: "appointment_set", label: "Appointment Set" },
    { value: "callback_scheduled", label: "Callback Scheduled" },
    { value: "offer_made", label: "Offer Made" },
    { value: "offer_accepted", label: "Offer Accepted" },
    { value: "offer_rejected", label: "Offer Rejected" },
    { value: "left_voicemail", label: "Left Voicemail" },
    { value: "no_answer", label: "No Answer" },
  ];

  // Score range options
  const scoreRangeOptions = [
    { value: "high", label: "High (80%+)" },
    { value: "medium", label: "Medium (60-79%)" },
    { value: "low", label: "Low (Below 60%)" },
  ];


  // Date range options
  const dateRangeOptions = [
    { value: "1d", label: "Today" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" },
    { value: "90d", label: "Last 90 Days" },
    { value: "all", label: "All Time" },
  ];

  // Check if any filters are active
  const hasActiveFilters = selectedTeamMembers.length > 0 || selectedCallTypes.length > 0 || 
    selectedScoreRanges.length > 0 || selectedOutcomes.length > 0;

  const clearAllFilters = () => {
    setSelectedTeamMembers([]);
    setSelectedCallTypes([]);
    setSelectedScoreRanges([]);
    setSelectedOutcomes([]);
    setPage(0);
  };

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string[]) => void) => (values: string[]) => {
    setter(values);
    setPage(0);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Call History</h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">
            Review calls, provide feedback, and get coaching advice
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <GHLSyncStatus onSyncComplete={handleRefresh} />
          <BatchDialerSyncButton onSyncComplete={handleRefresh} />
          <ManualUploadDialog onSuccess={handleRefresh} />
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            disabled={isRefetching}
            className="h-8 sm:h-9"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Main Content - Calls and Feedback */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(0); }}>
            {/* 3 Clean Tabs */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="mb-4 w-max sm:w-auto">
                <TabsTrigger value="calls" className="text-xs sm:text-sm px-3 sm:px-4">
                  <Phone className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  All Calls
                  {totalCalls > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{totalCalls}</Badge>}
                </TabsTrigger>
                {(user?.role === 'admin' || user?.role === 'super_admin') && (
                  <TabsTrigger value="review" className="text-xs sm:text-sm px-3 sm:px-4">
                    <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Needs Review
                    {needsReviewCount > 0 && <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">{needsReviewCount}</Badge>}
                  </TabsTrigger>
                )}
                <TabsTrigger value="skipped" className="text-xs sm:text-sm px-3 sm:px-4">
                  Skipped
                  {skippedCalls.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{skippedCalls.length}</Badge>}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Filters - shown only on calls tab */}
            {activeTab === "calls" && (
              <div className="mb-4">
                {/* Mobile: Collapsible filter button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="sm:hidden w-full justify-between mb-2"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <span className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Filters {hasActiveFilters && `(${selectedTeamMembers.length + selectedCallTypes.length + selectedScoreRanges.length + selectedOutcomes.length})`}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </Button>
                
                {/* Filter content - always visible on desktop, collapsible on mobile */}
                <div className={`${showFilters ? 'block' : 'hidden'} sm:block`}>
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border">
                    {/* Date range selector */}
                    <Select value={dateRange} onValueChange={(v) => { setDateRange(v); setPage(0); }}>
                      <SelectTrigger className="h-8 w-auto min-w-[130px] border-dashed text-sm">
                        <Calendar className="h-3.5 w-3.5 mr-2 opacity-50" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dateRangeOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="hidden sm:block w-px h-6 bg-border" />

                    <MultiSelectFilter
                      label="Team Member"
                      options={teamMemberOptions}
                      selected={selectedTeamMembers}
                      onChange={handleFilterChange(setSelectedTeamMembers)}
                      icon={User}
                    />
                    <MultiSelectFilter
                      label="Call Type"
                      options={callTypeOptions}
                      selected={selectedCallTypes}
                      onChange={handleFilterChange(setSelectedCallTypes)}
                      icon={Phone}
                    />
                    <MultiSelectFilter
                      label="Outcome"
                      options={outcomeOptions}
                      selected={selectedOutcomes}
                      onChange={handleFilterChange(setSelectedOutcomes)}
                      icon={Tag}
                    />
                    <MultiSelectFilter
                      label="Score"
                      options={scoreRangeOptions}
                      selected={selectedScoreRanges}
                      onChange={handleFilterChange(setSelectedScoreRanges)}
                    />

                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-muted-foreground hover:text-foreground"
                        onClick={clearAllFilters}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Clear all
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* === TAB: All Calls (paginated, filtered) === */}
            <TabsContent value="calls" className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredGradedCalls.length > 0 ? (
                <>
                  <div className="space-y-4">
                    {filteredGradedCalls.map((item: any) => (
                      <CallCard key={item.id} call={item} grade={item.grade} />
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCalls)} of {totalCalls} calls
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.max(0, p - 1))}
                          disabled={page === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1">Previous</span>
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={page >= totalPages - 1}
                        >
                          <span className="hidden sm:inline mr-1">Next</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <Phone className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      {hasActiveFilters || dateRange !== "all" ? "No calls match filters" : "No graded calls yet"}
                    </h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      {hasActiveFilters || dateRange !== "all" 
                        ? "Try adjusting your filters or expanding the date range."
                        : "Calls will appear here once they're received and graded."}
                    </p>
                    {(hasActiveFilters || dateRange !== "all") && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => { clearAllFilters(); setDateRange("all"); }}>
                        Clear all filters
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* === TAB: Needs Review (pending + failed + flagged feedback) === */}
            <TabsContent value="review" className="space-y-6">
              {/* Stuck calls warning */}
              {pendingCalls.some((c: any) => 
                (c.status === 'transcribing' || c.status === 'grading') && 
                c.updatedAt && 
                new Date(c.updatedAt) < new Date(Date.now() - 60 * 60 * 1000)
              ) && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm text-amber-800 dark:text-amber-200 flex-1">
                    Some calls have been processing for over an hour and may be stuck.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetStuckMutation.mutate()}
                    disabled={resetStuckMutation.isPending}
                    className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
                  >
                    {resetStuckMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-2" />Reset Stuck Calls</>
                    )}
                  </Button>
                </div>
              )}

              {/* Processing calls */}
              {pendingCalls.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Processing ({pendingCalls.length})</h3>
                  <div className="space-y-3">
                    {pendingCalls.map((item: any) => (
                      <Card key={item.id} className="border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold truncate">
                                  {item.contactName || item.contactPhone || "Unknown Contact"}
                                </h3>
                                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                  {item.status === "pending" ? "Queued" : item.status === "transcribing" ? "Transcribing" : "Grading"}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                {item.teamMemberName && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {item.teamMemberName}
                                  </span>
                                )}
                                {item.duration && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, "0")}
                                  </span>
                                )}
                                {item.createdAt && (
                                  <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                                )}
                              </div>
                            </div>
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed calls */}
              {failedCalls.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Failed ({failedCalls.length})</h3>
                  <div className="space-y-3">
                    {failedCalls.map((item: any) => (
                      <Card key={item.id} className="border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold truncate">
                                  {item.contactName || item.contactPhone || "Unknown Contact"}
                                </h3>
                                <Badge variant="destructive" className="text-xs">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Failed
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                {item.teamMemberName && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {item.teamMemberName}
                                  </span>
                                )}
                                {item.createdAt && (
                                  <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                                )}
                              </div>
                              {item.classificationReason && (
                                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                                  {item.classificationReason}
                                </p>
                              )}
                            </div>
                            <Link href={`/calls/${item.id}`}>
                              <Button variant="outline" size="sm">
                                View
                                <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending feedback */}
              {pendingFeedback.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Flagged Feedback ({pendingFeedback.length})</h3>
                  <div className="space-y-3">
                    {pendingFeedback.map((feedback: any) => (
                      <FeedbackCard
                        key={feedback.id}
                        feedback={feedback}
                        onStatusChange={handleStatusChange}
                        showActions
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {needsReviewCount === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <CheckCircle className="h-16 w-16 text-green-500/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">All caught up</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      No calls need review right now. Processing calls, failed transcriptions, and flagged feedback will appear here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* === TAB: Skipped === */}
            <TabsContent value="skipped" className="space-y-4">
              {skippedCalls.length > 0 ? (
                <div className="space-y-4">
                  {skippedCalls.map((item: any) => (
                    <Card key={item.id} className="opacity-75">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">
                                {item.contactName || item.contactPhone || "Unknown Contact"}
                              </h3>
                              <Badge variant="outline" className="text-xs capitalize">
                                {item.classification?.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              {item.teamMemberName && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {item.teamMemberName}
                                </span>
                              )}
                              {item.duration && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, "0")}
                                </span>
                              )}
                            </div>
                            {item.classificationReason && (
                              <p className="text-sm text-muted-foreground mt-2 italic">
                                {item.classificationReason}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status="skipped" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                reclassifyMutation.mutate({ 
                                  callId: item.id, 
                                  classification: "conversation",
                                  reason: "Manually reclassified for grading"
                                });
                              }}
                              disabled={reclassifyMutation.isPending}
                            >
                              {reclassifyMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                              <span className="ml-1">Grade This Call</span>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <CheckCircle className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No skipped calls</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      Voicemails, no-answers, and brief callbacks will appear here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* AI Coach Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <AICoachQA />
          </div>
        </div>
      </div>
    </div>
  );
}
