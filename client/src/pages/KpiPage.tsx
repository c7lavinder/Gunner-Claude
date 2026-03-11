import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Phone, MessageSquare, FileCheck, Calendar, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";
import { useTenantConfig } from "@/hooks/useTenantConfig";

const DEFAULT_KPI_METRICS = [
  { key: "calls", label: "Calls Made" },
  { key: "texts", label: "Texts Sent" },
  { key: "offers", label: "Offers Made" },
  { key: "appointments", label: "Appointments Set" },
  { key: "revenue", label: "Revenue Closed" },
];

const KPI_ICON_MAP: Record<string, typeof Phone> = {
  calls: Phone,
  texts: MessageSquare,
  offers: FileCheck,
  appointments: Calendar,
  revenue: DollarSign,
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function KpiPage() {
  const { algorithm } = useTenantConfig();
  const kpiMetrics = (algorithm.kpiMetrics as Array<{ key: string; label: string }> | undefined) ?? DEFAULT_KPI_METRICS;
  const [period, setPeriod] = useState("week");
  const [kpiValues, setKpiValues] = useState<Record<string, string>>({});
  const today = todayStr();

  const { data: dashboard, isLoading: dashboardLoading } = trpc.kpi.getDashboard.useQuery({ period });
  const { data: entries, isLoading: entriesLoading } = trpc.kpi.getEntries.useQuery({ date: today });
  const saveMutation = trpc.kpi.saveEntry.useMutation();
  const utils = trpc.useUtils();

  const lastValues = useMemo(() => {
    const map: Record<string, string> = {};
    type Entry = { kpiType: string; notes: string | null; createdAt: Date };
    const byType = (entries ?? []).reduce<Record<string, Entry[]>>((acc, e) => {
      if (!acc[e.kpiType]) acc[e.kpiType] = [];
      acc[e.kpiType].push(e);
      return acc;
    }, {} as Record<string, Entry[]>);
    for (const [kpiType, list] of Object.entries(byType)) {
      const sorted = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const last = sorted[0];
      if (last?.notes) map[kpiType] = last.notes;
    }
    return map;
  }, [entries]);

  const funnel = dashboard?.funnel ?? [];
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));
  const callStats = dashboard?.callStats ?? { total: 0, graded: 0, avgScore: 0 };

  const handleSave = async (key: string) => {
    const val = kpiValues[key]?.trim();
    if (val === undefined) return;
    const num = parseInt(val, 10);
    if (isNaN(num) && val !== "") return;
    await saveMutation.mutateAsync({
      kpiType: key,
      date: today,
      notes: val,
    });
    setKpiValues((prev) => ({ ...prev, [key]: "" }));
    await utils.kpi.getEntries.invalidate({ date: today });
  };

  const isLoading = dashboardLoading || entriesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-[var(--g-text-primary)]">
          <BarChart3 className="size-6 text-[var(--g-accent-text)]" />
          KPIs
        </h1>
        <Skeleton className="h-10 w-64" />
        <Card className="overflow-hidden bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="p-6">
            <Skeleton className="h-4 w-20 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-[var(--g-text-primary)]">
        <BarChart3 className="size-6 text-[var(--g-accent-text)]" />
        KPIs
      </h1>

      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="month">This Month</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardContent className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-[var(--g-text-secondary)]">Funnel</h2>
          {funnel.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No funnel data yet"
              description="Funnel data will appear here as calls are graded and deals move through your pipeline."
            />
          ) : (
            <div className="space-y-2">
              {funnel.map((stage, i) => {
                const pct = Math.round((stage.count / maxFunnel) * 100);
                const barWidth = Math.max(15, pct);
                return (
                  <div key={stage.status} className="flex items-center gap-3">
                    <span
                      className="w-32 text-xs text-right shrink-0 text-[var(--g-text-secondary)] truncate"
                      title={stage.status ?? ""}
                    >
                      {stage.status}
                    </span>
                    <div className="flex-1 h-8 rounded-md bg-[var(--g-bg-inset)] overflow-hidden">
                      <div
                        className="h-full rounded-md flex items-center px-2 transition-all bg-[linear-gradient(90deg,var(--g-accent),var(--g-accent-light))]"
                        style={{ width: `${barWidth}%`, opacity: 0.9 - i * 0.06 }}
                      >
                        <span className="text-xs font-bold text-white tabular-nums">{pct}%</span>
                      </div>
                    </div>
                    <span className="w-10 text-xs font-mono tabular-nums text-right shrink-0 text-[var(--g-text-secondary)]">
                      {stage.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-3 text-[var(--g-text-secondary)]">Log Daily Numbers</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpiMetrics.map(({ key, label }) => {
            const Icon = KPI_ICON_MAP[key] ?? BarChart3;
            const currentNum = parseFloat(kpiValues[key] ?? "");
            const lastNum = parseFloat(lastValues[key] ?? "");
            const hasTrend = !isNaN(currentNum) && !isNaN(lastNum) && lastNum > 0 && currentNum !== lastNum;
            const pctChange = hasTrend ? Math.abs(((currentNum - lastNum) / lastNum) * 100) : 0;
            const trendUp = hasTrend && currentNum > lastNum;
            return (
              <Card key={key} className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-[var(--g-accent-text)]" />
                    <span className="text-sm font-medium text-[var(--g-text-primary)]">{label}</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="0"
                      value={kpiValues[key] ?? ""}
                      onChange={(e) => setKpiValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="h-11 text-lg font-mono tabular-nums bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
                    />
                    <Button
                      size="lg"
                      className="h-11 px-4"
                      onClick={() => handleSave(key)}
                      disabled={saveMutation.isPending}
                    >
                      Save
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--g-text-tertiary)]">
                    <span>Last: {lastValues[key] ?? "—"}</span>
                    {hasTrend && (
                      trendUp ? (
                        <span className="flex items-center gap-0.5 text-[var(--g-up)]">
                          <TrendingUp className="size-3" />
                          +{pctChange.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[var(--g-down)]">
                          <TrendingDown className="size-3" />
                          -{pctChange.toFixed(0)}%
                        </span>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="pt-6">
            <div className="text-xs font-medium text-[var(--g-text-tertiary)]">Calls Graded</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[var(--g-text-primary)]">{callStats.graded}</div>
            <div className="text-sm text-[var(--g-text-secondary)]">Avg {Math.round(callStats.avgScore)}</div>
          </CardContent>
        </Card>
        <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="pt-6">
            <div className="text-xs font-medium text-[var(--g-text-tertiary)]">Total Calls</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[var(--g-text-primary)]">{callStats.total}</div>
            <div className="text-sm text-[var(--g-text-secondary)]">In period</div>
          </CardContent>
        </Card>
        <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="pt-6">
            <div className="text-xs font-medium text-[var(--g-text-tertiary)]">Conversion Rate</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[var(--g-text-primary)]">
              {funnel.length > 0 ? (
                (() => {
                  const first = funnel[0]?.count ?? 0;
                  const last = funnel[funnel.length - 1]?.count ?? 0;
                  return first > 0 ? `${((last / first) * 100).toFixed(1)}%` : "0%";
                })()
              ) : (
                "—"
              )}
            </div>
            <div className="text-sm text-[var(--g-text-secondary)]">Lead → Closed</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
