import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  User,
  Clock,
  MapPin,
  Star,
  MessageSquare,
  Tag,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  ListChecks,
  Play,
  Pause,
  Volume2,
  X,
  Send,
  RefreshCw,
  Plus,
  ChevronRight,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { ErrorState } from "@/components/ErrorState";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import type WaveSurfer from "wavesurfer.js";

/* ── Helpers ── */

function formatDuration(sec: number | null) {
  if (sec == null) return "\u2014";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function scoreLetter(score: number | null): string {
  if (score === null) return "\u2014";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function gradeCircleColor(score: number | null): string {
  if (score === null) return "bg-gray-400";
  if (score >= 90) return "bg-green-500";
  if (score >= 80) return "bg-blue-500";
  if (score >= 70) return "bg-amber-400";
  if (score >= 60) return "bg-orange-400";
  return "bg-red-500";
}

function formatCodeLabel(code: string) {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const CLASSIFICATION_COLOR: Record<string, string> = {
  green: "border-green-500 text-green-600",
  red: "border-red-500 text-red-600",
  amber: "border-amber-500 text-amber-600",
  gray: "border-gray-400 text-gray-500",
};

type ContentTab = "coaching" | "criteria" | "transcript" | "next-steps";

/* ── Main Component ── */

export function CallDetail() {
  const [, params] = useRoute("/calls/:id");
  const [, navigate] = useLocation();
  const callId = params?.id ? Number(params.id) : null;

  const { callTypes, classificationLabels } = useTenantConfig();

  const { data, isLoading, isError } = trpc.calls.getById.useQuery(
    { id: callId! },
    { enabled: callId != null },
  );

  const [activeTab, setActiveTab] = useState<ContentTab>("coaching");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);

  if (isError || (callId == null)) {
    return (
      <PageShell title="Call Detail">
        <ErrorState onRetry={() => window.location.reload()} />
      </PageShell>
    );
  }

  if (isLoading || !data) {
    return (
      <PageShell title="Call Detail">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="flex gap-4">
            <Skeleton className="h-[400px] w-80" />
            <Skeleton className="h-[400px] flex-1" />
          </div>
        </div>
      </PageShell>
    );
  }

  const call = data;
  const grade = call.grade;
  const score = grade?.overallScore ?? null;
  const letter = scoreLetter(score);
  const direction = (call.callDirection ?? "").toLowerCase();
  const isInbound = direction === "inbound";
  const callTypeName = callTypes.find((ct) => ct.code === call.callType)?.name ?? (call.callType ? formatCodeLabel(call.callType) : "\u2014");
  const classLabel = call.classification ? classificationLabels[call.classification] : undefined;
  const classColor = classLabel ? (CLASSIFICATION_COLOR[classLabel.color] ?? CLASSIFICATION_COLOR.gray) : null;
  const relativeTime = call.callTimestamp
    ? formatDistanceToNow(new Date(call.callTimestamp), { addSuffix: true })
    : "\u2014";

  return (
    <PageShell
      title=""
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFeedbackOpen(true)}>
            <MessageSquare className="size-3.5" />
            Feedback
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReclassifyOpen(true)}>
            <Tag className="size-3.5" />
            Reclassify
          </Button>
        </div>
      }
    >
      {/* Back + Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate("/calls")}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--g-text-tertiary)] hover:text-[var(--g-text-primary)] transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to Calls
        </button>

        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-[var(--g-text-primary)]">
                {call.contactName ?? "Unknown"}
              </h1>
              {isInbound ? (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-blue-500 text-white">
                  <PhoneIncoming className="size-3" /> Inbound
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-green-500 text-white">
                  <PhoneOutgoing className="size-3" /> Outbound
                </span>
              )}
              <span className="inline-flex items-center rounded-full border border-teal-500 text-teal-600 px-2.5 py-0.5 text-[11px] font-medium">
                {callTypeName}
              </span>
              {classLabel && classColor && (
                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium", classColor)}>
                  {classLabel.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-[var(--g-text-tertiary)]">
              <span className="inline-flex items-center gap-1">
                <User className="size-3" /> {call.teamMemberName ?? "\u2014"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" /> {formatDuration(call.duration)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3" /> {relativeTime}
              </span>
              {call.propertyAddress && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {call.propertyAddress}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Two-panel body */}
        <div className="flex gap-4">
          {/* Left panel — Grade */}
          <div className="w-72 xl:w-80 shrink-0 space-y-4">
            <GradePanel score={score} letter={letter} grade={grade} />
          </div>

          {/* Right panel — Tabbed content */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Tab bar */}
            <div className="flex gap-1 bg-[var(--g-bg-surface)] rounded-lg p-1 border border-[var(--g-border-subtle)]">
              {([
                { key: "coaching", label: "Coaching", icon: Lightbulb },
                { key: "criteria", label: "Criteria", icon: ListChecks },
                { key: "transcript", label: "Transcript", icon: Volume2 },
                { key: "next-steps", label: "Next Steps", icon: CheckCircle },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    activeTab === key
                      ? "bg-white shadow-sm text-[var(--g-text-primary)]"
                      : "text-[var(--g-text-tertiary)] hover:text-[var(--g-text-secondary)]",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === "coaching" && <CoachingTab grade={grade} />}
            {activeTab === "criteria" && <CriteriaTab grade={grade} />}
            {activeTab === "transcript" && (
              <TranscriptTab transcript={call.transcript} recordingUrl={call.recordingUrl} />
            )}
            {activeTab === "next-steps" && <NextStepsTab callId={call.id} />}
          </div>
        </div>
      </div>

      {/* Modals */}
      {feedbackOpen && (
        <FeedbackModal
          callId={call.id}
          grade={grade}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {reclassifyOpen && (
        <ReclassifyModal
          callId={call.id}
          currentClassification={call.classification}
          onClose={() => setReclassifyOpen(false)}
        />
      )}
    </PageShell>
  );
}

/* ── Grade Panel ── */

interface GradeInfo {
  overallScore: number | null;
  overallGrade: string | null;
  strengths: unknown;
  improvements: unknown;
  redFlags: unknown;
  coachingTips: unknown;
  summary: string | null;
  objectionHandling: unknown;
  highlights: unknown;
  criteriaScores: unknown;
}

function GradePanel({ score, letter, grade }: { score: number | null; letter: string; grade: GradeInfo | null }) {
  const strengths = Array.isArray(grade?.strengths) ? (grade.strengths as string[]) : [];
  const redFlags = Array.isArray(grade?.redFlags) ? (grade.redFlags as string[]) : [];

  return (
    <div className="space-y-4">
      {/* Grade circle */}
      <Card className="border-[var(--g-border-subtle)]">
        <CardContent className="p-4 flex flex-col items-center gap-2">
          <div className={cn("size-20 rounded-full flex flex-col items-center justify-center text-white", gradeCircleColor(score))}>
            <span className="text-2xl font-bold leading-none">{letter}</span>
            {score !== null && <span className="text-xs leading-none mt-1">{Math.round(score)}%</span>}
          </div>
          {grade?.summary && (
            <p className="text-xs text-[var(--g-text-secondary)] text-center mt-2">{grade.summary}</p>
          )}
        </CardContent>
      </Card>

      {/* Strengths */}
      {strengths.length > 0 && (
        <Card className="border-[var(--g-border-subtle)]">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[var(--g-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle className="size-3.5 text-green-500" />
              Strengths
            </h3>
            <ul className="space-y-1.5">
              {strengths.map((s, i) => (
                <li key={i} className="text-xs text-[var(--g-text-primary)] flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 shrink-0">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Red Flags */}
      {redFlags.length > 0 && (
        <Card className="border-[var(--g-border-subtle)]">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[var(--g-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-red-500" />
              Red Flags
            </h3>
            <ul className="space-y-1.5">
              {redFlags.map((f, i) => (
                <li key={i} className="text-xs text-[var(--g-text-primary)] flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 shrink-0">!</span>
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Coaching Tab ── */

function CoachingTab({ grade }: { grade: GradeInfo | null }) {
  const improvements = Array.isArray(grade?.improvements) ? (grade.improvements as string[]) : [];
  const coachingTips = Array.isArray(grade?.coachingTips) ? (grade.coachingTips as string[]) : [];
  const objections = Array.isArray(grade?.objectionHandling) ? (grade.objectionHandling as Array<{ objection: string; context: string; suggestedResponses: string[] }>) : [];

  if (!grade) {
    return (
      <Card className="border-[var(--g-border-subtle)]">
        <CardContent className="p-6 text-center text-sm text-[var(--g-text-tertiary)]">
          No grade available yet. This call may still be processing.
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="space-y-4 pr-2">
        {/* Improvements */}
        {improvements.length > 0 && (
          <Card className="border-[var(--g-border-subtle)]">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-xs font-semibold text-[var(--g-text-secondary)] uppercase tracking-wider">
                Areas for Improvement
              </h3>
              <ul className="space-y-1.5">
                {improvements.map((item, i) => (
                  <li key={i} className="text-sm text-[var(--g-text-primary)]">{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Coaching Tips */}
        {coachingTips.length > 0 && (
          <Card className="border-[var(--g-border-subtle)]">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-xs font-semibold text-[var(--g-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                <Lightbulb className="size-3.5 text-amber-500" />
                Coaching Tips
              </h3>
              <ul className="space-y-1.5">
                {coachingTips.map((tip, i) => (
                  <li key={i} className="text-sm text-[var(--g-text-primary)]">{tip}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Objection Handling */}
        {objections.length > 0 && (
          <Card className="border-[var(--g-border-subtle)]">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-xs font-semibold text-[var(--g-text-secondary)] uppercase tracking-wider">
                Objection Handling
              </h3>
              {objections.map((obj, i) => (
                <div key={i} className="space-y-1 border-l-2 border-[var(--g-border-medium)] pl-3">
                  <p className="text-sm font-medium text-[var(--g-text-primary)]">{obj.objection}</p>
                  <p className="text-xs text-[var(--g-text-tertiary)]">{obj.context}</p>
                  {obj.suggestedResponses?.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {obj.suggestedResponses.map((r, j) => (
                        <p key={j} className="text-xs text-[var(--g-accent-text)] italic">&quot;{r}&quot;</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

/* ── Criteria Tab ── */

function CriteriaTab({ grade }: { grade: GradeInfo | null }) {
  const criteria = grade?.criteriaScores as Array<{ name: string; score: number; maxScore: number; feedback: string }> | null;

  if (!criteria || !Array.isArray(criteria) || criteria.length === 0) {
    return (
      <Card className="border-[var(--g-border-subtle)]">
        <CardContent className="p-6 text-center text-sm text-[var(--g-text-tertiary)]">
          No criteria scores available.
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="space-y-2 pr-2">
        {criteria.map((c, i) => {
          const pct = c.maxScore > 0 ? (c.score / c.maxScore) * 100 : 0;
          const barColor = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-amber-400" : "bg-red-500";
          return (
            <Card key={i} className="border-[var(--g-border-subtle)]">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--g-text-primary)]">{c.name}</span>
                  <span className="text-xs font-semibold text-[var(--g-text-secondary)]">
                    {c.score}/{c.maxScore}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--g-bg-inset)]">
                  <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
                </div>
                {c.feedback && (
                  <p className="text-xs text-[var(--g-text-tertiary)]">{c.feedback}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/* ── Transcript Tab ── */

function TranscriptTab({ transcript, recordingUrl }: { transcript: string | null; recordingUrl: string | null }) {
  const waveRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  useEffect(() => {
    if (!recordingUrl || !waveRef.current) return;

    let ws: WaveSurfer | null = null;

    import("wavesurfer.js").then((WaveSurferModule) => {
      if (!waveRef.current) return;
      ws = WaveSurferModule.default.create({
        container: waveRef.current,
        waveColor: "#c4b5fd",
        progressColor: "#7c3aed",
        cursorColor: "#7c3aed",
        height: 48,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        url: recordingUrl,
      });
      wsRef.current = ws;
      ws.on("ready", () => setAudioDuration(ws!.getDuration()));
      ws.on("audioprocess", () => setCurrentTime(ws!.getCurrentTime()));
      ws.on("finish", () => setPlaying(false));
    });

    return () => {
      ws?.destroy();
      wsRef.current = null;
    };
  }, [recordingUrl]);

  const togglePlay = useCallback(() => {
    if (!wsRef.current) return;
    wsRef.current.playPause();
    setPlaying((p) => !p);
  }, []);

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="space-y-4 pr-2">
        {/* Waveform player */}
        {recordingUrl && (
          <Card className="border-[var(--g-border-subtle)]">
            <CardContent className="p-3 space-y-2">
              <div ref={waveRef} className="w-full" />
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlay}>
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
                <span className="text-xs text-[var(--g-text-tertiary)] tabular-nums">
                  {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(audioDuration))}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transcript text */}
        {transcript ? (
          <Card className="border-[var(--g-border-subtle)]">
            <CardContent className="p-4">
              <pre className="text-sm text-[var(--g-text-primary)] whitespace-pre-wrap font-sans leading-relaxed">
                {transcript}
              </pre>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[var(--g-border-subtle)]">
            <CardContent className="p-6 text-center text-sm text-[var(--g-text-tertiary)]">
              No transcript available.
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

/* ── Next Steps Tab ── */

function NextStepsTab({ callId }: { callId: number }) {
  const utils = trpc.useUtils();
  const { data: steps, isLoading, isError } = trpc.calls.getNextSteps.useQuery({ callId });
  const generateMutation = trpc.calls.generateNextSteps.useMutation({
    onSuccess: () => void utils.calls.getNextSteps.invalidate({ callId }),
  });
  const updateMutation = trpc.calls.updateNextStep.useMutation({
    onSuccess: () => void utils.calls.getNextSteps.invalidate({ callId }),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-[var(--g-border-subtle)]">
        <CardContent className="p-6 text-center text-sm text-[var(--g-text-tertiary)]">
          Next steps unavailable. The call may still be processing.
        </CardContent>
      </Card>
    );
  }

  const pending = (steps ?? []).filter((s) => s.status === "pending");
  const completed = (steps ?? []).filter((s) => s.status === "completed" || s.status === "dismissed");

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="space-y-4 pr-2">
        {/* Generate button */}
        {(steps ?? []).length === 0 && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => generateMutation.mutate({ callId })}
            disabled={generateMutation.isPending}
          >
            <RefreshCw className={cn("size-4", generateMutation.isPending && "animate-spin")} />
            Generate Next Steps
          </Button>
        )}

        {/* Pending steps */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[var(--g-text-secondary)] uppercase tracking-wider">
              Pending
            </h3>
            {pending.map((step) => {
              const payload = (step.payload ?? {}) as Record<string, unknown>;
              const label = (payload.label as string) ?? step.actionType;
              const editableContent = (payload.editableContent as string) ?? "";
              return (
                <Card key={step.id} className="border-[var(--g-border-subtle)]">
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {step.actionType}
                        </Badge>
                        <span className="text-sm font-medium text-[var(--g-text-primary)] truncate">{label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-green-600"
                          onClick={() => updateMutation.mutate({ id: step.id, status: "completed" })}
                        >
                          <CheckCircle className="size-3 mr-1" /> Done
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-[var(--g-text-tertiary)]"
                          onClick={() => updateMutation.mutate({ id: step.id, status: "dismissed" })}
                        >
                          <X className="size-3 mr-1" /> Skip
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--g-text-tertiary)]">{step.reason}</p>
                    {editableContent && (
                      <p className="text-xs text-[var(--g-text-secondary)] bg-[var(--g-bg-surface)] rounded px-2 py-1.5">
                        {editableContent}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Completed / dismissed */}
        {completed.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[var(--g-text-tertiary)] uppercase tracking-wider">
              Completed
            </h3>
            {completed.map((step) => {
              const payload = (step.payload ?? {}) as Record<string, unknown>;
              const label = (payload.label as string) ?? step.actionType;
              return (
                <div key={step.id} className="flex items-center gap-2 px-3 py-2 opacity-60">
                  <CheckCircle className="size-3.5 text-green-500 shrink-0" />
                  <span className="text-xs text-[var(--g-text-secondary)] line-through truncate">{label}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">{step.status}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/* ── Feedback Modal ── */

function FeedbackModal({
  callId,
  grade,
  onClose,
}: {
  callId: number;
  grade: GradeInfo | null;
  onClose: () => void;
}) {
  const [feedbackType, setFeedbackType] = useState("grade_too_high");
  const [explanation, setExplanation] = useState("");
  const [suggestedGrade, setSuggestedGrade] = useState("");
  const submitMutation = trpc.calls.submitFeedback.useMutation({ onSuccess: onClose });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--g-text-primary)]">Submit Feedback</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--g-text-secondary)] mb-1 block">Type</label>
            <select
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value)}
              className="w-full rounded-md border border-[var(--g-border-subtle)] px-3 py-2 text-sm bg-white"
            >
              <option value="grade_too_high">Grade too high</option>
              <option value="grade_too_low">Grade too low</option>
              <option value="missed_criteria">Missed criteria</option>
              <option value="wrong_call_type">Wrong call type</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--g-text-secondary)] mb-1 block">
              Suggested Grade (optional)
            </label>
            <Input
              placeholder="e.g. B or 82"
              value={suggestedGrade}
              onChange={(e) => setSuggestedGrade(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--g-text-secondary)] mb-1 block">
              Explanation *
            </label>
            <Textarea
              placeholder="Explain why you disagree with the grade..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!explanation.trim() || submitMutation.isPending}
            onClick={() =>
              submitMutation.mutate({
                callId,
                feedbackType,
                explanation: explanation.trim(),
                suggestedGrade: suggestedGrade.trim() || undefined,
                originalScore: grade?.overallScore ?? undefined,
              })
            }
          >
            <Send className="size-3.5 mr-1.5" />
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Reclassify Modal ── */

function ReclassifyModal({
  callId,
  currentClassification,
  onClose,
}: {
  callId: number;
  currentClassification: string | null;
  onClose: () => void;
}) {
  const { classificationLabels } = useTenantConfig();
  const keys = Object.keys(classificationLabels);
  const [selected, setSelected] = useState(currentClassification ?? "");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const mutation = trpc.calls.updateClassification.useMutation({
    onSuccess: () => {
      void utils.calls.getById.invalidate({ id: callId });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--g-text-primary)]">Reclassify Call</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            {keys.map((key) => {
              const lbl = classificationLabels[key];
              const color = CLASSIFICATION_COLOR[lbl.color] ?? CLASSIFICATION_COLOR.gray;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all text-left",
                    selected === key
                      ? "border-[var(--g-accent)] bg-[var(--g-accent-soft)]"
                      : "border-[var(--g-border-subtle)] hover:bg-[var(--g-bg-surface)]",
                  )}
                >
                  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", color)}>
                    {lbl.label}
                  </span>
                  {selected === key && <CheckCircle className="size-3.5 text-[var(--g-accent)] ml-auto" />}
                </button>
              );
            })}
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--g-text-secondary)] mb-1 block">Reason (optional)</label>
            <Input
              placeholder="Why are you reclassifying?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!selected || mutation.isPending}
            onClick={() => mutation.mutate({ callId, classification: selected, reason: reason.trim() || undefined })}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
