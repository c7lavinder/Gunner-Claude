import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Phone,
  AlertTriangle,
  Archive,
  CloudDownload,
  RefreshCw,
  CheckCircle,
  Clock,
  User,
  ChevronDown,
  ChevronRight,
  Star,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageShell } from "@/components/layout/PageShell";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useCallInboxData } from "@/hooks/useCallInboxData";
import { CallFilters, type CallFilterState } from "@/components/callinbox/CallFilters";
import { CallCard, type CallItem } from "@/components/callinbox/CallCard";
import { CallsAiCoachPanel } from "@/components/callinbox/CallsAiCoachPanel";
import { trpc } from "@/lib/trpc";

export function CallInbox() {
  const { t } = useTenantConfig();

  const [filters, setFilters] = useState<CallFilterState>({
    dateRange: "7",
    teamMemberIds: [],
    callType: "All",
    outcome: "All",
    score: "All",
  });

  const d = useCallInboxData({
    dateRange: filters.dateRange,
    callTypeFilter: filters.callType,
    gradeFilter: filters.score,
    teamMemberIds: filters.teamMemberIds,
    outcome: filters.outcome,
  });

  // Derive tab counts
  const totalCount = d.stats?.total ?? 0;
  const needsReviewCount = d.needsReviewFiltered.length;
  const skippedCount = d.skippedFiltered.length;

  if (d.isError) {
    return (
      <PageShell title="Call History">
        <ErrorState onRetry={() => window.location.reload()} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Call History"
      description="Review calls, provide feedback, and get coaching advice"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--g-text-tertiary)] hidden sm:inline-flex items-center gap-1">
            <CloudDownload className="size-3" />
            Sync from CRM
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => d.refreshStats()}
          >
            <RefreshCw className="size-4 text-[var(--g-text-tertiary)]" />
          </Button>
        </div>
      }
    >
      {/* Two-column layout */}
      <div className="flex gap-4">
        {/* Left column — tabs + call list */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Pill tabs */}
          <div className="flex gap-1 bg-[var(--g-bg-surface)] rounded-lg p-1 border border-[var(--g-border-subtle)]">
            {(["all", "needs-review", "skipped"] as const).map((tabKey) => {
              const isActive = d.tab === tabKey;
              const label =
                tabKey === "all"
                  ? "All Calls"
                  : tabKey === "needs-review"
                    ? "Needs Review"
                    : "Skipped";
              const Icon =
                tabKey === "all"
                  ? Phone
                  : tabKey === "needs-review"
                    ? AlertTriangle
                    : Archive;
              const count =
                tabKey === "all"
                  ? totalCount
                  : tabKey === "needs-review"
                    ? needsReviewCount
                    : skippedCount;
              const countDisplay =
                tabKey === "skipped" && count > 100 ? "100+" : String(count);

              return (
                <button
                  key={tabKey}
                  onClick={() => {
                    d.setTab(tabKey);
                    d.setCurrentPage(1);
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    isActive
                      ? "bg-white shadow-sm text-[var(--g-text-primary)]"
                      : "text-[var(--g-text-tertiary)] hover:text-[var(--g-text-secondary)]",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4 leading-none",
                      isActive
                        ? "bg-[var(--g-accent-soft)] text-[var(--g-accent-text)]"
                        : "bg-[var(--g-bg-inset)] text-[var(--g-text-tertiary)]",
                    )}
                  >
                    {countDisplay}
                  </Badge>
                </button>
              );
            })}
          </div>

          {/* Filters — full filters for "all", date-only for others */}
          {d.tab === "all" && (
            <CallFilters filters={filters} onFilterChange={setFilters} />
          )}
          {(d.tab === "needs-review" || d.tab === "skipped") && (
            <CallFilters
              filters={{ ...filters, callType: "All", outcome: "All", score: "All", teamMemberIds: [] }}
              onFilterChange={(f) => setFilters({ ...filters, dateRange: f.dateRange })}
            />
          )}

          {/* Tab content */}
          {d.tab === "all" && (
            <AllCallsTab
              isLoading={d.isLoading}
              filtered={d.filtered}
              starred={d.starred}
              toggleStar={d.toggleStar}
              currentPage={d.currentPage}
              totalPages={d.totalPages}
              setCurrentPage={d.setCurrentPage}
            />
          )}

          {d.tab === "needs-review" && (
            <NeedsReviewTab calls={d.needsReviewFiltered} isLoading={d.isLoading} />
          )}

          {d.tab === "skipped" && (
            <SkippedTab
              calls={d.skippedFiltered}
              starred={d.starred}
              toggleStar={d.toggleStar}
              isLoading={d.isLoading}
            />
          )}
        </div>

        {/* Right column — AI Coach (hidden on mobile) */}
        <div className="hidden lg:block w-80 xl:w-96 shrink-0">
          <div className="sticky top-4">
            <CallsAiCoachPanel
              activeCallTypeFilter={filters.callType !== "All" ? filters.callType : undefined}
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/* ── All Calls Tab ── */

