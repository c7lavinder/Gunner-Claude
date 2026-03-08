import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CallDetailSkeleton } from "@/components/PageSkeletons";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, Clock, User, RefreshCw, CheckCircle, AlertTriangle, Lightbulb, TrendingUp, FileText, MessageSquare, ThumbsUp, ThumbsDown, MessageCircle, Quote, MapPin, Play, Target } from "lucide-react";
import { Link, useParams } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import NextStepsTab from "@/components/NextStepsTab";
import WaveformPlayer from "@/components/WaveformPlayer";
import type { WaveformPlayerRef } from "@/components/WaveformPlayer";
import CallHighlights from "@/components/CallHighlights";
import { Zap, Sparkles } from "lucide-react";
import { useDemo } from "@/hooks/useDemo";
import { useTenantConfig } from "@/hooks/useTenantConfig";

const FEEDBACK_TYPES = [
  { value: "score_too_high", label: "Score is too high" },
  { value: "score_too_low", label: "Score is too low" },
  { value: "wrong_criteria", label: "Wrong criteria applied" },
  { value: "missed_issue", label: "Missed an issue" },
  { value: "incorrect_feedback", label: "Incorrect feedback given" },
  { value: "general_correction", label: "General correction" },
  { value: "praise", label: "AI did great!" },
];

/* ─── Grade display with animated glow ──────────────── */
function GradeDisplay({ grade, score }: { grade: string; score: string | null }) {
  const g = grade?.toLowerCase() || "?";
  const gradeConfig: Record<string, { bg: string; glow: string; text: string }> = {
    a: { bg: "var(--g-grade-a)", glow: "var(--g-grade-a-glow)", text: "#fff" },
    b: { bg: "var(--g-grade-b)", glow: "var(--g-grade-b-glow)", text: "#fff" },
    c: { bg: "var(--g-grade-c)", glow: "var(--g-grade-c-glow)", text: "#fff" },
    d: { bg: "var(--g-grade-d)", glow: "var(--g-grade-d-glow)", text: "#fff" },
    f: { bg: "var(--g-grade-f)", glow: "var(--g-grade-f-glow)", text: "#fff" },
  };
  const config = gradeConfig[g] || { bg: "var(--g-bg-inset)", glow: "transparent", text: "var(--g-text-primary)" };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-24 h-24 rounded-2xl flex items-center justify-center transition-transform duration-300 hover:scale-105"
        style={{
          background: config.bg,
          boxShadow: `0 0 40px ${config.glow}, 0 0 80px ${config.glow}`,
          color: config.text,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 48,
          fontWeight: 800,
        }}
      >
        {grade || "?"}
      </div>
      <p
        className="text-3xl font-extrabold tracking-tight font-mono"
        style={{ color: "var(--g-text-primary)" }}
      >
        {score ? `${Math.round(parseFloat(score))}%` : "N/A"}
      </p>
    </div>
  );
}

