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
  Pencil,
  ClipboardList,
  MoreVertical,
  Users
} from "lucide-react";
import { Link, useSearch, useLocation, useRoute } from "wouter";
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
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useDemo } from "@/hooks/useDemo";
import { Streamdown } from "streamdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
  seller_callback: { label: "Admin", color: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800" },
  admin_callback: { label: "Admin", color: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800" },
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
  const gradeVal = grade?.overallGrade?.toUpperCase() || "";
  const scoreVal = grade?.overallScore ? Math.round(parseFloat(grade.overallScore)) : null;
  
  // Map call type to pill class
  const pillClassMap: Record<string, string> = {
    cold_call: "call-pill-cold-call",
    qualification: "call-pill-qualification",
    follow_up: "call-pill-follow-up",
    offer: "call-pill-offer",
    seller_callback: "call-pill-other",
    admin_callback: "call-pill-other",
  };
  const outcomePillMap: Record<string, string> = {
    interested: "call-pill-interested",
    not_interested: "call-pill-not-interested",
    appointment_set: "call-pill-appointment",
    callback_scheduled: "call-pill-follow-up",
    offer_made: "call-pill-offer",
    offer_accepted: "call-pill-interested",
    offer_rejected: "call-pill-not-interested",
    left_voicemail: "call-pill-other",
    no_answer: "call-pill-other",
    wrong_number: "call-pill-not-interested",
    do_not_call: "call-pill-do-not-call",
    other: "call-pill-other",
  };

  return (
    <Link href={`/calls/${call.id}`}>
      <div className="call-card-obsidian">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Name + pills row */}
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="call-name">
                {call.contactName || call.contactPhone || "Unknown Contact"}
              </span>
              {/* Direction pill */}
              {call.callDirection === "inbound" ? (
                <span className="call-pill call-pill-inbound">
                  <PhoneIncoming className="h-3 w-3" />
                  Inbound
                </span>
              ) : (
                <span className="call-pill call-pill-outbound">
                  <PhoneOutgoing className="h-3 w-3" />
                  Outbound
                </span>
              )}
              {/* Call type pill */}
              <span className={`call-pill ${pillClassMap[call.callType] || "call-pill-other"}`}>
                {callTypeInfo.label}
              </span>
              {/* Outcome pill */}
              {outcomeInfo && (
                <span className={`call-pill ${outcomePillMap[call.callOutcome] || "call-pill-other"}`}>
                  {outcomeInfo.label}
                </span>
              )}
            </div>
            
            {/* Meta row */}
            <div className="call-meta mt-2">
              {call.teamMemberName && (
                <span className="call-meta-item">
                  <User className="h-3.5 w-3.5" />
                  {call.teamMemberName}
                </span>
              )}
              {call.duration && (
                <span className="call-meta-item">
                  <Clock className="h-3.5 w-3.5" />
                  {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, "0")}
                </span>
              )}
              <span className="call-meta-item">
                <Phone className="h-3.5 w-3.5" />
                {timeAgo}
              </span>
            </div>

            {/* Property address */}
            {call.propertyAddress && (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md" style={{background: 'var(--obs-bg-inset)', border: '1px solid var(--obs-border-subtle)', color: 'var(--obs-text-secondary)'}}>
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[300px]">{call.propertyAddress}</span>
                </span>
              </div>
            )}
          </div>

          {/* Grade circle + score */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            {call.status === "completed" && grade ? (
              <>
                <div className={`call-grade-circle grade-${gradeVal.toLowerCase()}`}>
                  {gradeVal}
                </div>
                {scoreVal !== null && (
                  <span className="call-card-score">{scoreVal}%</span>
                )}
              </>
            ) : (
              <StatusBadge status={call.status} />
            )}
          </div>
        </div>

        {/* Divider + summary */}
        {grade?.summary && (
          <>
            <div className="call-card-divider" />
            <p className="call-card-summary">{grade.summary}</p>
          </>
        )}
      </div>
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
  | { role: "action_card"; actionId: number; actionType: string; summary: string; contactName: string; status: "pending" | "confirmed" | "cancelled" | "executed" | "failed"; result?: string; payload?: any; batchIndex?: number; batchTotal?: number; resolvedStage?: { pipelineName: string; stageName: string }; smsDeliveryStatus?: string; smsFromNumber?: string };

const ACTION_TYPE_LABELS: Record<string, string> = {
  add_note: "Add Note",
  add_note_contact: "Add Note",
  add_note_opportunity: "Add Note",
  change_pipeline_stage: "Change Pipeline Stage",
  send_sms: "Send SMS",
  create_task: "Create Task",
  add_tag: "Add Tag",
  remove_tag: "Remove Tag",
  update_field: "Update Field",
  update_task: "Update Task",
  add_to_workflow: "Add to Workflow",
  remove_from_workflow: "Remove from Workflow",
  create_appointment: "Create Appointment",
  update_appointment: "Update Appointment",
  cancel_appointment: "Cancel Appointment",
};

const ACTION_ICONS: Record<string, string> = {
  add_note: "📝",
  add_note_contact: "📝",
  add_note_opportunity: "📝",
  change_pipeline_stage: "🔄",
  send_sms: "💬",
  create_task: "✅",
  add_tag: "🏷️",
  remove_tag: "🏷️",
  update_field: "✏️",
  update_task: "🔄",
  add_to_workflow: "⚡",
  remove_from_workflow: "🚫",
  create_appointment: "📅",
  update_appointment: "🔄",
  cancel_appointment: "❌",
};

function AICoachQA() {
  const { user: currentUser } = useAuth();
  const { guardAction: guardDemoAction, isDemo } = useDemo();
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [contactSearchResults, setContactSearchResults] = useState<Array<{id: string; name: string; phone?: string; email?: string}>>([]);
  const [pendingAction, setPendingAction] = useState<{intent: any; message: string; remainingActions?: any[]; batchIndex?: number; batchTotal?: number} | null>(null);
  // Track which action card is being edited and its edited content
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [editedContent, setEditedContent] = useState("");
  // Sender override for SMS actions: maps actionId -> { ghlUserId, name }
  const [senderOverrides, setSenderOverrides] = useState<Record<number, { ghlUserId: string; name: string } | null>>({});
  // Fetch team members who can send SMS (have CRM user IDs)
  const { data: smsTeamSenders } = trpc.coachActions.smsTeamSenders.useQuery();
  
  // Fire-and-forget mutation to persist exchanges for conversation memory
  const saveExchangeMutation = trpc.coach.saveExchange.useMutation();

  // Track the last user message for ACTION_REDIRECT re-routing in non-streaming fallback
  const lastUserMessageRef = useRef<string>("");

  const askCoachMutation = trpc.coach.askQuestion.useMutation({
    onSuccess: async (response) => {
      // Check if the non-streaming response contains ACTION_REDIRECT
      if (response.answer.includes("[ACTION_REDIRECT]")) {
        setConversation(prev => [...prev, { role: "assistant", content: "On it \u2014 creating that for you now..." }]);
        try {
          // Build conversation history for follow-up context
          const historyForRedirect = conversation
            .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
              msg.role === "user" || msg.role === "assistant"
            )
            .slice(-10)
            .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
          const result = await parseIntentMutation.mutateAsync({ message: lastUserMessageRef.current, history: historyForRedirect });
          // Handle instruction/preference saved
          if ((result as any).instructionSaved) {
            setConversation(prev => [...prev, { role: "assistant", content: (result as any).instructionConfirmation || "Got it — I'll remember that preference!" }]);
            setIsAsking(false);
            return;
          }
          const actions = (result.actions || []).filter((a: any) => a && typeof a.actionType === "string" && a.actionType.trim() !== "");
          if (actions.length > 0) {
            const resolvedContacts: Record<string, { id: string; name: string }> = {};
            const batchTotal = actions.length;
            for (let i = 0; i < actions.length; i++) {
              const action = actions[i];
              const batchIndex = i + 1;
              if (action.needsContactSearch && action.contactName) {
                const cached = resolvedContacts[action.contactName.toLowerCase()];
                if (cached) {
                  action.contactId = cached.id;
                  action.contactName = cached.name;
                  await createActionCard(action, lastUserMessageRef.current, batchIndex, batchTotal);
                } else {
                  const contacts = await searchContactsMutation.mutateAsync({ query: action.contactName });
                  if (contacts.length === 1) {
                    action.contactId = contacts[0].id;
                    action.contactName = contacts[0].name || action.contactName;
                    resolvedContacts[action.contactName.toLowerCase()] = { id: contacts[0].id, name: contacts[0].name || action.contactName };
                    await createActionCard(action, lastUserMessageRef.current, batchIndex, batchTotal);
                  } else if (contacts.length > 1) {
                    setContactSearchResults(contacts.map(c => ({ id: c.id, name: c.name || "Unknown", phone: c.phone || undefined, email: c.email || undefined })));
                    setPendingAction({ intent: action, message: lastUserMessageRef.current, remainingActions: actions.slice(i + 1), batchIndex, batchTotal });
                    setConversation(prev => [...prev, { role: "assistant", content: `I found ${contacts.length} contacts matching "${action.contactName}". Please select the right one:` }]);
                    setIsAsking(false);
                    return;
                  }
                }
              } else {
                await createActionCard(action, lastUserMessageRef.current, batchIndex, batchTotal);
              }
            }
          } else {
            // Non-streaming fallback: parseIntent returned empty after ACTION_REDIRECT
            // Show the original Q&A response instead of a generic error
            const cleanAnswer = response.answer.replace(/\[ACTION_REDIRECT\]/g, "").trim();
            if (cleanAnswer) {
              setConversation(prev => [...prev, { role: "assistant", content: cleanAnswer }]);
            }
          }
        } catch (error: any) {
          toast.error("Failed to process action: " + error.message);
        }
        setIsAsking(false);
        return;
      }
      setConversation(prev => [...prev, { role: "assistant", content: response.answer }]);
      setIsAsking(false);
    },
    onError: (error) => {
      toast.error("Failed to get answer: " + error.message);
      setIsAsking(false);
    },
  });

  const streamCoachQuestion = async (userMessage: string, chatHistory: Array<{ role: "user" | "assistant"; content: string }>) => {
    // Add a placeholder assistant message that we'll stream into
    setConversation(prev => [...prev, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/coach/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage, history: chatHistory }),
      });
      if (!response.ok) throw new Error("Stream request failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";
      let actionRedirectDetected = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "chunk" && parsed.content) {
              fullResponse += parsed.content;
              // Check for ACTION_REDIRECT signal in the accumulated response
              if (fullResponse.includes("[ACTION_REDIRECT]")) {
                actionRedirectDetected = true;
                // Cancel the reader — we're going to re-route
                reader.cancel();
                break;
              }
              setConversation(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg && lastMsg.role === "assistant") {
                  updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + parsed.content };
                }
                return updated;
              });
            } else if (parsed.type === "error") {
              toast.error("Coach error: " + parsed.message);
            }
          } catch { /* skip malformed */ }
        }
        if (actionRedirectDetected) break;
      }

      // If ACTION_REDIRECT was detected, re-route through parseIntent
      if (actionRedirectDetected) {
        // Replace the streaming message with a processing indicator
        setConversation(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            updated[updated.length - 1] = { ...lastMsg, content: "On it \u2014 creating that for you now..." };
          }
          return updated;
        });
        try {
          // Build conversation history for follow-up context
          const historyForStreamRedirect = conversation
            .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
              msg.role === "user" || msg.role === "assistant"
            )
            .slice(-10)
            .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
          const result = await parseIntentMutation.mutateAsync({ message: userMessage, history: historyForStreamRedirect });
          // Handle instruction/preference saved
          if ((result as any).instructionSaved) {
            setConversation(prev => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg && lastMsg.role === "assistant") {
                updated[updated.length - 1] = { ...lastMsg, content: (result as any).instructionConfirmation || "Got it \u2014 I'll remember that preference!" };
              }
              return updated;
            });
            setIsAsking(false);
            return;
          }
          const actions = (result.actions || []).filter((a: any) => a && typeof a.actionType === "string" && a.actionType.trim() !== "");
          if (actions.length > 0) {
            if (actions.length > 1) {
              setConversation(prev => [...prev, { role: "assistant", content: `I detected **${actions.length} actions** in your request. Creating each one for your review:` }]);
            }
            const resolvedContacts: Record<string, { id: string; name: string }> = {};
            const batchTotal = actions.length;
            for (let i = 0; i < actions.length; i++) {
              const action = actions[i];
              const batchIndex = i + 1;
              if (action.needsContactSearch && action.contactName) {
                const cached = resolvedContacts[action.contactName.toLowerCase()];
                if (cached) {
                  action.contactId = cached.id;
                  action.contactName = cached.name;
                  await createActionCard(action, userMessage, batchIndex, batchTotal);
                } else {
                  const contacts = await searchContactsMutation.mutateAsync({ query: action.contactName });
                  if (contacts.length === 0) {
                    setConversation(prev => [...prev, { role: "assistant", content: `I couldn't find a contact named "${action.contactName}" in CRM. Skipping action: ${action.summary}` }]);
                    continue;
                  } else if (contacts.length === 1) {
                    action.contactId = contacts[0].id;
                    action.contactName = contacts[0].name || action.contactName;
                    resolvedContacts[action.contactName.toLowerCase()] = { id: contacts[0].id, name: contacts[0].name || action.contactName };
                    await createActionCard(action, userMessage, batchIndex, batchTotal);
                  } else {
                    setContactSearchResults(contacts.map(c => ({ id: c.id, name: c.name || "Unknown", phone: c.phone || undefined, email: c.email || undefined })));
                    setPendingAction({ intent: action, message: userMessage, remainingActions: actions.slice(i + 1), batchIndex, batchTotal });
                    setConversation(prev => [...prev, { role: "assistant", content: `I found ${contacts.length} contacts matching "${action.contactName}". Please select the right one (for action: ${action.summary}):` }]);
                    setIsAsking(false);
                    return;
                  }
                }
              } else {
                await createActionCard(action, userMessage, batchIndex, batchTotal);
              }
            }
          } else {
            // parseIntent returned empty after ACTION_REDIRECT — this was likely a conversational message
            // (feedback, complaint, question about previous action) that was incorrectly flagged as an action.
            // Fall through to the Q&A coach to handle it conversationally.
            const chatHistory = conversation
              .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
                msg.role === "user" || msg.role === "assistant"
              )
              .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
            // Remove the "On it" placeholder and re-stream as a conversational response
            setConversation(prev => {
              const updated = [...prev];
              // Remove the last assistant message (the "On it" placeholder)
              if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
                updated.pop();
              }
              return updated;
            });
            await streamCoachQuestion(userMessage, chatHistory);
            return;
          }
        } catch (error: any) {
          toast.error("Failed to process action: " + error.message);
        }
        setIsAsking(false);
        return;
      }

      // After streaming completes, persist the exchange for conversation memory (fire-and-forget)
      setConversation(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
          saveExchangeMutation.mutate({ question: userMessage, answer: lastMsg.content });
        }
        return prev;
      });
      setIsAsking(false);
    } catch {
      // Fallback to non-streaming — set ref so ACTION_REDIRECT handler can access the message
      lastUserMessageRef.current = userMessage;
      askCoachMutation.mutate({ question: userMessage, history: chatHistory });
    }
  };

  const parseIntentMutation = trpc.coachActions.parseIntent.useMutation();
  const searchContactsMutation = trpc.coachActions.searchContacts.useMutation();
  const createPendingMutation = trpc.coachActions.createPending.useMutation();
  const confirmExecuteMutation = trpc.coachActions.confirmAndExecute.useMutation();
  const cancelActionMutation = trpc.coachActions.cancel.useMutation();
  const coachUtils = trpc.useUtils();

  const handleAsk = async () => {
    if (!question.trim()) return;
    const userMessage = question.trim();
    setConversation(prev => [...prev, { role: "user", content: userMessage }]);
    setIsAsking(true);
    setQuestion("");

    try {
      // Parse the intent — now returns { actions: [...] }
      // Build conversation history for context (filter to user/assistant messages only)
      const historyForIntent = conversation
        .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
          msg.role === "user" || msg.role === "assistant"
        )
        .slice(-10)
        .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
      const result = await parseIntentMutation.mutateAsync({ message: userMessage, history: historyForIntent });
      // Handle instruction/preference saved
      if ((result as any).instructionSaved) {
        setConversation(prev => [...prev, { role: "assistant", content: (result as any).instructionConfirmation || "Got it \u2014 I'll remember that preference!" }]);
        setIsAsking(false);
        return;
      }
      // Filter out any actions with missing or invalid actionType (defensive)
      const actions = (result.actions || []).filter((a: any) => a && typeof a.actionType === "string" && a.actionType.trim() !== "");
      
      if (actions.length > 0) {
        // Show a summary message if multiple actions detected
        if (actions.length > 1) {
          setConversation(prev => [...prev, { role: "assistant", content: `I detected **${actions.length} actions** in your request. Creating each one for your review:` }]);
        }

        // Process each action sequentially
        // We need to resolve contacts for the first action that needs it, then reuse for others with the same name
        const resolvedContacts: Record<string, { id: string; name: string }> = {};

        const batchTotal = actions.length;

        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          const batchIndex = i + 1; // 1-based
          
          if (action.needsContactSearch && action.contactName) {
            // Check if we already resolved this contact name
            const cached = resolvedContacts[action.contactName.toLowerCase()];
            if (cached) {
              action.contactId = cached.id;
              action.contactName = cached.name;
              await createActionCard(action, userMessage, batchIndex, batchTotal);
            } else {
              // Need to search for the contact
              const contacts = await searchContactsMutation.mutateAsync({ query: action.contactName });
              if (contacts.length === 0) {
                setConversation(prev => [...prev, { role: "assistant", content: `I couldn't find a contact named "${action.contactName}" in CRM. Skipping action: ${action.summary}` }]);
                continue;
              } else if (contacts.length === 1) {
                action.contactId = contacts[0].id;
                action.contactName = contacts[0].name || action.contactName;
                resolvedContacts[action.contactName.toLowerCase()] = { id: contacts[0].id, name: contacts[0].name || action.contactName };
                await createActionCard(action, userMessage, batchIndex, batchTotal);
              } else {
                // Multiple matches — pause for user selection, queue remaining actions
                setContactSearchResults(contacts.map(c => ({ id: c.id, name: c.name || "Unknown", phone: c.phone || undefined, email: c.email || undefined })));
                setPendingAction({ intent: action, message: userMessage, remainingActions: actions.slice(i + 1), batchIndex, batchTotal });
                setConversation(prev => [...prev, { role: "assistant", content: `I found ${contacts.length} contacts matching "${action.contactName}". Please select the right one (for action: ${action.summary}):` }]);
                setIsAsking(false);
                return;
              }
            }
          } else {
            await createActionCard(action, userMessage, batchIndex, batchTotal);
          }
        }
      } else {
        // No actions detected — regular coaching question, stream the response
        const chatHistory = conversation
          .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
            msg.role === "user" || msg.role === "assistant"
          )
          .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
        await streamCoachQuestion(userMessage, chatHistory);
        return;
      }
    } catch (error: any) {
      toast.error("Failed to process: " + error.message);
    }
    setIsAsking(false);
  };

  const createActionCard = async (intent: any, userMessage: string, batchIndex?: number, batchTotal?: number) => {
    try {
      if (!intent.actionType || typeof intent.actionType !== "string" || intent.actionType.trim() === "") {
        setConversation(prev => [...prev, { role: "assistant", content: `I couldn't determine the action type for: ${intent.summary || "unknown action"}. Please try rephrasing your request.` }]);
        return;
      }

      // For pipeline stage changes, pre-resolve the stage name for confirmation
      let resolvedStage: { pipelineName: string; stageName: string } | undefined;
      if (intent.actionType === "change_pipeline_stage" && intent.params?.stageName) {
        try {
          const stageResult = await coachUtils.coachActions.resolveStage.fetch({
            stageName: intent.params.stageName,
            pipelineName: intent.params.pipelineName || undefined,
            contactId: intent.contactId || undefined,
          });
          if (stageResult.resolved) {
            resolvedStage = { pipelineName: stageResult.pipelineName!, stageName: stageResult.stageName! };
          }
        } catch (e) {
          // Non-blocking — if resolution fails, card still shows without resolved name
          console.warn("Stage resolution failed:", e);
        }
      }

      const result = await createPendingMutation.mutateAsync({
        actionType: intent.actionType,
        requestText: userMessage,
        targetContactId: intent.contactId || undefined,
        targetContactName: intent.contactName || undefined,
        payload: { ...intent.params, assigneeName: intent.assigneeName || "" },
      });

      setConversation(prev => [...prev, {
        role: "action_card",
        actionId: result.actionId,
        actionType: intent.actionType,
        summary: intent.summary,
        contactName: intent.contactName || "",
        status: "pending",
        payload: { ...intent.params, assigneeName: intent.assigneeName || "" },
        ...(batchTotal && batchTotal > 1 ? { batchIndex, batchTotal } : {}),
        ...(resolvedStage ? { resolvedStage } : {}),
      }]);
    } catch (error: any) {
      // Show a friendly error message instead of raw Zod/tRPC errors
      const msg = error?.message || "Unknown error";
      const isZodError = msg.includes("expected") && msg.includes("received");
      const friendlyMsg = isZodError
        ? "I couldn't process that action. Please try rephrasing your request."
        : msg;
      setConversation(prev => [...prev, { role: "assistant", content: friendlyMsg }]);
    }
  };

  const handleSelectContact = async (contactId: string, contactName: string) => {
    if (!pendingAction) return;
    setContactSearchResults([]);
    setIsAsking(true);
    const intent = { ...pendingAction.intent, contactId, contactName };
    const currentBatchIndex = pendingAction.batchIndex;
    const currentBatchTotal = pendingAction.batchTotal;
    await createActionCard(intent, pendingAction.message, currentBatchIndex, currentBatchTotal);
    
    // Continue processing remaining actions if any
    const remaining = pendingAction.remainingActions || [];
    const userMessage = pendingAction.message;
    setPendingAction(null);
    
    if (remaining.length > 0) {
      // Cache the resolved contact for reuse
      const resolvedContacts: Record<string, { id: string; name: string }> = {
        [contactName.toLowerCase()]: { id: contactId, name: contactName }
      };
      
      for (let i = 0; i < remaining.length; i++) {
        const action = remaining[i];
        // Continue the batch index from where we left off
        const batchIdx = (currentBatchIndex || 0) + 1 + i;
        
        if (action.needsContactSearch && action.contactName) {
          const cached = resolvedContacts[action.contactName.toLowerCase()];
          if (cached) {
            action.contactId = cached.id;
            action.contactName = cached.name;
            await createActionCard(action, userMessage, batchIdx, currentBatchTotal);
          } else {
            const contacts = await searchContactsMutation.mutateAsync({ query: action.contactName });
            if (contacts.length === 0) {
              setConversation(prev => [...prev, { role: "assistant", content: `I couldn't find a contact named "${action.contactName}" in CRM. Skipping action: ${action.summary}` }]);
              continue;
            } else if (contacts.length === 1) {
              action.contactId = contacts[0].id;
              action.contactName = contacts[0].name || action.contactName;
              resolvedContacts[action.contactName.toLowerCase()] = { id: contacts[0].id, name: contacts[0].name || action.contactName };
              await createActionCard(action, userMessage, batchIdx, currentBatchTotal);
            } else {
              setContactSearchResults(contacts.map(c => ({ id: c.id, name: c.name || "Unknown", phone: c.phone || undefined, email: c.email || undefined })));
              setPendingAction({ intent: action, message: userMessage, remainingActions: remaining.slice(i + 1), batchIndex: batchIdx, batchTotal: currentBatchTotal });
              setConversation(prev => [...prev, { role: "assistant", content: `I found ${contacts.length} contacts matching "${action.contactName}". Please select the right one (for action: ${action.summary}):` }]);
              setIsAsking(false);
              return;
            }
          }
        } else {
          await createActionCard(action, userMessage, batchIdx, currentBatchTotal);
        }
      }
    }
    
    setIsAsking(false);
  };

  // Get the editable content field from a payload based on action type
  const getEditableContent = (actionType: string, payload: any): string => {
    if (!payload) return "";
    switch (actionType) {
      case "send_sms": return payload.message || "";
      case "add_note":
      case "add_note_contact":
      case "add_note_opportunity": return payload.noteBody || "";
      case "create_task": return payload.title || "";
      default: return "";
    }
  };

  // Check if an action type has editable content
  const isEditableAction = (actionType: string): boolean => {
    return ["send_sms", "add_note", "add_note_contact", "add_note_opportunity", "create_task"].includes(actionType);
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
      case "add_note":
      case "add_note_contact":
      case "add_note_opportunity": edited.noteBody = newContent; break;
      case "create_task": edited.title = newContent; break;
    }
    return edited;
  };

  const handleConfirmAction = async (actionId: number) => {
    if (guardDemoAction("CRM actions")) return;
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

    // If there's a sender override for this SMS action, inject it into the payload
    if (actionCard?.actionType === "send_sms" && senderOverrides[actionId]) {
      const override = senderOverrides[actionId];
      editedPayload = {
        ...(editedPayload || actionCard.payload || {}),
        senderOverrideGhlId: override.ghlUserId,
        senderOverrideName: override.name,
      };
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
          ? { ...msg, status: result.success ? "executed" as const : "failed" as const, result: result.success ? "Action completed successfully!" : (result.error || "Action failed"), ...(result.smsFromNumber ? { smsFromNumber: result.smsFromNumber } : {}) }
          : msg
      ));
      if (result.success) {
        toast.success("Action executed successfully!");
        // For SMS actions, poll delivery status after a short delay
        if (actionCard?.actionType === "send_sms") {
          // Set initial status as "sent"
          setConversation(prev => prev.map(msg =>
            msg.role === "action_card" && msg.actionId === actionId
              ? { ...msg, smsDeliveryStatus: "sent" }
              : msg
          ));
          // Poll for delivery status after 3 seconds
          setTimeout(async () => {
            try {
              const statusResult = await coachUtils.coachActions.smsDeliveryStatus.fetch({ actionId });
              if (statusResult.found && statusResult.status) {
                setConversation(prev => prev.map(msg =>
                  msg.role === "action_card" && msg.actionId === actionId
                    ? { ...msg, smsDeliveryStatus: statusResult.status }
                    : msg
                ));
              }
            } catch { /* non-critical */ }
          }, 3000);
          // Poll again after 8 seconds for final status
          setTimeout(async () => {
            try {
              const statusResult = await coachUtils.coachActions.smsDeliveryStatus.fetch({ actionId });
              if (statusResult.found && statusResult.status) {
                setConversation(prev => prev.map(msg =>
                  msg.role === "action_card" && msg.actionId === actionId
                    ? { ...msg, smsDeliveryStatus: statusResult.status }
                    : msg
                ));
              }
            } catch { /* non-critical */ }
          }, 8000);
        }
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
    if (guardDemoAction("CRM actions")) return;
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
        <p className="text-[10px] text-muted-foreground mt-0.5">{currentUser?.teamRole === 'lead_generator' ? 'Cold calling tips, lead notes & CRM commands' : 'Ask questions or give CRM commands'}</p>
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
                {(currentUser?.teamRole === 'lead_generator' ? [
                  "Best opening lines for cold calls?",
                  "How to identify a motivated seller?",
                ] : [
                  "How do I handle price objections?",
                  "Tips for building rapport quickly",
                ]).map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuestion(prompt);
                      setConversation([{ role: "user", content: prompt }]);
                      setIsAsking(true);
                      streamCoachQuestion(prompt, []);
                    }}
                    className="text-xs text-left px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-2">Actions</p>
                {(currentUser?.teamRole === 'lead_generator' ? [
                  'Add note to John Smith: "Interested in selling, motivated"',
                  'Create task: Follow up with interested seller tomorrow',
                  'Add note to Jane Doe: "Not interested, remove from list"',
                ] : [
                  'Add note to John Smith: "Called back, interested"',
                  "Create task: Follow up with seller tomorrow",
                  'Send SMS to Jane Doe: "Are you still interested in selling?"',
                ]).map((prompt, i) => (
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
                            {msg.batchTotal && msg.batchTotal > 1 && msg.batchIndex && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                {msg.batchIndex} of {msg.batchTotal}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {statusIcons[msg.status]} {msg.status}
                            </span>
                          </div>
                          {msg.contactName && (
                            <p className="text-xs text-muted-foreground mt-0.5">Contact: {msg.contactName}</p>
                          )}
                          {/* Show sender info for SMS with override dropdown */}
                          {msg.actionType === "send_sms" && msg.status === "pending" && currentUser?.name && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] text-blue-600 dark:text-blue-400">📤 Sending from:</span>
                              {smsTeamSenders && smsTeamSenders.length > 1 ? (
                                <Select
                                  value={senderOverrides[msg.actionId]?.ghlUserId || "default"}
                                  onValueChange={(val) => {
                                    if (val === "default") {
                                      setSenderOverrides(prev => ({ ...prev, [msg.actionId]: null }));
                                    } else {
                                      const sender = smsTeamSenders.find(s => s.ghlUserId === val);
                                      if (sender) {
                                        setSenderOverrides(prev => ({ ...prev, [msg.actionId]: { ghlUserId: sender.ghlUserId, name: sender.name } }));
                                      }
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-5 text-[10px] w-auto min-w-[140px] max-w-[220px] px-1.5 py-0 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30">
                                    <SelectValue placeholder={`${currentUser.name}'s line`} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="default">
                                      {currentUser.name}'s line{(() => { const me = smsTeamSenders.find(s => s.name === currentUser.name); return me?.lcPhone ? ` (${me.lcPhone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')})` : ''; })()}
                                    </SelectItem>
                                    {smsTeamSenders.filter(s => s.name !== currentUser.name).map(sender => (
                                      <SelectItem key={sender.ghlUserId} value={sender.ghlUserId}>
                                        {sender.name}'s line{sender.lcPhone ? ` (${sender.lcPhone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')})` : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                  {currentUser.name}'s line{(() => { const me = smsTeamSenders?.find(s => s.name === currentUser.name); return me?.lcPhone ? ` (${me.lcPhone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')})` : ''; })()}
                                </span>
                              )}
                            </div>
                          )}
                          {/* Show sender override info for executed SMS */}
                          {msg.actionType === "send_sms" && msg.status === "executed" && msg.payload?.senderOverrideName && (
                            <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                              ✅ Sent from: {msg.payload.senderOverrideName}'s line{msg.smsFromNumber ? ` (${msg.smsFromNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')})` : ''}
                            </p>
                          )}
                          {msg.actionType === "send_sms" && msg.status === "executed" && !msg.payload?.senderOverrideName && currentUser?.name && (
                            <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                              ✅ Sent from: {currentUser.name}'s line{msg.smsFromNumber ? ` (${msg.smsFromNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')})` : ''}
                            </p>
                          )}
                          {/* SMS Delivery Status Indicator */}
                          {msg.actionType === "send_sms" && msg.status === "executed" && msg.smsDeliveryStatus && (
                            <div className={`flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full w-fit ${
                              msg.smsDeliveryStatus === "delivered" ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400" :
                              msg.smsDeliveryStatus === "sent" ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400" :
                              msg.smsDeliveryStatus === "pending" ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400" :
                              msg.smsDeliveryStatus === "failed" || msg.smsDeliveryStatus === "undelivered" ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400" :
                              "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            }`}>
                              {msg.smsDeliveryStatus === "delivered" && <CheckCircle className="h-2.5 w-2.5" />}
                              {msg.smsDeliveryStatus === "sent" && <Send className="h-2.5 w-2.5" />}
                              {msg.smsDeliveryStatus === "pending" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                              {(msg.smsDeliveryStatus === "failed" || msg.smsDeliveryStatus === "undelivered") && <XCircle className="h-2.5 w-2.5" />}
                              {!(["delivered", "sent", "pending", "failed", "undelivered"].includes(msg.smsDeliveryStatus)) && <MessageSquare className="h-2.5 w-2.5" />}
                              <span className="font-medium capitalize">{msg.smsDeliveryStatus}</span>
                            </div>
                          )}
                          {/* Show workflow name for workflow actions */}
                          {(msg.actionType === "add_to_workflow" || msg.actionType === "remove_from_workflow") && msg.payload?.workflowName && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-md px-2 py-1">
                              <span className="text-purple-600 dark:text-purple-400">{msg.actionType === "add_to_workflow" ? "→" : "←"}</span>
                              <span className="font-medium text-purple-700 dark:text-purple-300">{msg.payload.workflowName}</span>
                            </div>
                          )}
                          {/* Show update_task details */}
                          {msg.actionType === "update_task" && msg.payload && (
                            <div className="mt-1 text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1 space-y-0.5">
                              {msg.payload.title && (
                                <p><span className="text-amber-600 dark:text-amber-400">Task:</span> <span className="font-medium text-amber-700 dark:text-amber-300">{msg.payload.title}</span></p>
                              )}
                              {msg.payload.dueDate && (
                                <p><span className="text-amber-600 dark:text-amber-400">New due date:</span> <span className="font-medium text-amber-700 dark:text-amber-300">{new Date(msg.payload.dueDate).toLocaleDateString()}</span></p>
                              )}
                              {msg.payload.taskStatus && (
                                <p><span className="text-amber-600 dark:text-amber-400">Status:</span> <span className="font-medium text-amber-700 dark:text-amber-300">{msg.payload.taskStatus}</span></p>
                              )}
                            </div>
                          )}
                          {/* Show appointment details */}
                          {msg.actionType === "create_appointment" && msg.payload && (
                            <div className="mt-1 text-xs bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-md px-2 py-1 space-y-0.5">
                              {msg.payload.title && (
                                <p><span className="text-teal-600 dark:text-teal-400">Title:</span> <span className="font-medium text-teal-700 dark:text-teal-300">{msg.payload.title}</span></p>
                              )}
                              {msg.payload.startTime && (
                                <p><span className="text-teal-600 dark:text-teal-400">Date/Time:</span> <span className="font-medium text-teal-700 dark:text-teal-300">{new Date(msg.payload.startTime).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></p>
                              )}
                              {msg.payload.endTime && msg.payload.startTime && (
                                <p><span className="text-teal-600 dark:text-teal-400">Duration:</span> <span className="font-medium text-teal-700 dark:text-teal-300">{Math.round((new Date(msg.payload.endTime).getTime() - new Date(msg.payload.startTime).getTime()) / 60000)} min</span></p>
                              )}
                              {msg.payload.calendarName && (
                                <p><span className="text-teal-600 dark:text-teal-400">Calendar:</span> <span className="font-medium text-teal-700 dark:text-teal-300">{msg.payload.calendarName}</span></p>
                              )}
                              {msg.payload.notes && (
                                <p><span className="text-teal-600 dark:text-teal-400">Notes:</span> <span className="font-medium text-teal-700 dark:text-teal-300">{msg.payload.notes}</span></p>
                              )}
                            </div>
                          )}
                          {/* Show update_appointment details */}
                          {msg.actionType === "update_appointment" && msg.payload && (
                            <div className="mt-1 text-xs bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-md px-2 py-1 space-y-0.5">
                              {msg.payload.title && (
                                <p><span className="text-sky-600 dark:text-sky-400">Appointment:</span> <span className="font-medium text-sky-700 dark:text-sky-300">{msg.payload.title}</span></p>
                              )}
                              {msg.payload.startTime && (
                                <p><span className="text-sky-600 dark:text-sky-400">New Date/Time:</span> <span className="font-medium text-sky-700 dark:text-sky-300">{new Date(msg.payload.startTime).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></p>
                              )}
                              {msg.payload.appointmentTitle && (
                                <p><span className="text-sky-600 dark:text-sky-400">New Title:</span> <span className="font-medium text-sky-700 dark:text-sky-300">{msg.payload.appointmentTitle}</span></p>
                              )}
                              {msg.payload.notes && (
                                <p><span className="text-sky-600 dark:text-sky-400">Notes:</span> <span className="font-medium text-sky-700 dark:text-sky-300">{msg.payload.notes}</span></p>
                              )}
                            </div>
                          )}
                          {/* Show cancel_appointment details */}
                          {msg.actionType === "cancel_appointment" && msg.payload && (
                            <div className="mt-1 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md px-2 py-1 space-y-0.5">
                              {msg.payload.title && (
                                <p><span className="text-red-600 dark:text-red-400">Appointment:</span> <span className="font-medium text-red-700 dark:text-red-300">{msg.payload.title}</span></p>
                              )}
                              <p className="text-red-600 dark:text-red-400 font-medium">This appointment will be cancelled</p>
                            </div>
                          )}
                          {/* Show resolved pipeline stage for confirmation */}
                          {msg.actionType === "change_pipeline_stage" && msg.resolvedStage && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1">
                              <span className="text-blue-600 dark:text-blue-400">→</span>
                              <span className="font-medium text-blue-700 dark:text-blue-300">{msg.resolvedStage.stageName}</span>
                              <span className="text-blue-500 dark:text-blue-500">in</span>
                              <span className="font-medium text-blue-700 dark:text-blue-300">{msg.resolvedStage.pipelineName}</span>
                            </div>
                          )}
                          {msg.actionType === "change_pipeline_stage" && !msg.resolvedStage && msg.status === "pending" && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">⚠ Stage will be resolved when executed</p>
                          )}
                          {/* Show draft content preview */}
                          {msg.status === "pending" && isEditableAction(msg.actionType) && msg.payload ? (
                            <div className="mt-1">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                {msg.actionType === "send_sms" ? "SMS Draft:" : msg.actionType === "create_task" ? "Task:" : msg.actionType === "update_task" ? "Update Task:" : "Note Draft:"}
                              </p>
                              {editingActionId === msg.actionId ? (
                                <>
                                  <Textarea
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="text-sm min-h-[60px] resize-none bg-white dark:bg-gray-900 border"
                                    autoFocus
                                  />
                                  <p className="text-[10px] text-muted-foreground mt-1">Edit the content above, then confirm or cancel</p>
                                </>
                              ) : (
                                <div className="text-sm bg-white/60 dark:bg-gray-900/60 rounded-md p-2 border border-dashed border-gray-300 dark:border-gray-700 whitespace-pre-wrap">
                                  {getEditableContent(msg.actionType, msg.payload) || msg.summary}
                                  {msg.actionType === "create_task" && msg.payload?.description && (
                                    <p className="text-xs text-muted-foreground mt-1 border-t pt-1">{msg.payload.description}</p>
                                  )}
                                </div>
                              )}
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
            placeholder={currentUser?.teamRole === 'lead_generator' ? "Ask about cold calling or give a command..." : "Ask a question or give a command..."}
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
              <option value="admin_callback">Admin</option>
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
  const isAdmin = user?.teamRole === 'admin' || user?.isTenantAdmin === 'true';

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

// CRM Sync Status Component
function CRMSyncStatus({ onSyncComplete }: { onSyncComplete: () => void }) {
  const { data: status, refetch: refetchStatus } = trpc.ghlSync.status.useQuery();
  const syncNowMutation = trpc.ghlSync.syncNow.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Synced ${result.synced} calls from CRM`);
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
        <><Cloud className="h-4 w-4 mr-2" />Sync from CRM{lastSyncText && <span className="ml-1 text-muted-foreground font-normal">({lastSyncText})</span>}</>
      )}
    </Button>
  );
}

// Multi-select filter component
function MultiSelectFilter({ 
  label, 
  options, 
  groups,
  selected, 
  onChange,
  icon: Icon
}: { 
  label: string; 
  options?: { value: string; label: string }[]; 
  groups?: { label: string; options: { value: string; label: string }[] }[];
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

  // Render a single option row
  const renderOption = (option: { value: string; label: string }) => (
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
  );

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
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {groups ? (
            groups.map((group, idx) => (
              group.options.length > 0 && (
                <div key={group.label}>
                  {idx > 0 && <div className="border-t my-1.5" />}
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </div>
                  {group.options.map(renderOption)}
                </div>
              )
            ))
          ) : (
            options?.map(renderOption)
          )}
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
  const { isDemo, guardAction: guardDemoAction } = useDemo();
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
      date: sp.get('date') || 'all',
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
    initialParams.date !== 'all'
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
    if (dateRange !== 'all') sp.set('date', dateRange);
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
    callTypes: selectedCallTypes.length > 0 ? selectedCallTypes.flatMap(t => t === "admin" ? ["seller_callback", "admin_callback"] : [t]) : undefined,
    outcomes: selectedOutcomes.length > 0 ? selectedOutcomes : undefined,
    teamMembers: selectedTeamMembers.length > 0 ? selectedTeamMembers : undefined,
  }), [page, dateFilter, selectedCallTypes, selectedOutcomes, selectedTeamMembers]);
  const { data: callsData, isLoading, refetch, isRefetching } = trpc.calls.withGrades.useQuery(queryParams);
  
  // Separate query for needs review (pending + flagged) and skipped
  // Review query does NOT use dateFilter — stuck/pending calls should always show regardless of date range
  const { data: reviewData, refetch: refetchReview } = trpc.calls.withGrades.useQuery({
    limit: 100,
    statuses: ["pending", "transcribing", "grading", "failed"],
  });
  const { data: skippedData, refetch: refetchSkipped } = trpc.calls.withGrades.useQuery({
    limit: 100,
    statuses: ["skipped"],
    startDate: dateFilter.startDate,
  });

  // Fetch visible team members for the current user (role-restricted for dropdown filter)
  const { data: allTeamMembers } = trpc.team.visibleMembers.useQuery();

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

  const retryCallMutation = trpc.calls.retryCall.useMutation({
    onSuccess: () => {
      toast.success("Call queued for reprocessing");
      handleRefresh();
    },
    onError: (error) => {
      toast.error(`Failed to retry call: ${error.message}`);
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

  // Build team member filter options grouped by team role (from tenant's team list)
  const teamMemberGroups = useMemo(() => {
    if (!allTeamMembers || allTeamMembers.length === 0) return undefined;
    const roleOrder: Record<string, number> = { acquisition_manager: 0, lead_manager: 1, lead_generator: 2 };
    const roleLabels: Record<string, string> = {
      acquisition_manager: 'Acquisition Managers',
      lead_manager: 'Lead Managers',
      lead_generator: 'Lead Generators',
      admin: 'Admin',
    };
    const grouped: Record<string, { value: string; label: string }[]> = {};
    allTeamMembers.forEach((m: any) => {
      const role = m.teamRole || 'other';
      if (!grouped[role]) grouped[role] = [];
      grouped[role].push({ value: m.name, label: m.name });
    });
    // Sort members within each group alphabetically
    Object.values(grouped).forEach(arr => arr.sort((a, b) => a.label.localeCompare(b.label)));
    // Return groups in role order
    return Object.entries(grouped)
      .sort(([a], [b]) => (roleOrder[a] ?? 99) - (roleOrder[b] ?? 99))
      .map(([role, options]) => ({
        label: roleLabels[role] || role,
        options,
      }));
  }, [allTeamMembers]);

  // Call type options - all 6 types
  const callTypeOptions = [
    { value: "cold_call", label: "Cold Call" },
    { value: "qualification", label: "Qualification" },
    { value: "follow_up", label: "Follow-Up" },
    { value: "offer", label: "Offer" },
    { value: "admin", label: "Admin" },
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
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter">Call History</h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">
            Review calls, provide feedback, and get coaching advice
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <CRMSyncStatus onSyncComplete={handleRefresh} />
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleRefresh}
            disabled={isRefetching}
            className="h-8 w-8 p-0"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
          {(user?.role === 'admin' || user?.role === 'super_admin' || user?.isTenantAdmin === 'true') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="More actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {!isDemo && (
                  <>
                    <DropdownMenuItem asChild>
                      <div className="w-full">
                        <BatchDialerSyncButton onSyncComplete={handleRefresh} />
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <div className="w-full">
                    <ManualUploadDialog onSuccess={handleRefresh} />
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/coach-log" className="flex items-center gap-2 cursor-pointer">
                    <ClipboardList className="h-4 w-4" />
                    Coach Log
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
                  {skippedCalls.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{skippedCalls.length >= 100 ? "100+" : skippedCalls.length}</Badge>}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Shared date filter - visible on all tabs */}
            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-2">
                {/* Date range selector - shared across all tabs */}
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

                {/* Additional filters - only on All Calls tab */}
                {activeTab === "calls" && (
                  <>
                    <div className="hidden sm:block w-px h-6 bg-border" />

                    {/* Mobile: Collapsible filter button for extra filters */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="sm:hidden h-8"
                      onClick={() => setShowFilters(!showFilters)}
                    >
                      <Filter className="h-3.5 w-3.5 mr-1" />
                      Filters {hasActiveFilters && `(${selectedTeamMembers.length + selectedCallTypes.length + selectedScoreRanges.length + selectedOutcomes.length})`}
                      <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                    </Button>

                    {/* Extra filter chips - always visible on desktop, collapsible on mobile */}
                    <div className={`${showFilters ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2`}>
                      <MultiSelectFilter
                        label="Team Member"
                        groups={teamMemberGroups}
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
                    </div>

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
                  </>
                )}
              </div>
            </div>

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
              {/* Stuck calls warning — includes pending calls stuck for >1 hour */}
              {pendingCalls.some((c: any) => 
                (c.status === 'transcribing' || c.status === 'grading' || c.status === 'classifying' || c.status === 'pending') && 
                c.updatedAt && 
                new Date(c.updatedAt) < new Date(Date.now() - 60 * 60 * 1000)
              ) && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm text-amber-800 dark:text-amber-200 flex-1">
                    {pendingCalls.filter((c: any) => c.status === 'pending' && c.updatedAt && new Date(c.updatedAt) < new Date(Date.now() - 60 * 60 * 1000)).length > 0
                      ? `${pendingCalls.filter((c: any) => c.updatedAt && new Date(c.updatedAt) < new Date(Date.now() - 60 * 60 * 1000)).length} call(s) have been queued for over an hour and may need to be retried.`
                      : 'Some calls have been processing for over an hour and may be stuck.'
                    }
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetStuckMutation.mutate()}
                    disabled={resetStuckMutation.isPending}
                    className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
                  >
                    {resetStuckMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Retrying...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-2" />Retry All Stuck</>
                    )}
                  </Button>
                </div>
              )}

              {/* Processing calls */}
              {pendingCalls.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Processing ({pendingCalls.length})</h3>
                  <div className="space-y-3">
                    {pendingCalls.map((item: any) => {
                      const isStuck = item.updatedAt && new Date(item.updatedAt) < new Date(Date.now() - 60 * 60 * 1000);
                      return (
                        <Card key={item.id} className={isStuck ? "border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20" : "border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20"}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold truncate">
                                    {item.contactName || item.contactPhone || "Unknown Contact"}
                                  </h3>
                                  <Badge variant="secondary" className={isStuck ? "text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : "text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}>
                                    {isStuck ? "Stuck" : item.status === "pending" ? "Queued" : item.status === "transcribing" ? "Transcribing" : item.status === "classifying" ? "Classifying" : "Grading"}
                                  </Badge>
                                  {isStuck && (
                                    <span className="text-xs text-amber-600 dark:text-amber-400">
                                      ({item.status === 'pending' ? 'never picked up' : `stuck at ${item.status}`})
                                    </span>
                                  )}
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
                              <div className="flex items-center gap-2">
                                {isStuck ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => retryCallMutation.mutate({ callId: item.id })}
                                    disabled={retryCallMutation.isPending}
                                    className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
                                  >
                                    {retryCallMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <><RefreshCw className="h-4 w-4 mr-1" />Retry</>
                                    )}
                                  </Button>
                                ) : (
                                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
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
                            {item.classification === "admin_call" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  reclassifyMutation.mutate({ 
                                    callId: item.id, 
                                    classification: "admin_call",
                                    reason: "Admin call - auto-grade with admin rubric"
                                  });
                                }}
                                disabled={reclassifyMutation.isPending}
                              >
                                {reclassifyMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-4 w-4" />
                                )}
                                <span className="ml-1">Auto-Grade as Admin</span>
                              </Button>
                            ) : (
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
                            )}
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