function AllCallsTab({
  isLoading,
  filtered,
  starred,
  toggleStar,
  currentPage,
  totalPages,
  setCurrentPage,
}: {
  isLoading: boolean;
  filtered: CallItem[];
  starred: Set<number>;
  toggleStar: (id: number, e: React.MouseEvent) => void;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (fn: (p: number) => number) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Phone}
        title="No calls yet"
        description="Connect your CRM to start importing and grading calls automatically."
        actionLabel="Go to Settings"
        onAction={() => window.location.assign("/settings")}
      />
    );
  }

  return (
    <>
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-2 pr-2">
          {filtered.map((call) => (
            <CallCard
              key={call.id}
              call={call as Parameters<typeof CallCard>[0]["call"]}
              isStarred={starred.has(call.id)}
              onToggleStar={(e) => toggleStar(call.id, e)}
            />
          ))}
        </div>
      </ScrollArea>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-[var(--g-text-secondary)]">
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
    </>
  );
}

/* ── Needs Review Tab ── */

interface ReviewCall {
  id: number;
  contactName: string | null;
  status: string | null;
  teamMemberName: string | null;
  duration: number | null;
}

function NeedsReviewTab({ calls, isLoading }: { calls: ReviewCall[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="All caught up"
        description="No calls need review right now. Processing calls, failed transcriptions, and flagged feedback will appear here."
      />
    );
  }

  return (
    <div className="space-y-1">
      {calls.map((call) => (
        <div
          key={call.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--g-bg-surface)] transition-colors"
        >
          <span className="font-medium text-sm text-[var(--g-text-primary)] truncate flex-1 min-w-0">
            {call.contactName ?? "Unknown"}
          </span>
          <StatusPill status={call.status} />
          <span className="text-xs text-[var(--g-text-tertiary)] flex items-center gap-1 shrink-0">
            <User className="size-3" />
            {call.teamMemberName ?? "\u2014"}
          </span>
          <span className="text-xs text-[var(--g-text-tertiary)] flex items-center gap-1 shrink-0">
            <Clock className="size-3" />
            {call.duration != null ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, "0")}` : "\u2014"}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const s = status ?? "pending";
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    transcribing: "bg-blue-100 text-blue-700",
    error: "bg-red-100 text-red-700",
    failed_transcription: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0", colors[s] ?? "bg-gray-100 text-gray-600")}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

/* ── Skipped Tab ── */

interface SkippedCall {
  id: number;
  contactName: string | null;
  teamMemberName: string | null;
  duration: number | null;
  recordingUrl: string | null;
}

function SkippedTab({
  calls,
  starred,
  toggleStar,
  isLoading,
}: {
  calls: SkippedCall[];
  starred: Set<number>;
  toggleStar: (id: number, e: React.MouseEvent) => void;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const regradeMutation = trpc.calls.regrade.useMutation();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="No skipped calls"
        description="Calls that are too short or have no recording will appear here."
      />
    );
  }

  const noRecording = calls.filter((c) => !c.recordingUrl);
  const tooShort = calls.filter((c) => c.recordingUrl && (c.duration ?? 0) < 60);
  const otherSkipped = calls.filter(
    (c) => c.recordingUrl && (c.duration ?? 0) >= 60,
  );

  const groups = [
    { label: "Auto-archived (no recording)", icon: Archive, items: noRecording },
    { label: "Too short", icon: Clock, items: tooShort },
    { label: "Other", icon: Archive, items: otherSkipped },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.label}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs font-medium text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)] transition-colors"
          >
            <group.icon className="size-3.5" />
            {group.label}
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {group.items.length}
            </Badge>
            <span className="flex-1" />
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            <span className="text-[var(--g-accent-text)] text-[10px]">Click to expand</span>
          </button>
          {expanded && (
            <div className="divide-y divide-[var(--g-border-subtle)]">
              {group.items.map((call) => {
                const dur = call.duration ?? 0;
                const hasRecording = !!call.recordingUrl;
                const reason = !hasRecording
                  ? "No recording available"
                  : `Call duration (${dur}s) is under 60s — too short for meaningful content`;
                const pillLabel = hasRecording ? "Too Short" : "No Recording";

                return (
                  <div
                    key={call.id}
                    className="flex items-start gap-3 px-3 py-3"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-[var(--g-text-primary)] truncate">
                          {call.contactName ?? "Unknown"}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                          {pillLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--g-text-tertiary)]">
                        <span className="inline-flex items-center gap-1">
                          <User className="size-3" />
                          {call.teamMemberName ?? "\u2014"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {dur > 0 ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}` : "\u2014"}
                        </span>
                      </div>
                      <p className="text-xs italic text-[var(--g-text-tertiary)]">{reason}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-[var(--g-text-tertiary)]">skipped</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => regradeMutation.mutate({ id: call.id })}
                        disabled={regradeMutation.isPending}
                      >
                        <CheckCircle className="size-3" />
                        Grade This Call
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => toggleStar(call.id, e)}
                      >
                        <Star
                          className={cn(
                            "size-3.5",
                            starred.has(call.id) && "fill-amber-400 text-amber-500",
                          )}
                        />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
