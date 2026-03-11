import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Flame,
  Phone,
  MessageCircle,
  Calendar,
  Tag,
  FileCheck,
  Sparkles,
  Send,
  RefreshCw,
  PhoneMissed,
  CheckCircle2,
} from "lucide-react";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { trpc } from "@/lib/trpc";
import { KpiLedgerModal } from "@/components/KpiLedgerModal";

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

export function Today() {
  const { roles, kpiMetrics, isLoading: configLoading } = useTenantConfig();
  const [selectedRole, setSelectedRole] = useState("all");
  const [inboxTab, setInboxTab] = useState("inbox");
  const [ledgerKpi, setLedgerKpi] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [coachMessages, setCoachMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [coachInput, setCoachInput] = useState("");
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const { data: hubStats, isLoading: statsLoading } = trpc.today.getDayHubStats.useQuery({
    role: selectedRole === "all" ? undefined : selectedRole,
  });
  const { data: missedCalls } = trpc.today.getMissedCalls.useQuery();
  const { data: convos } = trpc.today.getConversations.useQuery({});
  const { data: taskData } = trpc.today.getTasks.useQuery();
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

  const isLoading = configLoading || statsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6 bg-[var(--g-bg-base)]">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[60%_40%]">
          <Skeleton className="h-[460px] rounded-xl" />
          <Skeleton className="h-[460px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 bg-[var(--g-bg-base)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Flame className="size-6 text-[var(--g-accent-text)]" />
          <h1 className="text-2xl font-bold text-[var(--g-text-primary)]">Day Hub</h1>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { code: "all", name: "All" },
              ...roles,
              { code: "admin", name: "ADMIN" },
            ].map((r) => (
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
          <span className="text-sm text-[var(--g-text-tertiary)]">
            {roleDescription(selectedRole)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void utils.today.getDayHubStats.invalidate()}
          >
            <RefreshCw className="size-4 text-[var(--g-text-tertiary)]" />
          </Button>
        </div>
      </div>

      {/* 5 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map(({ key, actual, target }) => {
          const Icon = KPI_ICONS[key] ?? Phone;
          const pct = target > 0 ? (actual / target) * 100 : 0;
          return (
            <Card
              key={key}
              className="cursor-pointer border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] hover:bg-[var(--g-bg-card-hover)] transition-colors overflow-hidden"
              onClick={() => setLedgerKpi(key)}
            >
              <CardContent className="p-4 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="size-4 text-[var(--g-accent-text)]" />
                  <span className="text-xs font-medium text-[var(--g-text-secondary)]">
                    {kpiLabel(key)}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-[var(--g-text-primary)]">{actual}</span>
                  <span className="text-sm text-[var(--g-text-tertiary)]">/ {target}</span>
                </div>
              </CardContent>
              <div className="h-1 bg-[var(--g-bg-inset)]">
                <div
                  className={cn("h-full transition-all", progressColor(pct))}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Two-panel layout */}
      <div className="grid gap-4 lg:grid-cols-[60%_40%]">
        {/* Left panel: Inbox / Today */}
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
          <Tabs value={inboxTab} onValueChange={setInboxTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-4 mt-4 mb-0 w-fit">
              <TabsTrigger value="inbox" className="text-sm gap-1.5">
                Inbox
                {missedCount > 0 && (
                  <Badge className="bg-[var(--g-down)] text-[var(--g-text-inverse)] text-[10px] px-1.5 py-0 leading-tight">
                    {missedCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="today" className="text-sm">Today</TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="flex-1 min-h-0 mt-0 p-4 pt-3">
              <ScrollArea className="h-[400px]">
                {/* Missed Calls */}
                {missedCalls && missedCalls.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-[var(--g-text-secondary)] mb-2 flex items-center gap-1.5">
                      <PhoneMissed className="size-3.5" />
                      Missed Calls
                    </p>
                    <div className="space-y-2">
                      {missedCalls.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--g-border-subtle)]">
                          <div>
                            <p className="text-sm font-medium text-[var(--g-text-primary)]">{m.contactName}</p>
                            <p className="text-xs text-[var(--g-text-tertiary)]">
                              {m.contactPhone}
                              {m.callTimestamp && ` · ${new Date(m.callTimestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                            </p>
                          </div>
                          <Button size="sm" variant="outline">
                            <Phone className="size-3.5 mr-1" /> Call Back
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conversations */}
                <div>
                  <p className="text-xs font-semibold text-[var(--g-text-secondary)] mb-2 flex items-center gap-1.5">
                    <MessageCircle className="size-3.5" />
                    Recent Conversations
                  </p>
                  {!convos?.length ? (
                    <p className="text-sm text-[var(--g-text-tertiary)] py-4">No conversations yet</p>
                  ) : (
                    <div className="space-y-1">
                      {convos.map((c) => (
                        <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--g-bg-surface)] transition-colors">
                          <div className="size-8 rounded-full bg-[var(--g-bg-inset)] flex items-center justify-center text-xs font-medium text-[var(--g-text-secondary)] shrink-0">
                            {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate text-[var(--g-text-primary)]">{c.name}</p>
                            <p className="text-xs text-[var(--g-text-tertiary)]">{c.phone}</p>
                          </div>
                          {c.lastContactDate && (
                            <span className="text-[10px] text-[var(--g-text-tertiary)] shrink-0">
                              {new Date(c.lastContactDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="today" className="flex-1 min-h-0 mt-0 p-4 pt-3">
              <ScrollArea className="h-[400px]">
                {!taskData?.tasks?.length ? (
                  <p className="text-sm text-[var(--g-text-tertiary)] py-4">No tasks for today</p>
                ) : (
                  <div className="space-y-1">
                    {taskData.tasks.map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg text-sm",
                          completedTasks.has(t.id) && "opacity-50"
                        )}
                      >
                        <Checkbox
                          checked={completedTasks.has(t.id)}
                          onCheckedChange={(v) => {
                            const done = !!v;
                            setCompletedTasks((s) =>
                              done
                                ? new Set(Array.from(s).concat(t.id))
                                : new Set(Array.from(s).filter((x) => x !== t.id))
                            );
                            completeTask.mutate(
                              { id: Number(t.id), completed: done },
                              { onSuccess: () => void utils.today.getTasks.invalidate() }
                            );
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-[var(--g-text-primary)]", completedTasks.has(t.id) && "line-through")}>
                            {t.title}
                          </p>
                          {t.contact && <p className="text-xs text-[var(--g-text-tertiary)]">{t.contact}</p>}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 text-xs"
                          onClick={() => {
                            setCompletedTasks((s) => new Set(Array.from(s).concat(t.id)));
                            completeTask.mutate(
                              { id: Number(t.id), completed: true },
                              { onSuccess: () => void utils.today.getTasks.invalidate() }
                            );
                          }}
                        >
                          <CheckCircle2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Right panel: AI Coach */}
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 p-4 pb-2">
            <Sparkles className="size-4 text-[var(--g-accent-text)]" />
            <h2 className="text-sm font-semibold text-[var(--g-text-primary)]">AI Coach</h2>
          </div>
          <ScrollArea className="flex-1 px-4 min-h-0 h-[360px]">
            <div className="space-y-3 py-2">
              {coachMessages.length === 0 && (
                <p className="text-sm text-[var(--g-text-tertiary)] py-8 text-center">
                  Ask your AI coach anything about today&apos;s performance.
                </p>
              )}
              {coachMessages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    msg.role === "user"
                      ? "ml-auto bg-[var(--g-accent)] text-[var(--g-text-inverse)]"
                      : "bg-[var(--g-bg-surface)] text-[var(--g-text-primary)]"
                  )}
                >
                  {msg.content}
                </div>
              ))}
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

      {/* KPI Ledger Modal */}
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
