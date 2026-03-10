import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Phone, MessageSquare, FileCheck, Calendar, DollarSign, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";

const KPI_METRICS = [
  { key: "calls", label: "Calls Made", icon: Phone },
  { key: "texts", label: "Texts Sent", icon: MessageSquare },
  { key: "offers", label: "Offers Made", icon: FileCheck },
  { key: "appointments", label: "Appointments Set", icon: Calendar },
  { key: "revenue", label: "Revenue Closed", icon: DollarSign },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function KpiPage() {
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
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--g-text-primary)" }}>
          <BarChart3 className="size-6" style={{ color: "var(--g-accent-text)" }} />
          KPIs
        </h1>
        <Skeleton className="h-10 w-64" />
        <Card className="overflow-hidden" style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
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
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--g-text-primary)" }}>
        <BarChart3 className="size-6" style={{ color: "var(--g-accent-text)" }} />
        KPIs
      </h1>

      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="month">This Month</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden" style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
        <CardContent className="p-6">
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--g-text-secondary)" }}>Funnel</h2>
          {funnel.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No funnel data yet"
              description="Funnel data will appear here as calls are graded and deals move through your pipeline."
            />
          ) : (
            <div className="space-y-3">
              {funnel.map((stage, i) => (
                <div key={stage.status} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div
                      className="h-10 rounded-lg flex items-center justify-end pr-2 transition-all shrink-0"
                      style={{
                        width: `${Math.max(15, (stage.count / maxFunnel) * 100)}%`,
                        background: "linear-gradient(90deg, var(--g-accent), var(--g-accent-light))",
                        opacity: 0.9 - i * 0.06,
                      }}
                    >
                      <span className="text-xs font-bold font-mono text-white tabular-nums">{stage.count}</span>
                    </div>
                    <span className="text-sm font-medium shrink-0" style={{ color: "var(--g-text-primary)" }}>{stage.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--g-text-secondary)" }}>Log Daily Numbers</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {KPI_METRICS.map(({ key, label, icon: Icon }) => (
            <Card key={key} style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4" style={{ color: "var(--g-accent-text)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>{label}</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0"
                    value={kpiValues[key] ?? ""}
                    onChange={(e) => setKpiValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="h-11 text-lg font-mono tabular-nums"
                    style={{ background: "var(--g-bg-surface)", borderColor: "var(--g-border-subtle)" }}
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
                <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                  Last: {lastValues[key] ?? "—"}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
          <CardContent className="pt-6">
            <div className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>Calls Graded</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--g-text-primary)" }}>{callStats.graded}</div>
            <div className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Avg {Math.round(callStats.avgScore)}</div>
          </CardContent>
        </Card>
        <Card style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
          <CardContent className="pt-6">
            <div className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>Total Calls</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--g-text-primary)" }}>{callStats.total}</div>
            <div className="text-sm" style={{ color: "var(--g-text-secondary)" }}>In period</div>
          </CardContent>
        </Card>
        <Card style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
          <CardContent className="pt-6">
            <div className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>Conversion Rate</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--g-text-primary)" }}>
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
            <div className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Lead → Closed</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
