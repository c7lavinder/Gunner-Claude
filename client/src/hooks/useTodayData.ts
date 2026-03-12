import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantConfig } from "@/hooks/useTenantConfig";

/* ── constants ── */

export const KPI_KEYS = ["calls", "convos", "apts", "offers", "contracts"] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

const KPI_FALLBACK_LABELS: Record<string, string> = {
  calls: "Calls",
  convos: "Conversations",
  apts: "Appointments",
  offers: "Offers",
  contracts: "Contracts",
};

/* ── helpers ── */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function relativeTime(ts: Date | string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function progressColor(pct: number): string {
  if (pct >= 80) return "bg-[var(--g-up)]";
  if (pct >= 50) return "bg-[var(--g-warning-text)]";
  return "bg-[var(--g-down)]";
}

export function presenceDotColor(lastContactDate: Date | string | null | undefined): string {
  if (!lastContactDate) return "bg-gray-400";
  const diff = Date.now() - new Date(lastContactDate).getTime();
  if (diff < 3_600_000) return "bg-emerald-500";   // < 1hr = green
  if (diff < 86_400_000) return "bg-yellow-500";    // < 24hr = yellow
  return "bg-gray-400";                              // > 24hr = grey
}

/* ── stat card type ── */

export interface StatCard {
  key: KpiKey;
  actual: number;
  target: number;
}

/* ── chat message ── */

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

/* ── conversation type ── */

export interface ConvoItem {
  id: string;
  name: string;
  phone: string;
  ghlContactId?: string | null;
  lastContactDate?: Date | string | null;
  unreadCount?: number;
  propertyAddress?: string;
  currentStage?: string;
  lastMessageBody?: string;
}

/* ── task type ── */

export interface TaskItem {
  id: string;
  title: string;
  contact?: string;
  due?: string;
  propertyAddress?: string;
  currentStage?: string;
  assignedTo?: string;
  dueDate?: string;
}

/* ── hook ── */

export function useTodayData() {
  const config = useTenantConfig();
  const { roles, kpiMetrics, stages } = config;

  // ── UI state ──
  const [selectedRole, setSelectedRole] = useState("all");
  const [leftTab, setLeftTab] = useState<"inbox" | "apts">("inbox");
  const [inboxSub, setInboxSub] = useState<"sms" | "missed">("sms");
  const [ledgerKpi, setLedgerKpi] = useState<string | null>(null);
  const [convoModal, setConvoModal] = useState<ConvoItem | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [taskSearch, setTaskSearch] = useState("");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [coachInput, setCoachInput] = useState("");
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // ── tRPC queries ──
  const utils = trpc.useUtils();
  const { data: hubStats, isLoading: statsLoading } = trpc.today.getDayHubStats.useQuery({
    role: selectedRole === "all" ? undefined : selectedRole,
  });
  const { data: missedCalls } = trpc.today.getMissedCalls.useQuery();
  const { data: convos } = trpc.today.getConversations.useQuery({});
  const { data: apts } = trpc.today.getAppointments.useQuery();
  const { data: taskData } = trpc.today.getTasks.useQuery();
  const { data: amPm } = trpc.today.getAmPmCallStatus.useQuery({});

  // ── mutations ──
  const completeTaskMut = trpc.today.completeTask.useMutation();
  const chatMutation = trpc.ai.chat.useMutation();

  // ── derived ──
  const missedCount = missedCalls?.length ?? 0;
  const isLoading = config.isLoading || statsLoading;

  const kpiLabel = useCallback(
    (key: string) => kpiMetrics.find((m) => m.key === key)?.label ?? KPI_FALLBACK_LABELS[key] ?? key,
    [kpiMetrics],
  );

  const roleDescription = useCallback(
    (code: string) => {
      if (code === "all") return "Overview of all team KPIs for today";
      if (code === "admin") return "Full admin view across all roles";
      const r = roles.find((rl) => rl.code === code);
      return r ? `${r.name} targets and activity` : "Today's activity";
    },
    [roles],
  );

  const statCards: StatCard[] = useMemo(
    () =>
      KPI_KEYS.map((key) => {
        const stat = hubStats?.[key];
        return { key, actual: stat?.actual ?? 0, target: stat?.target ?? 1 };
      }),
    [hubStats],
  );

  // Build task type colors from stages (never hardcode stage codes)
  const taskTypeColors: Record<string, string> = useMemo(() => {
    const colors: Record<string, string> = {};
    const palette = [
      "bg-[var(--g-grade-a)] text-white",
      "bg-[var(--g-grade-b)] text-white",
      "bg-[var(--g-grade-d)] text-white",
      "bg-[var(--g-accent)] text-white",
      "bg-[var(--g-grade-c)] text-white",
    ];
    stages.forEach((s, i) => {
      colors[s.code] = palette[i % palette.length];
    });
    return colors;
  }, [stages]);

  const filteredTasks: TaskItem[] = useMemo(() => {
    const tasks = (taskData?.tasks ?? []) as TaskItem[];
    if (!taskSearch.trim()) return tasks;
    const q = taskSearch.toLowerCase();
    return tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.contact?.toLowerCase().includes(q),
    );
  }, [taskData, taskSearch]);

  // Resolve a task title to a stage code (best-effort match)
  const resolveTaskType = useCallback(
    (title: string): string => {
      const lower = title.toLowerCase();
      for (const s of stages) {
        if (lower.includes(s.code.replace(/_/g, " ")) || lower.includes(s.name.toLowerCase())) {
          return s.code;
        }
      }
      return stages[0]?.code ?? "unknown";
    },
    [stages],
  );

  const unreadTotal = useMemo(
    () => (convos ?? []).reduce((sum, c) => sum + ((c as ConvoItem).unreadCount ?? 0), 0),
    [convos],
  );

  // ── handlers ──
  const handleSendCoach = useCallback(() => {
    const msg = coachInput.trim();
    if (!msg) return;
    setCoachMessages((prev) => [...prev, { role: "user", content: msg }]);
    setCoachInput("");
    chatMutation.mutate(
      { message: msg, page: "today" },
      {
        onSuccess: (data) => {
          setCoachMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        },
      },
    );
  }, [coachInput, chatMutation]);

  const handleCompleteTask = useCallback(
    (taskId: string, done: boolean) => {
      setCompletedTasks((s) =>
        done
          ? new Set(Array.from(s).concat(taskId))
          : new Set(Array.from(s).filter((x) => x !== taskId)),
      );
      completeTaskMut.mutate(
        { id: Number(taskId), completed: done },
        { onSuccess: () => void utils.today.getTasks.invalidate() },
      );
    },
    [completeTaskMut, utils],
  );

  const refreshStats = useCallback(() => {
    void utils.today.getDayHubStats.invalidate();
  }, [utils]);

  // Auto-scroll coach
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [coachMessages]);

  return {
    // config
    roles,
    stages,
    kpiMetrics,
    isLoading,

    // role tabs
    selectedRole,
    setSelectedRole,
    roleDescription,

    // stat cards
    statCards,
    kpiLabel,

    // left panel
    leftTab,
    setLeftTab,
    inboxSub,
    setInboxSub,
    convos: (convos ?? []) as ConvoItem[],
    missedCalls: missedCalls ?? [],
    missedCount,
    apts: apts ?? [],
    convoModal,
    setConvoModal,
    unreadTotal,

    // tasks
    filteredTasks,
    taskSearch,
    setTaskSearch,
    expandedTask,
    setExpandedTask,
    completedTasks,
    handleCompleteTask,
    taskTypeColors,
    resolveTaskType,
    propertyAlerts: taskData?.propertyAlerts ?? 0,
    amPm,

    // coach
    coachMessages,
    coachInput,
    setCoachInput,
    handleSendCoach,
    chatIsPending: chatMutation.isPending,
    scrollEndRef,

    // ledger
    ledgerKpi,
    setLedgerKpi,

    // actions
    refreshStats,
  };
}
