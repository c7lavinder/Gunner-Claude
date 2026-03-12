import { useState, useMemo, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";

interface UseCallInboxParams {
  dateRange: string;
  callTypeFilter: string;
  gradeFilter: string;
  teamMemberIds: number[];
  outcome: string;
}

const NEEDS_REVIEW_STATUSES = new Set(["pending", "transcribing", "error", "failed_transcription"]);

export function useCallInboxData(params: UseCallInboxParams) {
  const [search, setSearch] = useState("");
  const [starred, setStarred] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const statusFilter =
    tab === "graded" ? "graded" : tab === "needs-review" ? "pending" : undefined;

  const dateFrom = useMemo(() => {
    if (params.dateRange === "all") return undefined;
    const d = new Date();
    d.setDate(d.getDate() - parseInt(params.dateRange, 10));
    return d.toISOString();
  }, [params.dateRange]);

  const { data: callsData, isLoading, isError } = trpc.calls.list.useQuery({
    page: currentPage,
    limit: 25,
    status: statusFilter,
    starred: tab === "starred" ? true : undefined,
    dateFrom,
    callType: params.callTypeFilter !== "All" ? params.callTypeFilter : undefined,
    teamMemberId: params.teamMemberIds.length === 1 ? params.teamMemberIds[0] : undefined,
    classification: params.outcome !== "All" ? params.outcome : undefined,
    gradeMin: params.gradeFilter === "All" ? undefined : gradeRanges[params.gradeFilter]?.[0],
    gradeMax: params.gradeFilter === "All" ? undefined : gradeRanges[params.gradeFilter]?.[1],
  });

  const toggleStarMutation = trpc.calls.toggleStar.useMutation();
  const { data: stats } = trpc.calls.getStats.useQuery();
  const utils = trpc.useUtils();

  const items = callsData?.items ?? [];

  // Seed starred state from server on page load / page change
  useEffect(() => {
    if (!items.length) return;
    setStarred((prev) => {
      const next = new Set(prev);
      items.forEach((c) => {
        if (c.isStarred) next.add(c.id);
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
          c.contactName?.toLowerCase().includes(q) ||
          c.teamMemberName?.toLowerCase().includes(q),
      );
    }
    if (tab === "starred") list = list.filter((c) => starred.has(c.id));
    return list;
  }, [items, search, tab, starred]);

  // Needs review: calls with pending/transcribing/error/failed_transcription status
  const needsReviewFiltered = useMemo(
    () => items.filter((c) => NEEDS_REVIEW_STATUSES.has(c.status ?? "")),
    [items],
  );

  // Skipped: calls that are archived or too short or have no recording
  const skippedFiltered = useMemo(
    () =>
      items.filter(
        (c) =>
          !c.recordingUrl ||
          (c.duration != null && c.duration < 60),
      ),
    [items],
  );

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

  const refreshStats = useCallback(() => {
    void utils.calls.getStats.invalidate();
    void utils.calls.list.invalidate();
  }, [utils]);

  const total = callsData?.total ?? 0;
  const limit = callsData?.limit ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    search, setSearch,
    starred,
    tab, setTab,
    currentPage, setCurrentPage,
    isLoading,
    isError,
    filtered,
    needsReviewFiltered,
    skippedFiltered,
    stats,
    totalPages,
    toggleStar,
    refreshStats,
  };
}

const gradeRanges: Record<string, [number, number]> = {
  A: [90, 100],
  B: [80, 89],
  C: [70, 79],
  D: [60, 69],
  F: [0, 59],
};
