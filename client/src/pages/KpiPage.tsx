import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  DollarSign, Users, Target, TrendingUp, TrendingDown, Minus,
  ArrowRight, Settings, AlertTriangle, Plus, Trash2, X, Edit,
  ChevronDown, ChevronUp, BarChart3, Filter, Loader2, Search,
  Layers, MapPin, Zap, CheckCircle2, XCircle, Eye, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// ─── HELPERS ───

function formatCurrency(cents: number): string {
  if (cents === 0) return "$0";
  const abs = Math.abs(cents);
  if (abs >= 100000000) return `${cents < 0 ? "-" : ""}$${(abs / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `${cents < 0 ? "-" : ""}$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatPercent(n: number): string {
  return `${n}%`;
}

function getRoiColor(roi: number): string {
  if (roi >= 300) return "#16a34a";
  if (roi >= 100) return "#ca8a04";
  return "#dc2626";
}

const PERIOD_LABELS: Record<string, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  ytd: "Year to Date",
  custom: "Custom Range",
};

// ─── MAIN COMPONENT ───

export default function KpiPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Filters
  const [period, setPeriod] = useState<"this_month" | "last_month" | "this_quarter" | "ytd" | "custom">("this_month");
  const [marketFilter, setMarketFilter] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("by_source");
  const [showSettings, setShowSettings] = useState(false);
  const [funnelDrilldown, setFunnelDrilldown] = useState<string | null>(null);

  // Queries
  const scoreboard = trpc.kpi.getPageScoreboard.useQuery({
    period,
    marketId: marketFilter,
    sourceId: sourceFilter,
  });

  const detailBySource = trpc.kpi.getDetailBySource.useQuery(
    { period, marketId: marketFilter },
    { enabled: detailTab === "by_source" }
  );

  const detailByMarket = trpc.kpi.getDetailByMarket.useQuery(
    { period, sourceId: sourceFilter },
    { enabled: detailTab === "by_market" }
  );

  const pivot = trpc.kpi.getSourceMarketPivot.useQuery(
    { period },
    { enabled: detailTab === "pivot" }
  );

  const dataQuality = trpc.kpi.getDataQuality.useQuery();

  const markets = trpc.kpi.getMarketsV2.useQuery();
  const sources = trpc.kpi.getSources.useQuery();

  const funnelProperties = trpc.kpi.getFunnelPropertyList.useQuery(
    { stage: funnelDrilldown as any, period, marketId: marketFilter, sourceId: sourceFilter },
    { enabled: !!funnelDrilldown }
  );

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold">Admin Access Required</h2>
          <p className="text-muted-foreground">This page is only available to administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header + Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KPI Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Marketing spend, pipeline funnel, and ROI tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[160px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_quarter">This Quarter</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
            </SelectContent>
          </Select>

          <Select value={marketFilter?.toString() || "all"} onValueChange={(v) => setMarketFilter(v === "all" ? null : Number(v))}>
            <SelectTrigger className="w-[160px] bg-card">
              <SelectValue placeholder="All Markets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              {markets.data?.map((m: any) => (
                <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceFilter?.toString() || "all"} onValueChange={(v) => setSourceFilter(v === "all" ? null : Number(v))}>
            <SelectTrigger className="w-[160px] bg-card">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {sources.data?.map((s: any) => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={() => setShowSettings(true)} title="KPI Settings">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Data Quality Warning */}
      {dataQuality.data && (dataQuality.data.missingSource > 0 || dataQuality.data.missingMarket > 0) && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            {dataQuality.data.missingSource > 0 && (
              <span className="font-medium">{dataQuality.data.missingSource} properties missing source</span>
            )}
            {dataQuality.data.missingSource > 0 && dataQuality.data.missingMarket > 0 && " | "}
            {dataQuality.data.missingMarket > 0 && (
              <span className="font-medium">{dataQuality.data.missingMarket} properties missing market</span>
            )}
            <span className="text-amber-700 dark:text-amber-400"> — Assign in Inventory for accurate KPI tracking</span>
          </p>
        </div>
      )}

      {/* Scoreboard Cards */}
      {scoreboard.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : scoreboard.data ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {scoreboard.data.cards.map((card: any) => (
            <ScoreboardCard key={card.label} card={card} />
          ))}
        </div>
      ) : null}

      {/* Funnel Visual */}
      {scoreboard.data && (
        <FunnelVisual
          funnel={scoreboard.data.funnel}
          onStageClick={(stage) => setFunnelDrilldown(stage)}
        />
      )}

      {/* Funnel Drilldown Dialog */}
      <FunnelDrilldownDialog
        stage={funnelDrilldown}
        properties={funnelProperties.data || []}
        isLoading={funnelProperties.isLoading}
        onClose={() => setFunnelDrilldown(null)}
      />

      {/* Detail Tables */}
      <div className="space-y-4">
        <Tabs value={detailTab} onValueChange={setDetailTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="by_source" className="gap-1.5">
              <Zap className="w-3.5 h-3.5" /> By Source
            </TabsTrigger>
            <TabsTrigger value="by_market" className="gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> By Market
            </TabsTrigger>
            <TabsTrigger value="pivot" className="gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Source × Market
            </TabsTrigger>
          </TabsList>

          <TabsContent value="by_source" className="mt-4">
            {detailBySource.isLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <DetailBySourceTable data={detailBySource.data || []} />
            )}
          </TabsContent>

          <TabsContent value="by_market" className="mt-4">
            {detailByMarket.isLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <DetailByMarketTable data={detailByMarket.data || []} />
            )}
          </TabsContent>

          <TabsContent value="pivot" className="mt-4">
            {pivot.isLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : pivot.data ? (
              <PivotTable data={pivot.data} />
            ) : null}
          </TabsContent>
        </Tabs>
      </div>

      {/* Settings Dialog */}
      {showSettings && (
        <KpiSettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

// ─── SCOREBOARD CARD ───

function ScoreboardCard({ card }: { card: any }) {
  const isCurrency = card.format === "currency";
  const displayValue = isCurrency ? formatCurrency(card.value) : formatNumber(card.value);
  const prevValue = isCurrency ? formatCurrency(card.previousValue) : formatNumber(card.previousValue);

  const trendColors = {
    up: { border: "border-emerald-200 dark:border-emerald-800", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
    down: { border: "border-red-200 dark:border-red-800", icon: TrendingDown, color: "text-red-600 dark:text-red-400" },
    neutral: { border: "border-border", icon: Minus, color: "text-muted-foreground" },
  };

  // For Spend, lower is better — invert the trend color
  const isSpend = card.label === "Spend";
  const effectiveTrend = isSpend
    ? (card.trend === "up" ? "down" : card.trend === "down" ? "up" : "neutral")
    : card.trend;

  const t = trendColors[effectiveTrend as keyof typeof trendColors] || trendColors.neutral;
  const TrendIcon = t.icon;

  return (
    <div className={`rounded-xl border ${t.border} bg-card p-3 space-y-1 transition-colors`}
      style={{ boxShadow: "var(--g-shadow-card)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
        <TrendIcon className={`w-3.5 h-3.5 ${t.color}`} />
      </div>
      <div className="text-xl font-bold tracking-tight">{displayValue}</div>
      {card.trend !== "neutral" && (
        <div className="text-[10px] text-muted-foreground">
          prev: {prevValue}
        </div>
      )}
    </div>
  );
}

// ─── FUNNEL VISUAL ───

function FunnelVisual({ funnel, onStageClick }: { funnel: any; onStageClick: (stage: string) => void }) {
  const stages = [
    { key: "leads", label: "Leads", value: funnel.leads, color: "#3b82f6" },
    { key: "apts", label: "Apts", value: funnel.apts, color: "#6366f1" },
    { key: "offers", label: "Offers", value: funnel.offers, color: "#f59e0b" },
    { key: "contracts", label: "Contracts", value: funnel.contracts, color: "#22c55e" },
    { key: "closed", label: "Closed", value: funnel.closed, color: "#10b981" },
  ];

  const maxVal = Math.max(...stages.map(s => s.value), 1);

  return (
    <div className="rounded-xl border bg-card p-5" style={{ boxShadow: "var(--g-shadow-card)" }}>
      <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Pipeline Funnel</h3>
      <div className="flex items-end gap-2">
        {stages.map((stage, i) => {
          const pct = (stage.value / maxVal) * 100;
          const convRate = i > 0 && stages[i - 1].value > 0
            ? Math.round((stage.value / stages[i - 1].value) * 100)
            : null;

          return (
            <div key={stage.key} className="flex-1 flex flex-col items-center gap-1">
              {/* Conversion arrow */}
              {i > 0 && convRate !== null && (
                <div className="text-[10px] font-medium text-muted-foreground mb-1">
                  {convRate}%
                </div>
              )}
              {i === 0 && <div className="text-[10px] mb-1">&nbsp;</div>}

              {/* Bar */}
              <button
                onClick={() => onStageClick(stage.key)}
                className="w-full rounded-lg transition-all hover:opacity-80 cursor-pointer relative group"
                style={{
                  backgroundColor: stage.color + "20",
                  height: `${Math.max(pct * 1.5, 32)}px`,
                  minHeight: "32px",
                }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-lg transition-all"
                  style={{
                    backgroundColor: stage.color,
                    height: `${Math.max(pct, 10)}%`,
                    opacity: 0.8,
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold"
                  style={{ color: pct > 40 ? "#fff" : stage.color }}>
                  {stage.value}
                </span>
              </button>

              {/* Label */}
              <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-3 text-center">Click any stage to see property details</p>
    </div>
  );
}

// ─── FUNNEL DRILLDOWN DIALOG ───

function FunnelDrilldownDialog({ stage, properties, isLoading, onClose }: {
  stage: string | null;
  properties: any[];
  isLoading: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return properties;
    const q = search.toLowerCase();
    return properties.filter((p: any) =>
      (p.address || "").toLowerCase().includes(q) ||
      (p.sellerName || "").toLowerCase().includes(q) ||
      (p.city || "").toLowerCase().includes(q)
    );
  }, [properties, search]);

  const stageLabels: Record<string, string> = {
    leads: "Leads",
    apts: "Appointments Set",
    offers: "Offers Made",
    contracts: "Under Contract",
    closed: "Closed Deals",
  };

  return (
    <Dialog open={!!stage} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{stageLabels[stage || ""] || "Properties"}</DialogTitle>
          <DialogDescription>
            {filtered.length} properties in this stage
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search address, seller, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No properties found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3 font-medium text-muted-foreground">Address</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Seller</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Contract</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Spread</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: any) => {
                  const spread = p.acceptedOffer && p.contractPrice
                    ? p.acceptedOffer - p.contractPrice
                    : null;
                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3">
                        <div className="font-medium">{p.address}</div>
                        <div className="text-xs text-muted-foreground">{p.city}, {p.state}</div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{p.sellerName || "—"}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs capitalize">
                          {(p.status || "").replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">
                        {p.contractPrice ? formatCurrency(p.contractPrice) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">
                        {spread !== null ? (
                          <span style={{ color: spread > 0 ? "#16a34a" : "#dc2626" }}>
                            {formatCurrency(spread)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── DETAIL BY SOURCE TABLE ───

function DetailBySourceTable({ data }: { data: any[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        <Zap className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>No sources configured yet. Add sources in Settings to track performance.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden" style={{ boxShadow: "var(--g-shadow-card)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="py-2.5 px-3 text-left font-medium text-muted-foreground">Source</th>
              <th className="py-2.5 px-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Spend</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Vol</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Leads</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Apts</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Offers</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Contracts</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Closed</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Revenue</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">CPL</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">ROI</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: any, i: number) => (
              <tr key={row.sourceId || `unassigned-${i}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-2 px-3 font-medium">{row.sourceName}</td>
                <td className="py-2 px-3">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {row.sourceType}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right font-mono text-xs">{formatCurrency(row.spend)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.volume || "—"}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.leads}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">
                  {row.apts}
                  {row.aptRate > 0 && <span className="text-muted-foreground ml-1">({row.aptRate}%)</span>}
                </td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.offers}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.contracts}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.closed}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{formatCurrency(row.revenue)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.cpl ? formatCurrency(row.cpl) : "—"}</td>
                <td className="py-2 px-3 text-right font-mono text-xs font-semibold" style={{ color: row.roi ? getRoiColor(row.roi) : undefined }}>
                  {row.roi ? `${row.roi}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DETAIL BY MARKET TABLE ───

function DetailByMarketTable({ data }: { data: any[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>No markets configured yet. Add markets in Settings to track by geography.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden" style={{ boxShadow: "var(--g-shadow-card)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="py-2.5 px-3 text-left font-medium text-muted-foreground">Market</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Spend</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Vol</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Leads</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Apts</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Offers</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Contracts</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Closed</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Revenue</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">CPL</th>
              <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">ROI</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: any) => (
              <tr key={row.marketId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-2 px-3 font-medium">
                  {row.marketName}
                  {row.isGlobal ? <Globe className="w-3 h-3 inline ml-1 text-muted-foreground" /> : null}
                </td>
                <td className="py-2 px-3 text-right font-mono text-xs">{formatCurrency(row.spend)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.volume || "—"}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.leads}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">
                  {row.apts}
                  {row.aptRate > 0 && <span className="text-muted-foreground ml-1">({row.aptRate}%)</span>}
                </td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.offers}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.contracts}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.closed}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{formatCurrency(row.revenue)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{row.cpl ? formatCurrency(row.cpl) : "—"}</td>
                <td className="py-2 px-3 text-right font-mono text-xs font-semibold" style={{ color: row.roi ? getRoiColor(row.roi) : undefined }}>
                  {row.roi ? `${row.roi}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PIVOT TABLE ───

function PivotTable({ data }: { data: any }) {
  if (!data.sources.length || !data.markets.length) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>Configure both sources and markets in Settings to see the pivot view.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden" style={{ boxShadow: "var(--g-shadow-card)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="py-2.5 px-3 text-left font-medium text-muted-foreground sticky left-0 bg-muted/30 z-10">Source</th>
              {data.markets.map((m: any) => (
                <th key={m.id} colSpan={4} className="py-2.5 px-2 text-center font-medium text-muted-foreground border-l">
                  {m.name}
                </th>
              ))}
            </tr>
            <tr className="border-b bg-muted/20">
              <th className="py-1.5 px-3 sticky left-0 bg-muted/20 z-10"></th>
              {data.markets.map((m: any) => (
                <>
                  <th key={`${m.id}-l`} className="py-1.5 px-1 text-center text-[10px] text-muted-foreground border-l">Leads</th>
                  <th key={`${m.id}-c`} className="py-1.5 px-1 text-center text-[10px] text-muted-foreground">Contracts</th>
                  <th key={`${m.id}-s`} className="py-1.5 px-1 text-center text-[10px] text-muted-foreground">Spend</th>
                  <th key={`${m.id}-r`} className="py-1.5 px-1 text-center text-[10px] text-muted-foreground">Revenue</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s: any) => (
              <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-2 px-3 font-medium sticky left-0 bg-card z-10">{s.name}</td>
                {data.markets.map((m: any) => {
                  const cell = data.cells[`${s.id}_${m.id}`] || { leads: 0, contracts: 0, spend: 0, revenue: 0 };
                  return (
                    <>
                      <td key={`${s.id}-${m.id}-l`} className="py-2 px-1 text-center font-mono text-xs border-l">{cell.leads}</td>
                      <td key={`${s.id}-${m.id}-c`} className="py-2 px-1 text-center font-mono text-xs">{cell.contracts}</td>
                      <td key={`${s.id}-${m.id}-s`} className="py-2 px-1 text-center font-mono text-xs">{formatCurrency(cell.spend)}</td>
                      <td key={`${s.id}-${m.id}-r`} className="py-2 px-1 text-center font-mono text-xs">{formatCurrency(cell.revenue)}</td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── KPI SETTINGS DIALOG ───

function KpiSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState("markets");

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>KPI Settings</DialogTitle>
          <DialogDescription>Configure markets, sources, and monthly spend/volume</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="bg-muted/50 shrink-0">
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="spend">Spend & Volume</TabsTrigger>
            <TabsTrigger value="backfill">Backfill</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-4">
            <TabsContent value="markets" className="mt-0">
              <MarketsSettings />
            </TabsContent>
            <TabsContent value="sources" className="mt-0">
              <SourcesSettings />
            </TabsContent>
            <TabsContent value="spend" className="mt-0">
              <SpendVolumeSettings />
            </TabsContent>
            <TabsContent value="backfill" className="mt-0">
              <BackfillSettings />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── MARKETS SETTINGS ───

function MarketsSettings() {
  const utils = trpc.useUtils();
  const markets = trpc.kpi.getMarketsV2.useQuery({ activeOnly: false });
  const createMarket = trpc.kpi.createMarketV2.useMutation({
    onSuccess: () => { utils.kpi.getMarketsV2.invalidate(); toast.success("Market created"); },
  });
  const updateMarket = trpc.kpi.updateMarketV2.useMutation({
    onSuccess: () => { utils.kpi.getMarketsV2.invalidate(); toast.success("Market updated"); },
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newZips, setNewZips] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editZips, setEditZips] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMarket.mutate({
      name: newName.trim(),
      zipCodes: newZips.split(",").map(z => z.trim()).filter(Boolean),
    });
    setNewName("");
    setNewZips("");
    setShowAdd(false);
  };

  const handleUpdate = () => {
    if (!editId || !editName.trim()) return;
    updateMarket.mutate({
      id: editId,
      name: editName.trim(),
      zipCodes: editZips.split(",").map(z => z.trim()).filter(Boolean),
    });
    setEditId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Markets group properties by geography. Assign zip codes for auto-tagging.</p>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Market
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <div>
            <Label className="text-xs">Market Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Nashville" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Zip Codes (comma separated)</Label>
            <Input value={newZips} onChange={(e) => setNewZips(e.target.value)} placeholder="37201, 37202, 37203" className="mt-1" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createMarket.isPending}>
              {createMarket.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {markets.data?.map((m: any) => (
          <div key={m.id} className="border rounded-lg p-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
            {editId === m.id ? (
              <div className="flex-1 space-y-2">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                <Input value={editZips} onChange={(e) => setEditZips(e.target.value)} placeholder="Zip codes" className="h-8" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleUpdate} disabled={updateMarket.isPending}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {m.name}
                    {m.isGlobal ? <Badge variant="outline" className="text-[10px]">Global</Badge> : null}
                    {m.isActive === "false" && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {m.isGlobal && (
                    <div className="text-xs text-muted-foreground mt-0.5">Catches all zip codes not assigned to other markets</div>
                  )}
                  {!m.isGlobal && m.zipCodes && Array.isArray(m.zipCodes) && m.zipCodes.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Zips: {(m.zipCodes as string[]).slice(0, 8).join(", ")}
                      {(m.zipCodes as string[]).length > 8 && ` +${(m.zipCodes as string[]).length - 8} more`}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    setEditId(m.id);
                    setEditName(m.name);
                    setEditZips(Array.isArray(m.zipCodes) ? (m.zipCodes as string[]).join(", ") : "");
                  }}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  {!m.isGlobal && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                      updateMarket.mutate({ id: m.id, isActive: m.isActive === "true" ? "false" : "true" });
                    }}>
                      {m.isActive === "true" ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SOURCES SETTINGS ───

function SourcesSettings() {
  const utils = trpc.useUtils();
  const sources = trpc.kpi.getSources.useQuery({ activeOnly: false });
  const createSource = trpc.kpi.createSource.useMutation({
    onSuccess: () => { utils.kpi.getSources.invalidate(); toast.success("Source created"); },
  });
  const updateSource = trpc.kpi.updateSource.useMutation({
    onSuccess: () => { utils.kpi.getSources.invalidate(); toast.success("Source updated"); },
  });
  const deleteSource = trpc.kpi.deleteSource.useMutation({
    onSuccess: () => { utils.kpi.getSources.invalidate(); toast.success("Source deactivated"); },
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"outbound" | "inbound">("outbound");
  const [newTracksVolume, setNewTracksVolume] = useState(false);
  const [newVolumeLabel, setNewVolumeLabel] = useState("");
  const [newGhlMapping, setNewGhlMapping] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createSource.mutate({
      name: newName.trim(),
      type: newType,
      tracksVolume: newTracksVolume,
      volumeLabel: newVolumeLabel || undefined,
      ghlSourceMapping: newGhlMapping || undefined,
    });
    setNewName("");
    setNewType("outbound");
    setNewTracksVolume(false);
    setNewVolumeLabel("");
    setNewGhlMapping("");
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Sources track where leads come from. Map GHL opportunity sources for auto-assignment.</p>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Source
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Source Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cold Calling" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">GHL Source Mapping (match opportunity.source value)</Label>
            <Input value={newGhlMapping} onChange={(e) => setNewGhlMapping(e.target.value)} placeholder="e.g. Cold Call" className="mt-1" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={newTracksVolume} onCheckedChange={setNewTracksVolume} />
            <Label className="text-xs">Tracks Volume (e.g. postcards sent, calls dialed)</Label>
          </div>
          {newTracksVolume && (
            <div>
              <Label className="text-xs">Volume Label</Label>
              <Input value={newVolumeLabel} onChange={(e) => setNewVolumeLabel(e.target.value)} placeholder="e.g. Postcards Sent" className="mt-1" />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createSource.isPending}>
              {createSource.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sources.data?.map((s: any) => (
          <div key={s.id} className="border rounded-lg p-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
            <div>
              <div className="font-medium flex items-center gap-2">
                {s.name}
                <Badge variant="outline" className="text-[10px] capitalize">{s.type}</Badge>
                {s.tracksVolume && <Badge variant="secondary" className="text-[10px]">Vol: {s.volumeLabel || "Count"}</Badge>}
                {!s.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
              </div>
              {s.ghlSourceMapping && (
                <div className="text-xs text-muted-foreground mt-0.5">GHL: {s.ghlSourceMapping}</div>
              )}
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                if (s.isActive) {
                  deleteSource.mutate({ id: s.id });
                } else {
                  updateSource.mutate({ id: s.id, isActive: true });
                }
              }}>
                {s.isActive ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SPEND & VOLUME SETTINGS ───

function SpendVolumeSettings() {
  const utils = trpc.useUtils();
  const markets = trpc.kpi.getMarketsV2.useQuery();
  const sources = trpc.kpi.getSources.useQuery();

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const spendData = trpc.kpi.getSpendForMonth.useQuery({ month });
  const volumeData = trpc.kpi.getVolumeForMonth.useQuery({ month });

  const upsertSpend = trpc.kpi.upsertSpend.useMutation({
    onSuccess: () => { utils.kpi.getSpendForMonth.invalidate(); toast.success("Spend saved"); },
  });
  const upsertVolume = trpc.kpi.upsertVolume.useMutation({
    onSuccess: () => { utils.kpi.getVolumeForMonth.invalidate(); toast.success("Volume saved"); },
  });

  // Build lookup maps
  const spendMap = useMemo(() => {
    const map: Record<string, number> = {};
    spendData.data?.forEach((s: any) => {
      map[`${s.sourceId}_${s.marketId}`] = s.amount;
    });
    return map;
  }, [spendData.data]);

  const volumeMap = useMemo(() => {
    const map: Record<string, number> = {};
    volumeData.data?.forEach((v: any) => {
      map[`${v.sourceId}_${v.marketId}`] = v.count;
    });
    return map;
  }, [volumeData.data]);

  const outboundSources = sources.data?.filter((s: any) => s.tracksVolume) || [];

  // Generate month options
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  const handleSpendChange = (sourceId: number, marketId: number, value: string) => {
    const amount = Math.round(parseFloat(value || "0") * 100);
    if (isNaN(amount)) return;
    upsertSpend.mutate({ sourceId, marketId, month, amount });
  };

  const handleVolumeChange = (sourceId: number, marketId: number, value: string) => {
    const count = parseInt(value || "0");
    if (isNaN(count)) return;
    upsertVolume.mutate({ sourceId, marketId, month, count });
  };

  if (!sources.data?.length || !markets.data?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Add sources and markets first to enter spend and volume data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium">Month:</Label>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Spend Table */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Marketing Spend ($)</h4>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Source</th>
                {markets.data?.map((m: any) => (
                  <th key={m.id} className="py-2 px-3 text-center font-medium text-muted-foreground">{m.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.data?.map((s: any) => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-1.5 px-3 font-medium">{s.name}</td>
                  {markets.data?.map((m: any) => {
                    const key = `${s.id}_${m.id}`;
                    const currentVal = spendMap[key] || 0;
                    return (
                      <td key={m.id} className="py-1.5 px-2">
                        <Input
                          type="number"
                          className="h-7 text-xs text-center w-24 mx-auto"
                          defaultValue={currentVal ? (currentVal / 100).toFixed(0) : ""}
                          placeholder="0"
                          onBlur={(e) => handleSpendChange(s.id, m.id, e.target.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Volume Table */}
      {outboundSources.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Volume (outbound sources only)</h4>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Source</th>
                  {markets.data?.map((m: any) => (
                    <th key={m.id} className="py-2 px-3 text-center font-medium text-muted-foreground">{m.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outboundSources.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/50">
                    <td className="py-1.5 px-3 font-medium">
                      {s.name}
                      <span className="text-xs text-muted-foreground ml-1">({s.volumeLabel || "Count"})</span>
                    </td>
                    {markets.data?.map((m: any) => {
                      const key = `${s.id}_${m.id}`;
                      const currentVal = volumeMap[key] || 0;
                      return (
                        <td key={m.id} className="py-1.5 px-2">
                          <Input
                            type="number"
                            className="h-7 text-xs text-center w-24 mx-auto"
                            defaultValue={currentVal || ""}
                            placeholder="0"
                            onBlur={(e) => handleVolumeChange(s.id, m.id, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── BACKFILL SETTINGS ───

function BackfillSettings() {
  const backfillMutation = trpc.kpi.backfillSourceMarket.useMutation({
    onSuccess: (data) => {
      toast.success(`Backfill complete: ${data.updated} updated, ${data.skipped} skipped out of ${data.total} properties`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Backfill Source & Market</h3>
        <p className="text-xs text-muted-foreground">
          Scan all existing properties and auto-assign their Source (from GHL opportunity source) and Market (from zip code matching).
          Properties that already have a source or market assigned will be skipped.
        </p>
      </div>

      {backfillMutation.data && (
        <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
          <p><strong>Last run results:</strong></p>
          <p className="text-muted-foreground">
            {backfillMutation.data.updated} properties updated, {backfillMutation.data.skipped} skipped, {backfillMutation.data.total} total
          </p>
        </div>
      )}

      <Button
        onClick={() => backfillMutation.mutate()}
        disabled={backfillMutation.isPending}
        className="w-full"
      >
        {backfillMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Backfill...</>
        ) : (
          <><Zap className="w-4 h-4 mr-2" /> Run Backfill Now</>
        )}
      </Button>

      <SplitAddressesSection />
    </div>
  );
}

function SplitAddressesSection() {
  const splitMutation = trpc.kpi.splitMultiAddresses.useMutation({
    onSuccess: (data) => {
      toast.success(`Split complete: ${data.split} properties split, ${data.created} new properties created`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 pt-4 border-t">
      <h3 className="text-sm font-semibold">Split Multi-Address Properties</h3>
      <p className="text-xs text-muted-foreground">
        Find properties with multiple addresses joined by "&" (e.g. "123 Main St & 456 Oak Ave") and split them into separate property records.
        Each new property inherits the same city, state, zip, status, source, and market.
      </p>

      {splitMutation.data && (
        <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
          <p><strong>Last run results:</strong></p>
          <p className="text-muted-foreground">
            {splitMutation.data.found} multi-address properties found, {splitMutation.data.split} split, {splitMutation.data.created} new properties created
          </p>
        </div>
      )}

      <Button
        onClick={() => splitMutation.mutate()}
        disabled={splitMutation.isPending}
        variant="outline"
        className="w-full"
      >
        {splitMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Splitting Addresses...</>
        ) : (
          <>Split Multi-Address Properties</>
        )}
      </Button>
    </div>
  );
}