/* ─── Criteria card with visual bar ─────────────────── */
function CriteriaCard({ criteria }: { criteria: any }) {
  const percentage = (criteria.score / criteria.maxPoints) * 100;
  const getColor = () => {
    if (percentage >= 80) return "var(--g-grade-a)";
    if (percentage >= 60) return "var(--g-grade-b)";
    if (percentage >= 40) return "var(--g-grade-c)";
    return "var(--g-grade-f)";
  };

  return (
    <div
      className="rounded-xl p-4 transition-all duration-300 hover:translate-y-[-2px]"
      style={{
        background: "var(--g-bg-card)",
        border: "1px solid var(--g-border-subtle)",
        boxShadow: "var(--g-shadow-card)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-sm" style={{ color: "var(--g-text-primary)" }}>
          {criteria.name}
        </h4>
        <span
          className="font-mono text-sm font-bold"
          style={{ color: getColor() }}
        >
          {criteria.score}/{criteria.maxPoints}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden mb-3"
        style={{ background: "var(--g-bg-inset)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${percentage}%`, background: getColor() }}
        />
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
        {criteria.feedback}
      </p>
    </div>
  );
}

/* ─── Info pill for metadata ────────────────────────── */
function InfoPill({ icon: Icon, label, variant }: { icon: any; label: string; variant?: string }) {
  const variantStyles: Record<string, { bg: string; text: string; border: string }> = {
    inbound: { bg: "rgba(37,99,235,0.08)", text: "rgb(59,130,246)", border: "rgba(37,99,235,0.2)" },
    outbound: { bg: "rgba(22,163,74,0.08)", text: "rgb(34,197,94)", border: "rgba(22,163,74,0.2)" },
    cold_call: { bg: "rgba(6,182,212,0.08)", text: "rgb(34,211,238)", border: "rgba(6,182,212,0.2)" },
    qualification: { bg: "rgba(139,92,246,0.08)", text: "rgb(167,139,250)", border: "rgba(139,92,246,0.2)" },
    follow_up: { bg: "rgba(245,158,11,0.08)", text: "rgb(251,191,36)", border: "rgba(245,158,11,0.2)" },
    offer: { bg: "rgba(16,185,129,0.08)", text: "rgb(52,211,153)", border: "rgba(16,185,129,0.2)" },
    admin: { bg: "rgba(148,163,184,0.08)", text: "rgb(148,163,184)", border: "rgba(148,163,184,0.2)" },
    default: { bg: "var(--g-bg-inset)", text: "var(--g-text-secondary)", border: "var(--g-border-subtle)" },
  };
  const style = variantStyles[variant || "default"] || variantStyles.default;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function CallDetail() {
  const params = useParams<{ id: string }>();
  const callId = parseInt(params.id || "0", 10);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [reclassifyDialogOpen, setReclassifyDialogOpen] = useState(false);
  const { isDemo, guardAction: guardDemoAction } = useDemo();
  const { t } = useTenantConfig();
  const [selectedClassification, setSelectedClassification] = useState("");
  const [feedbackForm, setFeedbackForm] = useState({
    feedbackType: "general_correction",
    criteriaName: "",
    suggestedGrade: "",
    explanation: "",
    correctBehavior: "",
  });
  const [detailTab, setDetailTab] = useState("coaching");
  const waveformRef = useRef<WaveformPlayerRef>(null);

  const { data: call, isLoading: callLoading } = trpc.calls.getById.useQuery(
    { id: callId },
    { enabled: callId > 0 }
  );
  
  const { data: grade, isLoading: gradeLoading } = trpc.calls.getGrade.useQuery(
    { callId },
    { enabled: callId > 0 }
  );

  const { data: existingFeedback } = trpc.feedback.list.useQuery(
    { callId, limit: 10 },
    { enabled: callId > 0 }
  );

  const { data: nextStepsCount } = trpc.calls.getNextStepsCount.useQuery(
    { callId },
    { enabled: callId > 0 }
  );

  const reprocessMutation = trpc.calls.reprocess.useMutation({
    onSuccess: () => { toast.success("Call queued for reprocessing"); },
    onError: (error) => { toast.error(`Failed to reprocess: ${error.message}`); },
  });

  const feedbackMutation = trpc.feedback.create.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted successfully");
      setFeedbackDialogOpen(false);
      setFeedbackForm({ feedbackType: "general_correction", criteriaName: "", suggestedGrade: "", explanation: "", correctBehavior: "" });
    },
    onError: (error) => { toast.error(`Failed to submit feedback: ${error.message}`); },
  });

  const utils = trpc.useUtils();

  // XP processing
  const processedRef = useRef(false);
  const processRewardsMutation = trpc.gamification.processCallView.useMutation({
    onSuccess: (data) => {
      if (data && data.xpEarned > 0) {
        toast.success(
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            <span>+{data.xpEarned} XP earned!</span>
          </div>
        );
      }
    },
  });

  useEffect(() => {
    if (grade && !processedRef.current && callId > 0) {
      processedRef.current = true;
      processRewardsMutation.mutate({ callId });
    }
  }, [grade, callId]);

  const reclassifyMutation = trpc.calls.reclassify.useMutation({
    onSuccess: (result) => {
      toast.success(`Call reclassified to ${result.classification.replace(/_/g, " ")}`);
      setReclassifyDialogOpen(false);
      setSelectedClassification("");
      utils.calls.getById.invalidate({ id: callId });
      utils.calls.withGrades.invalidate();
    },
    onError: (error) => { toast.error(`Failed to reclassify: ${error.message}`); },
  });

  const handleSubmitFeedback = () => {
    if (guardDemoAction("Submitting feedback")) return;
    if (!feedbackForm.explanation.trim()) { toast.error("Please provide an explanation"); return; }
    feedbackMutation.mutate({
      callId,
      callGradeId: grade?.id,
      feedbackType: feedbackForm.feedbackType as any,
      criteriaName: feedbackForm.criteriaName || undefined,
      originalGrade: grade?.overallGrade as any,
      suggestedGrade: feedbackForm.suggestedGrade ? feedbackForm.suggestedGrade as any : undefined,
      explanation: feedbackForm.explanation,
      correctBehavior: feedbackForm.correctBehavior || undefined,
    });
  };

  const isLoading = callLoading || gradeLoading;

  if (isLoading) {
    return <CallDetailSkeleton />;
  }

  if (!call) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 rounded-2xl"
        style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
      >
        <Phone className="h-16 w-16 mb-4" style={{ color: "var(--g-text-tertiary)", opacity: 0.4 }} />
        <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--g-text-primary)" }}>Call not found</h3>
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Inbox
        </Button>
      </div>
    );
  }

  const criteriaScores = grade?.criteriaScores as any[] || [];
  const strengths = grade?.strengths as string[] || [];
  const improvements = grade?.improvements as string[] || [];
  const coachingTips = grade?.coachingTips as string[] || [];
  const redFlags = grade?.redFlags as string[] || [];
  const objectionHandling = grade?.objectionHandling as Array<{
    objection: string;
    context: string;
    suggestedResponses: string[];
  }> || [];

  const callTypeLabel = (ct: string | null) => t.callType(ct);

  const callTypeVariant = (ct: string | null) => {
    const map: Record<string, string> = {
      cold_call: "cold_call", qualification: "qualification", follow_up: "follow_up",
      offer: "offer", seller_callback: "admin", admin_callback: "admin",
    };
    return map[ct || ""] || "default";
  };

  const outcomeColorMap: Record<string, string> = {
    appointment_set: "offer", offer_made: "inbound", offer_rejected: "default",
    offer_accepted: "offer", callback_scheduled: "follow_up", callback_requested: "follow_up",
    interested: "offer", not_interested: "default", left_vm: "default",
    left_voicemail: "default", no_answer: "default", dead: "default",
    wrong_number: "follow_up", do_not_call: "default", follow_up: "inbound",
  };
  const outcomeColors = Object.fromEntries(
    Object.entries(outcomeColorMap).map(([code, color]) => [code, { label: t.outcome(code), color }])
  ) as Record<string, { label: string; color: string }>;

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => window.history.back()}
          className="h-10 px-3 rounded-xl flex items-center gap-2 shrink-0 transition-all duration-200 hover:scale-105"
          style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)", color: "var(--g-text-secondary)" }}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-medium hidden sm:inline">Back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter" style={{ color: "var(--g-text-primary)" }}>
            {call.contactName || call.contactPhone || "Unknown Contact"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {call.teamMemberName && (
              <InfoPill icon={User} label={call.teamMemberName} />
            )}
            {call.duration && (
              <InfoPill icon={Clock} label={`${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, "0")}`} />
            )}
            {call.callDirection && (
              <InfoPill
                icon={call.callDirection === "inbound" ? PhoneIncoming : PhoneOutgoing}
                label={call.callDirection === "inbound" ? "Inbound" : "Outbound"}
                variant={call.callDirection}
              />
            )}
            <InfoPill icon={null} label={callTypeLabel(call.callType)} variant={callTypeVariant(call.callType)} />
            {(call as any).callOutcome && (call as any).callOutcome !== "pending" && (call as any).callOutcome !== "none" && (() => {
              const outcome = (call as any).callOutcome as string;
              const config = outcomeColors[outcome];
              return <InfoPill icon={null} label={config?.label || outcome.replace(/_/g, " ")} variant={config?.color || "default"} />;
            })()}
            {(call as any).followUpScheduled === "true" && (
              <InfoPill icon={Clock} label="Follow-Up Scheduled" variant="follow_up" />
            )}
            {call.propertyAddress && (
              <InfoPill icon={MapPin} label={call.propertyAddress} variant="follow_up" />
            )}
          </div>
          {call.createdAt && (
            <p className="text-xs mt-2" style={{ color: "var(--g-text-tertiary)" }}>
              {format(new Date(call.createdAt), "EEEE, MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {call.status === "completed" && grade && (
            <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <MessageSquare className="h-4 w-4 mr-1.5" /> Feedback
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Provide Feedback on AI Grading</DialogTitle>
                  <DialogDescription>Help improve the AI by letting us know what it got right or wrong.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Feedback Type</Label>
                    <Select value={feedbackForm.feedbackType} onValueChange={(value) => setFeedbackForm({ ...feedbackForm, feedbackType: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FEEDBACK_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Current Grade</Label>
                      <div className="p-2 border rounded-lg text-center">
                        <span className={`obs-grade-pill ${(grade?.overallGrade || "?").toLowerCase()}`}>{grade?.overallGrade || "?"}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Suggested Grade</Label>
                      <Select value={feedbackForm.suggestedGrade} onValueChange={(value) => setFeedbackForm({ ...feedbackForm, suggestedGrade: value })}>
                        <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                          <SelectItem value="F">F</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Specific Criteria</Label>
                    <Select value={feedbackForm.criteriaName} onValueChange={(value) => setFeedbackForm({ ...feedbackForm, criteriaName: value })}>
                      <SelectTrigger><SelectValue placeholder="Select criteria" /></SelectTrigger>
                      <SelectContent>
                        {criteriaScores.map((c) => (
                          <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Explanation *</Label>
                    <Textarea placeholder="Describe what the AI got wrong or right..." value={feedbackForm.explanation} onChange={(e) => setFeedbackForm({ ...feedbackForm, explanation: e.target.value })} className="min-h-[100px]" />
                  </div>
                  <div className="space-y-2">
                    <Label>What Should the AI Have Done?</Label>
                    <Textarea placeholder="Describe the correct behavior..." value={feedbackForm.correctBehavior} onChange={(e) => setFeedbackForm({ ...feedbackForm, correctBehavior: e.target.value })} className="min-h-[80px]" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmitFeedback} disabled={feedbackMutation.isPending}>
                    {feedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {call.status === "failed" && (
            <Button variant="outline" size="sm" onClick={() => { if (!guardDemoAction("Reprocessing")) reprocessMutation.mutate({ callId }); }} disabled={reprocessMutation.isPending || isDemo}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${reprocessMutation.isPending ? "animate-spin" : ""}`} /> Retry
            </Button>
          )}
          {!isDemo && (
            <Dialog open={reclassifyDialogOpen} onOpenChange={setReclassifyDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">Reclassify</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Reclassify Call</DialogTitle>
                  <DialogDescription>Change the classification. "Conversation" triggers full grading. "Admin Call" auto-grades. Others skip grading.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Current</Label>
                    <div className="p-2 border rounded-lg">
                      <Badge variant="outline" className="capitalize">{call.classification?.replace(/_/g, " ") || "Unknown"}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>New Classification</Label>
                    <Select value={selectedClassification} onValueChange={setSelectedClassification}>
                      <SelectTrigger><SelectValue placeholder="Select classification" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conversation">Conversation (graded)</SelectItem>
                        <SelectItem value="admin_call">Admin Call (auto-graded)</SelectItem>
                        <SelectItem value="voicemail">Voicemail (skipped)</SelectItem>
                        <SelectItem value="no_answer">No Answer (skipped)</SelectItem>
                        <SelectItem value="callback_request">Callback Request (skipped)</SelectItem>
                        <SelectItem value="wrong_number">Wrong Number (skipped)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setReclassifyDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => {
                    if (!selectedClassification) { toast.error("Please select a classification"); return; }
                    reclassifyMutation.mutate({ callId, classification: selectedClassification as any });
                  }} disabled={reclassifyMutation.isPending || !selectedClassification}>
                    {reclassifyMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* ═══ Feedback notice ═══ */}
      {existingFeedback && existingFeedback.length > 0 && (
        <div
          className="flex items-center gap-4 px-5 py-4 rounded-xl"
          style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)" }}
        >
          <MessageSquare className="h-5 w-5 shrink-0" style={{ color: "rgb(59,130,246)" }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>
              {existingFeedback.length} feedback item(s) submitted
            </p>
            <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
              {existingFeedback.filter(f => f.status === "incorporated").length} incorporated, {existingFeedback.filter(f => f.status === "pending").length} pending
            </p>
          </div>
          <Link href="/feedback">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </div>
      )}

      {/* ═══ Non-completed states ═══ */}
      {call.status !== "completed" ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-2xl"
          style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
        >
          {call.status === "skipped" ? (
            <>
              <AlertTriangle className="h-12 w-12 mb-4" style={{ color: "var(--g-text-tertiary)", opacity: 0.5 }} />
              <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--g-text-primary)" }}>Call Skipped</h3>
              <p className="text-sm text-center max-w-md" style={{ color: "var(--g-text-secondary)" }}>
                Classified as: <span className="font-medium capitalize">{call.classification?.replace(/_/g, " ")}</span>
              </p>
              {call.classificationReason && (
                <p className="text-xs mt-2 text-center max-w-md" style={{ color: "var(--g-text-tertiary)" }}>{call.classificationReason}</p>
              )}
            </>
          ) : (
            <>
              <RefreshCw className="h-12 w-12 mb-4 animate-spin" style={{ color: "var(--g-accent)" }} />
              <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--g-text-primary)" }}>Processing Call</h3>
              <p className="text-sm capitalize" style={{ color: "var(--g-text-secondary)" }}>Status: {call.status}</p>
              {call.status === "failed" && (
                <Button className="mt-4" onClick={() => { if (!guardDemoAction("Reprocessing")) reprocessMutation.mutate({ callId }); }} disabled={reprocessMutation.isPending || isDemo}>
                  Retry Processing
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        /* ═══ Completed call — main content ═══ */
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column — Grade + Strengths + Red Flags */}
          <div className="space-y-5">
            {/* Grade card */}
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", boxShadow: "var(--g-shadow-card)" }}
            >
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-4" style={{ color: "var(--g-text-tertiary)" }}>
                Overall Grade
              </p>
              <GradeDisplay grade={grade?.overallGrade || "?"} score={grade?.overallScore || null} />
              {(call as any).callTypeSource === "ai_detected" && (
                <p className="text-[10px] mt-3" style={{ color: "var(--g-text-tertiary)" }}>AI-detected type</p>
              )}
            </div>

            {/* Strengths */}
            {strengths.length > 0 && (
              <div
                className="rounded-2xl p-5"
                style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", boxShadow: "var(--g-shadow-card)" }}
              >
                <h3 className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 mb-4" style={{ color: "var(--g-grade-a)" }}>
                  <CheckCircle className="h-4 w-4" /> Strengths
                </h3>
                <ul className="space-y-2.5">
                  {strengths.map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2.5 leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--g-grade-a)" }} />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Red Flags */}
            {redFlags.length > 0 && (
              <div
                className="rounded-2xl p-5"
                style={{ background: "var(--g-bg-card)", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "var(--g-shadow-card)" }}
              >
                <h3 className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 mb-4" style={{ color: "var(--g-grade-f)" }}>
                  <AlertTriangle className="h-4 w-4" /> Red Flags
                </h3>
                <ul className="space-y-2.5">
                  {redFlags.map((f, i) => (
                    <li key={i} className="text-sm flex items-start gap-2.5 leading-relaxed" style={{ color: "rgba(239,68,68,0.85)" }}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--g-grade-f)" }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right Column — Tabs */}
          <div className="lg:col-span-2 space-y-5">
            <div className="obs-role-tabs">
              <button className={`obs-role-tab ${detailTab === "coaching" ? "active" : ""}`} onClick={() => setDetailTab("coaching")}>
                <Lightbulb className="h-4 w-4" /> Coaching
              </button>
              <button className={`obs-role-tab ${detailTab === "criteria" ? "active" : ""}`} onClick={() => setDetailTab("criteria")}>
                <Target className="h-4 w-4" /> Criteria
              </button>
              <button className={`obs-role-tab ${detailTab === "transcript" ? "active" : ""}`} onClick={() => setDetailTab("transcript")}>
                <FileText className="h-4 w-4" /> Transcript
              </button>
              <button className={`obs-role-tab ${detailTab === "next-steps" ? "active" : ""}`} onClick={() => setDetailTab("next-steps")}>
                <Zap className="h-4 w-4" /> Next Steps
                {(nextStepsCount?.count ?? 0) > 0 && (
                  <span
                    className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold text-white"
                    style={{ background: "var(--g-accent)" }}
                  >
                    {nextStepsCount!.count}
                  </span>
                )}
              </button>
            </div>

            {/* ─── Coaching Tab ─── */}
            {detailTab === "coaching" && (
              <div key="coaching" className="space-y-5 obs-fade-in">
                {grade?.summary && (
                  <div className="rounded-2xl p-5" style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", boxShadow: "var(--g-shadow-card)" }}>
                    <h3 className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 mb-3" style={{ color: "var(--g-text-tertiary)" }}>
                      <FileText className="h-4 w-4" /> Summary
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>{grade.summary}</p>
                  </div>
                )}

                {improvements.length > 0 && (
                  <div className="rounded-2xl p-5" style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", boxShadow: "var(--g-shadow-card)" }}>
                    <h3 className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 mb-4" style={{ color: "var(--g-grade-c)" }}>
                      <TrendingUp className="h-4 w-4" /> Areas for Improvement
                    </h3>
                    <ul className="space-y-2.5">
                      {improvements.map((item, i) => (
                        <li key={i} className="text-sm flex items-start gap-2.5 leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--g-grade-c)" }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {coachingTips.length > 0 && (
                  <div className="rounded-2xl p-5" style={{ background: "var(--g-bg-card)", border: "1px solid rgba(37,99,235,0.15)", boxShadow: "var(--g-shadow-card)" }}>
                    <h3 className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 mb-4" style={{ color: "rgb(59,130,246)" }}>
                      <Lightbulb className="h-4 w-4" /> Coaching Tips
                    </h3>
                    <ul className="space-y-3">
                      {coachingTips.map((tip, i) => (
                        <li
                          key={i}
                          className="text-sm p-3.5 rounded-xl leading-relaxed"
                          style={{ background: "rgba(37,99,235,0.06)", color: "var(--g-text-secondary)" }}
                        >
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {objectionHandling.length > 0 && (
                  <div className="rounded-2xl p-5" style={{ background: "var(--g-bg-card)", border: "1px solid rgba(139,92,246,0.15)", boxShadow: "var(--g-shadow-card)" }}>
                    <h3 className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 mb-1" style={{ color: "rgb(167,139,250)" }}>
                      <MessageCircle className="h-4 w-4" /> Potential Replies to Objections
                    </h3>
                    <p className="text-xs mb-4" style={{ color: "var(--g-text-tertiary)" }}>
                      Objections identified in this call with suggested responses
                    </p>
                    <div className="space-y-4">
                      {objectionHandling.map((item, i) => (
                        <div key={i} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
                          <div className="px-4 py-3" style={{ background: "rgba(139,92,246,0.06)" }}>
                            <p className="font-medium text-sm" style={{ color: "rgb(167,139,250)" }}>{item.objection}</p>
                          </div>
                          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
                            <div className="flex gap-2">
                              <Quote className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--g-text-tertiary)" }} />
                              <p className="text-sm italic" style={{ color: "var(--g-text-tertiary)" }}>{item.context}</p>
                            </div>
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--g-text-tertiary)" }}>Suggested Responses</p>
                            <ul className="space-y-2">
                              {item.suggestedResponses.map((r, j) => (
                                <li
                                  key={j}
                                  className="text-sm p-3 rounded-lg"
                                  style={{ background: "rgba(139,92,246,0.04)", borderLeft: "2px solid rgb(139,92,246)", color: "var(--g-text-secondary)" }}
                                >
                                  "{r}"
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── Criteria Tab ─── */}
            {detailTab === "criteria" && (
              <div key="criteria" className="mt-1 obs-fade-in">
                <div className="grid gap-4 sm:grid-cols-2">
                  {criteriaScores.map((criteria, i) => (
                    <CriteriaCard key={i} criteria={criteria} />
                  ))}
                </div>
              </div>
            )}

            {/* ─── Transcript Tab ─── */}
            {detailTab === "transcript" && (
              <div key="transcript" className="mt-1 obs-fade-in space-y-4">
                {/* ─── Audio Waveform Player ─── */}
                {call.recordingUrl && (
                  <div>
                    <h3 className="text-xs uppercase tracking-widest font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--g-text-tertiary)" }}>
                      <Play className="h-3.5 w-3.5" /> Call Recording
                    </h3>
                    <WaveformPlayer ref={waveformRef} url={call.recordingUrl} duration={call.duration || undefined} />
                  </div>
                )}

                {/* ─── Call Highlights ─── */}
                {grade && (
                  <CallHighlights
                    callId={callId}
                    highlights={grade.highlights as any[] | null}
                    hasRecording={!!call.recordingUrl}
                    onSeek={(seconds) => {
                      if (waveformRef.current) {
                        waveformRef.current.seekTo(seconds);
                        waveformRef.current.play();
                      }
                    }}
                  />
                )}

                <div
                  className="rounded-2xl p-5"
                  style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", boxShadow: "var(--g-shadow-card)" }}
                >
                  <h3 className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--g-text-tertiary)" }}>
                    Call Transcript
                  </h3>
                  <p className="text-xs mb-4" style={{ color: "var(--g-text-tertiary)" }}>Full transcription of the call</p>
                  {call.transcript ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--g-text-secondary)" }}>
                      {call.transcript}
                    </div>
                  ) : (
                    <p className="text-center py-8" style={{ color: "var(--g-text-tertiary)" }}>No transcript available</p>
                  )}
                </div>
              </div>
            )}

            {/* ─── Next Steps Tab ─── */}
            {detailTab === "next-steps" && (
              <div key="next-steps" className="mt-1 obs-fade-in">
                <NextStepsTab
                  callId={callId}
                  contactName={call.contactName || call.contactPhone || "Unknown"}
                  ghlContactId={(call as any).ghlContactId}
                  teamMemberName={call.teamMemberName}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
