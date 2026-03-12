import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAction } from "@/hooks/useActions";

export function useCallInboxData() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [starred, setStarred] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState("all");
  const [transcriptOpenId, setTranscriptOpenId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState("7");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [callTypeFilter, setCallTypeFilter] = useState("All");
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
    callType: callTypeFilter !== "All" ? callTypeFilter : undefined,
    gradeMin: gradeFilter === "All" ? undefined : gradeRanges[gradeFilter]?.[0],
    gradeMax: gradeFilter === "All" ? undefined : gradeRanges[gradeFilter]?.[1],
  });

  const toggleStarMutation = trpc.calls.toggleStar.useMutation();
  const { data: stats } = trpc.calls.getStats.useQuery();
  const { data: callDetail } = trpc.calls.getById.useQuery(
    { id: expandedId! },
    { enabled: !!expandedId },
  );

  const items = callsData?.items ?? [];

  // Seed starred state from server on page load / page change
  useEffect(() => {
    if (!items.length) return;
    setStarred((prev) => {
      const next = new Set(prev);
      items.forEach((c) => {
        if (!!c.isStarred) next.add(c.id);
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
  const criteriaScores =
    (grade?.criteriaScores as Array<{ name: string; earned: number; max: number }>) ?? [];
  const coachImprovements = (grade?.improvements as string[]) ?? [];
  const coachStrengths = (grade?.strengths as string[]) ?? [];

  return {
    search, setSearch,
    expandedId, setExpandedId,
    starred,
    tab, setTab,
    transcriptOpenId, setTranscriptOpenId,
    currentPage, setCurrentPage,
    dateRange, setDateRange,
    gradeFilter, setGradeFilter,
    callTypeFilter, setCallTypeFilter,
    noteDialogOpen, setNoteDialogOpen,
    taskDialogOpen, setTaskDialogOpen,
    actionTarget, setActionTarget,
    executeAction, isExecuting, result, reset,
    isLoading,
    filtered,
    callDetail,
    grade,
    criteriaScores,
    coachImprovements,
    coachStrengths,
    stats,
    totalPages,
    toggleStar,
  };
}

const gradeRanges: Record<string, [number, number]> = {
  A: [90, 100],
  B: [75, 89],
  C: [60, 74],
  D: [45, 59],
  F: [0, 44],
};
