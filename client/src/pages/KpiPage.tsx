import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Phone, MessageSquare, FileCheck, Calendar, DollarSign } from "lucide-react";

const FUNNEL_STAGES = [
  { name: "New Leads", count: 45 },
  { name: "Contacted", count: 38, rate: 84 },
  { name: "Qualified", count: 22, rate: 58 },
  { name: "Offer", count: 12, rate: 55 },
  { name: "Under Contract", count: 5, rate: 42 },
  { name: "Closed", count: 3, rate: 60 },
];

const KPI_METRICS = [
  { key: "calls", label: "Calls Made", icon: Phone, lastValue: 24 },
  { key: "texts", label: "Texts Sent", icon: MessageSquare, lastValue: 156 },
  { key: "offers", label: "Offers Made", icon: FileCheck, lastValue: 8 },
  { key: "appointments", label: "Appointments Set", icon: Calendar, lastValue: 5 },
  { key: "revenue", label: "Revenue Closed", icon: DollarSign, lastValue: 12400 },
];

const MAX_FUNNEL = 45;

export function KpiPage() {
  const [period, setPeriod] = useState("week");
  const [kpiValues, setKpiValues] = useState<Record<string, string>>({});

  const handleSave = (key: string) => {
    setKpiValues((prev) => ({ ...prev, [key]: "" }));
  };

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
          <div className="space-y-3">
            {FUNNEL_STAGES.map((stage, i) => (
              <div key={stage.name} className="flex items-center gap-3">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div
                    className="h-10 rounded-lg flex items-center justify-end pr-2 transition-all shrink-0"
                    style={{
                      width: `${Math.max(15, (stage.count / MAX_FUNNEL) * 100)}%`,
                      background: "linear-gradient(90deg, var(--g-accent), var(--g-accent-light))",
                      opacity: 0.9 - i * 0.06,
                    }}
                  >
                    <span className="text-xs font-bold font-mono text-white tabular-nums">{stage.count}</span>
                  </div>
                  <span className="text-sm font-medium shrink-0" style={{ color: "var(--g-text-primary)" }}>{stage.name}</span>
                </div>
                {stage.rate !== undefined && (
                  <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: "var(--g-text-tertiary)" }}>{stage.rate}%</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--g-text-secondary)" }}>Log Daily Numbers</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {KPI_METRICS.map(({ key, label, icon: Icon, lastValue }) => (
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
                  <Button size="lg" className="h-11 px-4" onClick={() => handleSave(key)}>Save</Button>
                </div>
                <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Last: {lastValue}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
          <CardContent className="pt-6">
            <div className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>Calls Graded</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--g-text-primary)" }}>18</div>
            <div className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Avg 82</div>
          </CardContent>
        </Card>
        <Card style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
          <CardContent className="pt-6">
            <div className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>Response Time</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--g-text-primary)" }}>4.2m</div>
            <div className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Avg to new leads</div>
          </CardContent>
        </Card>
        <Card style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
          <CardContent className="pt-6">
            <div className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>Conversion Rate</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums" style={{ color: "var(--g-text-primary)" }}>6.7%</div>
            <div className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Lead → Closed</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
