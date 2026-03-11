import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Flame,
  Phone,
  MessageCircle,
  MessageSquare,
  Calendar,
  Tag,
  FileCheck,
  Sparkles,
  Send,
  RefreshCw,
  PhoneOff,
  Check,
  CheckSquare,
  GitBranch,
  CalendarPlus,
  StickyNote,
  ExternalLink,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { trpc } from "@/lib/trpc";
import { KpiLedgerModal } from "@/components/KpiLedgerModal";

/* ── constants ── */

const KPI_KEYS = ["calls", "convos", "apts", "offers", "contracts"] as const;

const KPI_ICONS: Record<string, typeof Phone> = {
  calls: Phone,
  convos: MessageCircle,
  apts: Calendar,
  offers: Tag,
  contracts: FileCheck,
};

const KPI_FALLBACK_LABELS: Record<string, string> = {
  calls: "Calls",
  convos: "Conversations",
  apts: "Appointments",
  offers: "Offers",
  contracts: "Contracts",
};

function progressColor(pct: number): string {
  if (pct >= 80) return "bg-[var(--g-up)]";
  if (pct >= 50) return "bg-[var(--g-warning-text)]";
  return "bg-[var(--g-down)]";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function relativeTime(ts: Date | string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const TASK_TYPE_COLORS: Record<string, string> = {
  new_lead: "bg-[var(--g-grade-a)] text-white",
  follow_up: "bg-[var(--g-grade-b)] text-white",
  rescheduled: "bg-[var(--g-grade-d)] text-white",
};

/* ── page ── */

export function Today() {
  const { roles, kpiMetrics, isLoading: configLoading } = useTenantConfig();
  const [selectedRole, setSelectedRole] = useState("all");
  const [leftTab, setLeftTab] = useState<"inbox" | "apts">("inbox");
  const [inboxSub, setInboxSub] = useState<"sms" | "missed">("sms");
  const [ledgerKpi, setLedgerKpi] = useState<string | null>(null);
  const [convoModal, setConvoModal] = useState<{ name: string; phone: string } | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [taskSearch, setTaskSearch] = useState("");
  const [coachMessages, setCoachMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [coachInput, setCoachInput] = useState("");
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const { data: hubStats, isLoading: statsLoading } = trpc.today.getDayHubStats.useQuery({
    role: selectedRole === "all" ? undefined : selectedRole,
  });
  const { data: missedCalls } = trpc.today.getMissedCalls.useQuery();
  const { data: convos } = trpc.today.getConversations.useQuery({});
  const { data: apts } = trpc.today.getAppointments.useQuery();
  const { data: taskData } = trpc.today.getTasks.useQuery();
  const { data: amPm } = trpc.today.getAmPmCallStatus.useQuery({});
  const completeTask = trpc.today.completeTask.useMutation();
  const chatMutation = trpc.ai.chat.useMutation();

  const missedCount = missedCalls?.length ?? 0;

  const kpiLabel = (key: string) =>
    kpiMetrics.find((m) => m.key === key)?.label ?? KPI_FALLBACK_LABELS[key] ?? key;

  const roleDescription = (code: string) => {
    if (code === "all") return "Overview of all team KPIs for today";
    if (code === "admin") return "Full admin view across all roles";
    const r = roles.find((rl) => rl.code === code);
    return r ? `${r.name} targets and activity` : "Today's activity";
  };

  const handleSendCoach = () => {
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
      }
    );
  };

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [coachMessages]);

  const statCards = KPI_KEYS.map((key) => {
    const stat = hubStats?.[key];
    return { key, actual: stat?.actual ?? 0, target: stat?.target ?? 1 };
  });

  const filteredTasks = (taskData?.tasks ?? []).filter((t) => {
    if (!taskSearch.trim()) return true;
    const q = taskSearch.toLowerCase();
    return t.title.toLowerCase().includes(q) || (t.contact?.toLowerCase().includes(q));
  });

  const isLoading = configLoading || statsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Skeleton className="h-[460px] rounded-xl" />
          <Skeleton className="h-[460px] rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══ ROW 1: Header + Role tabs ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Flame className="size-6 text-[var(--g-accent-text)]" />
          <h1 className="text-2xl font-bold text-[var(--g-text-primary)]">Day Hub</h1>
          <div className="flex gap-1.5 flex-wrap">
            {[{ code: "all", name: "All" }, ...roles, { code: "admin", name: "ADMIN" }].map((r) => (
              <button
                key={r.code}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  selectedRole === r.code
                    ? "bg-[var(--g-accent)] text-[var(--g-text-inverse)]"
                    : "bg-[var(--g-bg-surface)] text-[var(--g-text-secondary)] hover:bg-[var(--g-bg-elevated)]"
                )}
                onClick={() => setSelectedRole(r.code)}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--g-text-tertiary)]">{roleDescription(selectedRole)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void utils.today.getDayHubStats.invalidate()}>
            <RefreshCw className="size-4 text-[var(--g-text-tertiary)]" />
          </Button>
        </div>
      </div>

      {/* ═══ Stat Cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map(({ key, actual, target }) => {
          const Icon = KPI_ICONS[key] ?? Phone;
          const pct = target > 0 ? (actual / target) * 100 : 0;
          return (
            <motion.div key={key} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
              <Card
                className="cursor-pointer border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] hover:bg-[var(--g-bg-card-hover)] transition-colors overflow-hidden"
                onClick={() => setLedgerKpi(key)}
              >
                <CardContent className="p-4 pb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="size-4 text-[var(--g-accent-text)]" />
                    <span className="text-xs font-medium text-[var(--g-text-secondary)]">{kpiLabel(key)}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-[var(--g-text-primary)]">{actual}</span>
                    <span className="text-sm text-[var(--g-text-tertiary)]">/ {target}</span>
                  </div>
                </CardContent>
                <div className="h-1 bg-[var(--g-bg-inset)]">
                  <div className={cn("h-full transition-all", progressColor(pct))} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ═══ ROW 2: Two-panel layout ═══ */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* ── Left Panel: Inbox | Apts ── */}
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
          {/* Pill tabs */}
          <div className="flex items-center gap-2 px-4 pt-4">
            {(["inbox", "apts"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm transition-colors",
                  leftTab === tab
                    ? "bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] font-semibold border border-[var(--g-accent-medium)]"
                    : "text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)]"
                )}
              >
                {tab === "inbox" ? "Inbox" : "Apts"}
                {tab === "inbox" && missedCount > 0 && (
                  <Badge className="ml-1.5 bg-[var(--g-grade-b)] text-white rounded-full px-2 text-xs">{missedCount}</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Inbox content */}
          {leftTab === "inbox" && (
            <div className="flex flex-col flex-1 min-h-0 p-4 pt-3 gap-3">
              {/* Header row */}
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-[var(--g-text-primary)]">Communications</h2>
                {(convos?.length ?? 0) > 0 && (
                  <Badge className="bg-[var(--g-grade-b)] text-white rounded-full px-2 text-xs">{convos?.length}</Badge>
                )}
                <div className="flex-1" />
              </div>

              {/* Sub-tabs with animated indicator */}
              <div className="flex gap-4 border-b border-[var(--g-border-subtle)] relative">
                {(["sms", "missed"] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setInboxSub(sub)}
                    className={cn(
                      "pb-2 text-sm font-medium transition-colors relative",
                      inboxSub === sub ? "text-[var(--g-accent-text)]" : "text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)]"
                    )}
                  >
                    {sub === "sms" ? "SMS Messages" : "Missed Calls"}
                    {inboxSub === sub && (
                      <motion.div
                        layoutId="inbox-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--g-accent)]"
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* SMS Messages sub-tab */}
              <AnimatePresence mode="wait">
                {inboxSub === "sms" && (
                  <motion.div key="sms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0">
                    <ScrollArea className="max-h-[360px]">
                      {!convos?.length ? (
                        <p className="text-sm text-[var(--g-text-tertiary)] py-8 text-center">No conversations yet</p>
                      ) : (
                        <div className="space-y-2 pr-1">
                          {convos.map((c) => (
                            <motion.div
                              key={c.id}
                              whileHover={{ y: -1 }}
                              transition={{ duration: 0.15 }}
                              onClick={() => setConvoModal({ name: c.name, phone: c.phone })}
                              className="bg-[var(--g-bg-card)] border border-[var(--g-border-subtle)] rounded-xl px-4 py-3 cursor-pointer hover:border-[var(--g-accent-medium)] transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-full bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] flex items-center justify-center text-sm font-bold shrink-0">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-[var(--g-text-primary)] truncate">{c.name}</p>
                                    <span className="text-xs text-[var(--g-text-tertiary)] shrink-0 ml-2">
                                      {c.lastContactDate ? relativeTime(c.lastContactDate) : ""}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--g-text-tertiary)]">{c.phone}</p>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </motion.div>
                )}

                {/* Missed Calls sub-tab */}
                {inboxSub === "missed" && (
                  <motion.div key="missed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0">
                    <ScrollArea className="max-h-[360px]">
                      {!missedCalls?.length ? (
                        <div className="py-8 text-center space-y-2">
                          <Check className="size-6 mx-auto text-[var(--g-grade-a)]" />
                          <p className="text-sm text-[var(--g-text-secondary)]">No missed calls today</p>
                        </div>
                      ) : (
                        <div className="space-y-2 pr-1">
                          {missedCalls.map((m) => (
                            <motion.div
                              key={m.id}
                              whileHover={{ y: -1 }}
                              transition={{ duration: 0.15 }}
                              className="bg-[var(--g-bg-card)] border border-[var(--g-border-subtle)] rounded-xl px-4 py-3"
                            >
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-full bg-[var(--g-bg-inset)] flex items-center justify-center shrink-0">
                                  <PhoneOff className="size-4 text-[var(--g-grade-f)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[var(--g-text-primary)]">{m.contactName}</p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--g-text-tertiary)]">{m.contactPhone}</span>
                                    <span className="text-xs text-[var(--g-grade-f)]">Missed call</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-[var(--g-text-tertiary)]">
                                    {m.callTimestamp ? relativeTime(m.callTimestamp) : ""}
                                  </span>
                                  <Button size="sm" variant="outline" onClick={() => toast(`Calling ${m.contactName}...`)}>
                                    Call Back
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Apts content */}
          {leftTab === "apts" && (
            <div className="flex-1 min-h-0 p-4 pt-3">
              <ScrollArea className="max-h-[440px]">
                {!apts?.length ? (
                  <EmptyState icon={Calendar} title="No appointments today" description="Scheduled appointments will appear here." />
                ) : (
                  <div className="space-y-2 pr-1">
                    {apts.map((a) => (
                      <motion.div
                        key={a.id}
                        whileHover={{ y: -1 }}
                        transition={{ duration: 0.15 }}
                        className="bg-[var(--g-bg-card)] border border-[var(--g-border-subtle)] rounded-xl px-4 py-3 flex items-center gap-3"
                      >
                        <Badge className="bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] text-xs font-mono rounded px-2 py-0.5 shrink-0">
                          {a.time || "TBD"}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--g-text-primary)] truncate">{a.name}</p>
                          <p className="text-xs text-[var(--g-text-secondary)]">{a.type}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => toast("Prep view coming soon")}>
                          Prep
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </Card>

        {/* ── Right Panel: AI Coach ── */}
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 p-4 pb-2">
            <Sparkles className="size-4 text-[var(--g-accent-text)]" />
            <h2 className="text-sm font-semibold text-[var(--g-text-primary)]">AI Coach</h2>
          </div>

          {/* Quick action chips */}
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {["What should I focus on?", "Send an SMS to...", "Add a note"].map((chip) => (
              <button
                key={chip}
                onClick={() => { setCoachInput(chip); }}
                className="text-xs px-3 py-1 rounded-full border border-[var(--g-border-subtle)] text-[var(--g-text-secondary)] hover:text-[var(--g-accent-text)] hover:border-[var(--g-accent-medium)] transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 px-4 min-h-0 h-[300px]">
            <div className="space-y-3 py-2">
              {coachMessages.length === 0 && (
                <p className="text-sm text-[var(--g-text-tertiary)] py-8 text-center">
                  Ask your AI coach anything about today&apos;s performance.
                </p>
              )}
              <AnimatePresence>
                {coachMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap",
                      msg.role === "user"
                        ? "ml-auto bg-[var(--g-accent-soft)] rounded-2xl rounded-br-sm text-[var(--g-text-primary)]"
                        : "bg-[var(--g-bg-inset)] rounded-2xl rounded-bl-sm text-[var(--g-text-primary)]"
                    )}
                  >
                    {msg.content}
                  </motion.div>
                ))}
              </AnimatePresence>
              {chatMutation.isPending && (
                <div className="flex items-center gap-2 text-xs text-[var(--g-text-tertiary)]">
                  <div className="size-4 animate-spin rounded-full border-2 border-[var(--g-border-medium)] border-t-[var(--g-accent)]" />
                  Thinking...
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-[var(--g-border-subtle)] flex gap-2">
            <Input
              placeholder="Ask your coach..."
              value={coachInput}
              onChange={(e) => setCoachInput(e.target.value)}
              className="flex-1 h-8 text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendCoach()}
            />
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={handleSendCoach}
              disabled={!coachInput.trim() || chatMutation.isPending}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </Card>
      </div>

      {/* ═══ ROW 3: Task List — FULL WIDTH ═══ */}
      <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] overflow-hidden">
        <CardContent className="p-4 space-y-4">
          {/* Task header */}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-[var(--g-text-primary)]">Tasks</h2>
            <Badge variant="secondary" className="text-xs">{filteredTasks.length}</Badge>
            {taskData?.propertyAlerts ? (
              <Badge className="bg-[var(--g-grade-f)] text-white text-xs">{taskData.propertyAlerts} overdue</Badge>
            ) : null}
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--g-text-tertiary)]" />
              <Input
                placeholder="Search tasks or contacts..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="h-8 w-56 pl-8 text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
              />
            </div>
            {/* AM/PM pills */}
            <div className="flex gap-1.5">
              <Badge className={cn("text-[10px] px-2", amPm?.amDone ? "bg-[var(--g-grade-a)] text-white" : "bg-[var(--g-bg-inset)] text-[var(--g-text-tertiary)]")}>
                AM {amPm?.amDone ? "✓" : ""}
              </Badge>
              <Badge className={cn("text-[10px] px-2", amPm?.pmDone ? "bg-[var(--g-grade-a)] text-white" : "bg-[var(--g-bg-inset)] text-[var(--g-text-tertiary)]")}>
                PM {amPm?.pmDone ? "✓" : ""}
              </Badge>
            </div>
          </div>

          {/* Task list */}
          {!filteredTasks.length ? (
            <EmptyState icon={CheckSquare} title="All caught up" description="No tasks due today" />
          ) : (
            <div className="space-y-1">
              {filteredTasks.map((t, idx) => {
                const isExpanded = expandedTask === t.id;
                const isDone = completedTasks.has(t.id);
                const taskType = t.title.toLowerCase().includes("follow") ? "follow_up" : t.title.toLowerCase().includes("rescheduled") ? "rescheduled" : "new_lead";
                return (
                  <div key={t.id}>
                    <motion.div
                      whileHover={{ y: -1 }}
                      transition={{ duration: 0.1 }}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--g-bg-surface)]",
                        isDone && "opacity-50"
                      )}
                      onClick={() => setExpandedTask(isExpanded ? null : t.id)}
                    >
                      <span className="text-xs font-mono text-[var(--g-text-tertiary)] w-5 text-right shrink-0">{idx + 1}</span>
                      <Checkbox
                        checked={isDone}
                        onCheckedChange={(v) => {
                          const done = !!v;
                          setCompletedTasks((s) =>
                            done ? new Set(Array.from(s).concat(t.id)) : new Set(Array.from(s).filter((x) => x !== t.id))
                          );
                          completeTask.mutate(
                            { id: Number(t.id), completed: done },
                            { onSuccess: () => void utils.today.getTasks.invalidate() }
                          );
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Badge className={cn("text-[10px] px-1.5 shrink-0", TASK_TYPE_COLORS[taskType] ?? "bg-[var(--g-bg-inset)] text-[var(--g-text-secondary)]")}>
                        {taskType === "new_lead" ? "NEW LEAD" : taskType === "follow_up" ? "FOLLOW-UP" : "RESCHEDULED"}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate text-[var(--g-text-primary)]", isDone && "line-through")}>{t.title}</p>
                        {t.contact && <p className="text-xs text-[var(--g-text-tertiary)]">{t.contact}</p>}
                      </div>
                      {isExpanded ? <ChevronDown className="size-4 text-[var(--g-text-tertiary)] shrink-0" /> : <ChevronRight className="size-4 text-[var(--g-text-tertiary)] shrink-0" />}
                    </motion.div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="ml-8 pl-3 border-l-2 border-[var(--g-border-subtle)] pb-3 space-y-3">
                            {/* Instructions */}
                            <div className="text-sm text-[var(--g-text-secondary)] bg-[var(--g-bg-inset)] rounded-lg p-3">
                              {t.title}
                              {t.contact && <span className="block text-xs text-[var(--g-text-tertiary)] mt-1">Contact: {t.contact}</span>}
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2">
                              {[
                                { icon: Phone, label: "Call" },
                                { icon: MessageSquare, label: "Text" },
                                { icon: GitBranch, label: "Workflow" },
                                { icon: CalendarPlus, label: "Create Apt" },
                                { icon: StickyNote, label: "Add Note" },
                                { icon: ExternalLink, label: "View in CRM" },
                              ].map(({ icon: AIcon, label }) => (
                                <Button key={label} variant="outline" size="sm" onClick={() => toast(`${label} — coming soon`)}>
                                  <AIcon className="size-3.5 mr-1" /> {label}
                                </Button>
                              ))}
                            </div>

                            {/* Activity tabs placeholder */}
                            <div className="flex gap-4 text-xs text-[var(--g-text-tertiary)] border-t border-[var(--g-border-subtle)] pt-2">
                              <span className="text-[var(--g-accent-text)] font-medium">Today&apos;s Activity</span>
                              <span className="hover:text-[var(--g-text-secondary)] cursor-pointer">Upcoming</span>
                              <span className="hover:text-[var(--g-text-secondary)] cursor-pointer">Notes &amp; Calls</span>
                            </div>
                            <div className="space-y-2">
                              <div className="h-4 w-3/4 rounded bg-[var(--g-bg-inset)] animate-pulse" />
                              <div className="h-4 w-1/2 rounded bg-[var(--g-bg-inset)] animate-pulse" />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Conversation Modal ═══ */}
      <Dialog open={!!convoModal} onOpenChange={(o) => !o && setConvoModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{convoModal?.name ?? "Conversation"}</DialogTitle>
            <p className="text-xs text-[var(--g-text-tertiary)]">{convoModal?.phone}</p>
          </DialogHeader>
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <ScrollArea className="max-h-[300px] py-3 space-y-3">
                <div className="flex justify-start mb-3">
                  <div className="bg-[var(--g-bg-inset)] rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-[var(--g-text-primary)] max-w-[80%]">
                    No message history loaded yet.
                  </div>
                </div>
              </ScrollArea>
              <div className="flex gap-2 pt-3 border-t border-[var(--g-border-subtle)]">
                <Textarea
                  placeholder="Type a reply..."
                  className="flex-1 min-h-[60px] text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
                  disabled
                />
                <Button size="icon" disabled title="Reply via CRM — coming soon">
                  <Send className="size-4" />
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* ═══ KPI Ledger Modal ═══ */}
      {ledgerKpi && (
        <KpiLedgerModal
          kpiType={ledgerKpi}
          label={kpiLabel(ledgerKpi)}
          date={todayIso()}
          onClose={() => setLedgerKpi(null)}
        />
      )}
    </div>
  );
}
