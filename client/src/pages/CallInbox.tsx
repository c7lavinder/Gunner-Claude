import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ArrowDownToLine, ArrowUpFromLine, Star, Play, Plus, FileText, Phone } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ActionConfirmDialog } from "@/components/actions/ActionConfirmDialog";
import { useAction } from "@/hooks/useActions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { trpc } from "@/lib/trpc";

function formatDuration(sec: number | null) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelativeTime(ts: Date | string | null) {
  if (!ts) return "—";
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
  return "bg-[var(--g-grade-f)]";
}

export function CallInbox() {
  const { t } = useTenantConfig();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [starred, setStarred] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState("all");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState("7");
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ name: string; contactId: string } | null>(null);
  const { executeAction, isExecuting, result, reset } = useAction();

  const statusFilter =
    tab === "graded" ? "graded" : tab === "needs-review" ? "pending" : undefined;

  const dateFrom = useMemo(() => {
    if (dateRange === "all") return undefined;
    const d = new Date();
    d.setDate(d.getDate() - parseInt(dateRange, 10));
    return d.toISOString();
  }, [dateRange]);

  const { data: callsData, isLoading } = trpc.calls.list.useQuery({
    page: currentPage,
    limit: 25,
    status: statusFilter,
    starred: tab === "starred" ? true : undefined,
    dateFrom,
  });
  const toggleStarMutation = trpc.calls.toggleStar.useMutation();
  const { data: stats } = trpc.calls.getStats.useQuery();
  const { data: callDetail } = trpc.calls.getById.useQuery(
    { id: expandedId! },
    { enabled: !!expandedId }
  );

  const items = callsData?.items ?? [];

  // Seed starred state from server on page load / page change
  useEffect(() => {
    if (!items.length) return;
    setStarred((prev) => {
      const next = new Set(prev);
      items.forEach((c) => {
        if (c.isStarred === "true") next.add(c.id);
      });
      return next;
    });
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (c) =>
          (c.contactName?.toLowerCase().includes(q)) ||
          (c.teamMemberName?.toLowerCase().includes(q))
      );
    }
    if (tab === "starred") list = list.filter((c) => starred.has(c.id));
    return list;
  }, [items, search, tab, starred]);

  const toggleStar = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarred((s) => {
      const next = new Set(s);
      const nowStarred = !next.has(id);
      if (nowStarred) next.add(id);
      else next.delete(id);
      toggleStarMutation.mutate({ id, starred: nowStarred });
      return next;
    });
  };

  const total = callsData?.total ?? 0;
  const limit = callsData?.limit ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const grade = callDetail?.grade;
  const criteriaScores = (grade?.criteriaScores as Array<{ name: string; earned: number; max: number }>) ?? [];
  const coachImprovements = (grade?.improvements as string[]) ?? [];
  const coachStrengths = (grade?.strengths as string[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold" style={{ color: "var(--g-text-primary)" }}>
          Calls
        </h1>
        <Input
          placeholder={`Search ${t.contact.toLowerCase()} or caller...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-48 text-sm"
        />
        <div className="flex gap-2">
          <select
            className="h-8 rounded-md border px-2 text-xs"
            style={{ borderColor: "var(--g-border-subtle)", background: "var(--g-bg-surface)" }}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setCurrentPage(1); }}>
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs">All {stats ? `(${stats.total})` : ""}</TabsTrigger>
          <TabsTrigger value="needs-review" className="text-xs">Needs Review</TabsTrigger>
          <TabsTrigger value="graded" className="text-xs">Graded {stats ? `(${stats.graded})` : ""}</TabsTrigger>
          <TabsTrigger value="starred" className="text-xs">Starred</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="space-y-3 p-4 md:p-6">
              <Skeleton className="h-8 w-48" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Phone}
              title="No calls yet"
              description="Connect your CRM to start importing and grading calls automatically."
              actionLabel="Go to Settings"
              onAction={() => window.location.assign("/settings")}
            />
          ) : (
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="space-y-2 pr-4">
                {filtered.map((call) => {
                  const score = call.overallScore ?? null;
                  return (
                    <div key={call.id}>
                      <Card
                        className={cn(
                          "cursor-pointer transition-all hover:shadow-md",
                          expandedId === call.id && "ring-2 ring-[var(--g-accent)]"
                        )}
                        style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}
                        onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                      >
                        <CardContent className="p-4 py-3">
                          <div className="flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold truncate" style={{ color: "var(--g-text-primary)" }}>
                                  {call.contactName ?? "Unknown"}
                                </span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {call.callType ?? "—"}
                                </Badge>
                              </div>
                              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--g-text-tertiary)" }}>
                                {call.teamMemberName ?? "—"} · {formatRelativeTime(call.callTimestamp)}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm tabular-nums" style={{ color: "var(--g-text-secondary)" }}>
                                {formatDuration(call.duration)}
                              </span>
                              {(call.callDirection ?? "").toLowerCase() === "inbound" ? (
                                <ArrowDownToLine className="size-4" style={{ color: "var(--g-text-tertiary)" }} />
                              ) : (
                                <ArrowUpFromLine className="size-4" style={{ color: "var(--g-text-tertiary)" }} />
                              )}
                              <div
                                className={cn(
                                  "size-10 rounded-full flex items-center justify-center font-mono font-bold text-sm text-white shrink-0",
                                  gradeColor(score)
                                )}
                              >
                                {score !== null ? Math.round(score) : "—"}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => toggleStar(call.id, e)}
                                className="shrink-0"
                              >
                                <Star
                                  className={cn("size-4", starred.has(call.id) && "fill-amber-400 text-amber-500")}
                                />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {expandedId === call.id && grade && (
                        <Card className="mt-2" style={{ background: "var(--g-bg-surface)", borderColor: "var(--g-border-subtle)" }}>
                          <CardContent className="p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={cn("size-12 rounded-full flex items-center justify-center font-mono font-bold text-lg text-white", gradeColor(grade.overallScore ? Number(grade.overallScore) : null))}>
                                  {grade.overallScore ? Math.round(Number(grade.overallScore)) : "—"}
                                </div>
                                <div>
                                  <p className="font-semibold" style={{ color: "var(--g-text-primary)" }}>Scorecard</p>
                                  {grade.summary && (
                                    <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>{grade.summary}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {callDetail?.recordingUrl && (
                                  <Button variant="outline" size="sm" asChild>
                                    <a href={callDetail.recordingUrl} target="_blank" rel="noopener noreferrer">
                                      <Play className="size-3.5 mr-1" /> Listen
                                    </a>
                                  </Button>
                                )}
                                {!callDetail?.recordingUrl && (
                                  <Button variant="outline" size="sm" disabled>
                                    <Play className="size-3.5 mr-1" /> No Recording
                                  </Button>
                                )}
                                <Button variant="outline" size="sm" onClick={() => {
                                  setActionTarget({ name: call.contactName ?? "Unknown", contactId: call.ghlContactId ?? String(call.id) });
                                  setTaskDialogOpen(true);
                                }}>
                                  <Plus className="size-3.5 mr-1" /> Task
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => {
                                  setActionTarget({ name: call.contactName ?? "Unknown", contactId: call.ghlContactId ?? String(call.id) });
                                  setNoteDialogOpen(true);
                                }}>
                                  <FileText className="size-3.5 mr-1" /> Note
                                </Button>
                              </div>
                            </div>
                            {(grade.redFlags as string[])?.length > 0 && (
                              <div className="text-sm text-red-600 dark:text-red-400"><span className="font-medium">Critical: </span>{(grade.redFlags as string[]).join("; ")}</div>
                            )}
                            {criteriaScores.length > 0 && (
                              <div className="space-y-2">{criteriaScores.map((c) => (
                                <div key={c.name}>
                                  <div className="flex justify-between text-xs mb-1"><span style={{ color: "var(--g-text-secondary)" }}>{c.name}</span><span style={{ color: "var(--g-text-tertiary)" }}>{c.earned}/{c.max}</span></div>
                                  <Progress value={(c.earned / c.max) * 100} className="h-1.5" />
                                </div>
                              ))}</div>
                            )}
                            <Separator />
                            {(coachStrengths.length > 0 || coachImprovements.length > 0) && (
                              <div className="space-y-2">
                                {coachStrengths.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium mb-1" style={{ color: "var(--g-grade-a)" }}>Strengths</p>
                                    <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: "var(--g-text-secondary)" }}>{coachStrengths.map((s, idx) => <li key={idx}>{s}</li>)}</ul>
                                  </div>
                                )}
                                {coachImprovements.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium mb-1" style={{ color: "var(--g-text-secondary)" }}>Areas to improve</p>
                                    <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: "var(--g-text-secondary)" }}>{coachImprovements.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                                  </div>
                                )}
                              </div>
                            )}
                            <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
                              <CollapsibleTrigger className="flex items-center gap-1 text-sm" style={{ color: "var(--g-accent-text)" }}>
                                {transcriptOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                                Transcript
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <p className="mt-2 text-sm p-3 rounded-md" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}>
                                  {callDetail?.transcript || "No transcript available"}
                                </p>
                              </CollapsibleContent>
                            </Collapsible>
                          </CardContent>
                        </Card>
                      )}

                      {expandedId === call.id && !grade && (
                        <Card className="mt-2" style={{ background: "var(--g-bg-surface)", borderColor: "var(--g-border-subtle)" }}>
                          <CardContent className="p-4">
                            <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Not yet graded.</p>
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
                })}
              </div>
            </ScrollArea>
          )}
          {totalPages > 1 && !isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {actionTarget && (
        <>
          <ActionConfirmDialog
            open={taskDialogOpen}
            onOpenChange={(o) => { setTaskDialogOpen(o); if (!o) { setActionTarget(null); reset(); } }}
            action={{ type: "task", from: { name: "You" }, to: { name: actionTarget.name }, payload: {} }}
            onConfirm={() => executeAction("task", actionTarget.contactId, { title: `Follow up with ${actionTarget.name}` })}
            isExecuting={isExecuting}
            result={result}
          />
          <ActionConfirmDialog
            open={noteDialogOpen}
            onOpenChange={(o) => { setNoteDialogOpen(o); if (!o) { setActionTarget(null); reset(); } }}
            action={{ type: "note", from: { name: "You" }, to: { name: actionTarget.name }, payload: {} }}
            onConfirm={() => executeAction("note", actionTarget.contactId, { body: `Call review note for ${actionTarget.name}` })}
            isExecuting={isExecuting}
            result={result}
          />
        </>
      )}
    </div>
  );
}
