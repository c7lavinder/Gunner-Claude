import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine, Star, Play, Plus, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { CallTranscriptPanel } from "./CallTranscriptPanel";

function formatDuration(sec: number | null) {
  if (sec == null) return "\u2014";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelativeTime(ts: Date | string | null) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} hours ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)} days ago`;
  return d.toLocaleDateString();
}

function gradeColor(grade: number | null) {
  if (grade === null) return "bg-[var(--g-text-tertiary)]";
  if (grade >= 90) return "bg-[var(--g-grade-a)]";
  if (grade >= 75) return "bg-[var(--g-grade-b)]";
  if (grade >= 60) return "bg-[var(--g-grade-c)]";
  if (grade >= 45) return "bg-[var(--g-grade-d)]";
  return "bg-[var(--g-grade-f)]";
}

interface CallItem {
  id: number;
  contactName: string | null;
  callType: string | null;
  teamMemberName: string | null;
  callTimestamp: Date | string | null;
  duration: number | null;
  callDirection: string | null;
  overallScore: number | null;
  ghlContactId: string | null;
  isStarred?: string | boolean | null;
}

interface GradeData {
  overallScore: number | null;
  summary: string | null;
  criteriaScores: unknown;
  strengths: unknown;
  improvements: unknown;
  redFlags: unknown;
}

interface CallCardProps {
  call: CallItem;
  isExpanded: boolean;
  isStarred: boolean;
  onToggleExpand: () => void;
  onToggleStar: (e: React.MouseEvent) => void;
  resolveCallType: (code: string | null) => string;
  grade: GradeData | null;
  callDetail: { recordingUrl: string | null; transcript: string | null } | null;
  transcriptOpen: boolean;
  onTranscriptToggle: (open: boolean) => void;
  onTaskAction: () => void;
  onNoteAction: () => void;
}

export function CallCard({
  call, isExpanded, isStarred, onToggleExpand, onToggleStar,
  resolveCallType, grade, callDetail, transcriptOpen, onTranscriptToggle,
  onTaskAction, onNoteAction,
}: CallCardProps) {
  const { isAdmin } = useAuth();
  const utils = trpc.useUtils();
  const regradeMutation = trpc.calls.regrade.useMutation({
    onSuccess: () => {
      toast("Call queued for re-grading.");
      utils.calls.list.invalidate();
      utils.calls.getById.invalidate({ id: call.id });
    },
  });

  const score = call.overallScore ?? null;
  const criteriaScores = (grade?.criteriaScores as Array<{ name: string; earned: number; max: number }>) ?? [];
  const strengths = (grade?.strengths as string[]) ?? [];
  const improvements = (grade?.improvements as string[]) ?? [];

  return (
    <div>
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]",
          isExpanded && "ring-2 ring-[var(--g-accent)]",
        )}
        onClick={onToggleExpand}
      >
        <CardContent className="p-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold truncate text-[var(--g-text-primary)]">
                  {call.contactName ?? "Unknown"}
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {resolveCallType(call.callType)}
                </Badge>
              </div>
              <p className="text-xs mt-0.5 truncate text-[var(--g-text-tertiary)]">
                {call.teamMemberName ?? "\u2014"} · {formatRelativeTime(call.callTimestamp)}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm tabular-nums text-[var(--g-text-secondary)]">
                {formatDuration(call.duration)}
              </span>
              {(call.callDirection ?? "").toLowerCase() === "inbound" ? (
                <ArrowDownToLine className="size-4 text-[var(--g-text-tertiary)]" />
              ) : (
                <ArrowUpFromLine className="size-4 text-[var(--g-text-tertiary)]" />
              )}
              <div
                className={cn(
                  "size-10 rounded-full flex items-center justify-center font-mono font-bold text-sm text-white shrink-0",
                  gradeColor(score),
                )}
              >
                {score !== null ? Math.round(score) : "\u2014"}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleStar}
                className="h-7 w-7 shrink-0"
              >
                <Star className={cn("size-4", isStarred && "fill-amber-400 text-amber-500")} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isExpanded && grade && (
        <Card className="mt-2 bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("size-12 rounded-full flex items-center justify-center font-mono font-bold text-lg text-white", gradeColor(grade.overallScore ? Number(grade.overallScore) : null))}>
                  {grade.overallScore ? Math.round(Number(grade.overallScore)) : "\u2014"}
                </div>
                <p className="font-semibold text-[var(--g-text-primary)]">Scorecard</p>
              </div>
              <div className="flex gap-2">
                {callDetail?.recordingUrl ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={callDetail.recordingUrl} target="_blank" rel="noopener noreferrer">
                      <Play className="size-3.5 mr-1" /> Listen
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    <Play className="size-3.5 mr-1" /> No Recording
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); regradeMutation.mutate({ id: call.id }); }}
                    disabled={regradeMutation.isPending}
                  >
                    <RotateCcw className="size-3.5 mr-1" /> Re-grade
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={onTaskAction}>
                  <Plus className="size-3.5 mr-1" /> Task
                </Button>
                <Button variant="outline" size="sm" onClick={onNoteAction}>
                  <FileText className="size-3.5 mr-1" /> Note
                </Button>
              </div>
            </div>
            {(grade.redFlags as string[])?.length > 0 && (
              <div className="text-sm text-red-600 dark:text-red-400">
                <span className="font-medium">Critical: </span>
                {(grade.redFlags as string[]).join("; ")}
              </div>
            )}
            {criteriaScores.length > 0 && (
              <div className="space-y-2">
                {criteriaScores.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[var(--g-text-secondary)]">{c.name}</span>
                      <span className="text-[var(--g-text-tertiary)]">{c.earned}/{c.max}</span>
                    </div>
                    <Progress value={(c.earned / c.max) * 100} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}
            <Separator />
            <CallTranscriptPanel
              transcript={callDetail?.transcript ?? null}
              strengths={strengths}
              improvements={improvements}
              summary={grade.summary ?? null}
              isOpen={transcriptOpen}
              onToggle={onTranscriptToggle}
            />
          </CardContent>
        </Card>
      )}

      {isExpanded && !grade && (
        <Card className="mt-2 bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]">
          <CardContent className="p-4">
            <p className="text-sm text-[var(--g-text-tertiary)]">Not yet graded.</p>
            {callDetail?.recordingUrl ? (
              <Button variant="outline" size="sm" className="mt-2" asChild>
                <a href={callDetail.recordingUrl} target="_blank" rel="noopener noreferrer">
                  <Play className="size-3.5 mr-1" /> Listen
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="mt-2" disabled>
                <Play className="size-3.5 mr-1" /> No Recording
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
