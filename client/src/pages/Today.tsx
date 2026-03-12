import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Flame, Sparkles, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { KpiLedgerModal } from "@/components/KpiLedgerModal";
import { KpiStatCards } from "@/components/today/KpiStatCards";
import { DayHubInbox } from "@/components/today/DayHubInbox";
import { TaskList } from "@/components/today/TaskList";
import { useTodayData, todayIso } from "@/hooks/useTodayData";

export function Today() {
  const d = useTodayData();

  if (d.isLoading) {
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
      {/* ═══ Header + Role Tabs ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Flame className="size-6 text-[var(--g-accent-text)]" />
          <h1 className="text-2xl font-bold text-[var(--g-text-primary)]">Day Hub</h1>
          <div className="flex gap-1.5 flex-wrap">
            {[{ code: "all", name: "All" }, ...d.roles, { code: "admin", name: "ADMIN" }].map((r) => (
              <button
                key={r.code}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  d.selectedRole === r.code
                    ? "bg-[var(--g-accent)] text-[var(--g-text-inverse)]"
                    : "bg-[var(--g-bg-surface)] text-[var(--g-text-secondary)] hover:bg-[var(--g-bg-elevated)]",
                )}
                onClick={() => d.setSelectedRole(r.code)}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--g-text-tertiary)]">{d.roleDescription(d.selectedRole)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={d.refreshStats}>
            <RefreshCw className="size-4 text-[var(--g-text-tertiary)]" />
          </Button>
        </div>
      </div>

      {/* ═══ KPI Stat Cards ═══ */}
      <KpiStatCards cards={d.statCards} kpiLabel={d.kpiLabel} onClickCard={d.setLedgerKpi} />

      {/* ═══ Two-Panel Row ═══ */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <DayHubInbox
          conversations={d.convos}
          missedCalls={d.missedCalls}
          appointments={d.apts}
          leftTab={d.leftTab}
          setLeftTab={d.setLeftTab}
          inboxSub={d.inboxSub}
          setInboxSub={d.setInboxSub}
          selectedConv={d.convoModal}
          setSelectedConv={d.setConvoModal}
          onCallBack={(name) => toast(`Calling ${name}...`)}
          missedCount={d.missedCount}
        />
        <AiCoachPanel
          messages={d.coachMessages}
          input={d.coachInput}
          setInput={d.setCoachInput}
          onSend={d.handleSendCoach}
          isPending={d.chatIsPending}
          scrollEndRef={d.scrollEndRef}
        />
      </div>

      {/* ═══ Task List ═══ */}
      <TaskList
        tasks={d.filteredTasks}
        taskSearch={d.taskSearch}
        setTaskSearch={d.setTaskSearch}
        expandedTaskId={d.expandedTask}
        setExpandedTaskId={d.setExpandedTask}
        completedTasks={d.completedTasks}
        onComplete={d.handleCompleteTask}
        taskTypeColors={d.taskTypeColors}
        resolveTaskType={d.resolveTaskType}
        stages={d.stages}
        propertyAlerts={d.propertyAlerts}
        amPm={d.amPm}
      />

      {/* ═══ KPI Ledger Modal ═══ */}
      {d.ledgerKpi && (
        <KpiLedgerModal
          kpiType={d.ledgerKpi}
          label={d.kpiLabel(d.ledgerKpi)}
          date={todayIso()}
          onClose={() => d.setLedgerKpi(null)}
        />
      )}
    </div>
  );
}

/* ── Inline AI Coach Panel ── */

function AiCoachPanel({
  messages,
  input,
  setInput,
  onSend,
  isPending,
  scrollEndRef,
}: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  isPending: boolean;
  scrollEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 p-4 pb-2">
        <Sparkles className="size-4 text-[var(--g-accent-text)]" />
        <h2 className="text-sm font-semibold text-[var(--g-text-primary)]">AI Coach</h2>
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-2">
        {["What should I focus on?", "Send an SMS to...", "Add a note"].map((chip) => (
          <button
            key={chip}
            onClick={() => setInput(chip)}
            className="text-xs px-3 py-1 rounded-full border border-[var(--g-border-subtle)] text-[var(--g-text-secondary)] hover:text-[var(--g-accent-text)] hover:border-[var(--g-accent-medium)] transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 px-4 min-h-0 h-[300px]">
        <div className="space-y-3 py-2">
          {messages.length === 0 && (
            <p className="text-sm text-[var(--g-text-tertiary)] py-8 text-center">
              Ask your AI coach anything about today&apos;s performance.
            </p>
          )}
          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap",
                  msg.role === "user"
                    ? "ml-auto bg-[var(--g-accent-soft)] rounded-2xl rounded-br-sm text-[var(--g-text-primary)]"
                    : "bg-[var(--g-bg-inset)] rounded-2xl rounded-bl-sm text-[var(--g-text-primary)]",
                )}
              >
                {msg.content}
              </motion.div>
            ))}
          </AnimatePresence>
          {isPending && (
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 h-8 text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
        />
        <Button size="icon" className="h-8 w-8" onClick={onSend} disabled={!input.trim() || isPending}>
          <Send className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
