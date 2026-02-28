import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone,
  MessageSquare,
  Target,
  Calendar,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock,
  Award,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ─── helpers ─── */
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
const delta = (cur: number, prev: number) =>
  prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
const fmtDur = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};
const gradeColor: Record<string, string> = {
  A: "#16a34a",
  B: "#65a30d",
  C: "#ca8a04",
  D: "#ea580c",
  F: "#dc2626",
};
const gradeBg: Record<string, string> = {
  A: "rgba(22,163,74,0.12)",
  B: "rgba(101,163,13,0.12)",
  C: "rgba(202,138,4,0.12)",
  D: "rgba(234,88,12,0.12)",
  F: "rgba(220,38,38,0.12)",
};

type DateRange = "today" | "week" | "month" | "ytd" | "all";


/* ═══════════════════════════════════════════════════════
   ANALYTICS PAGE — $100M SaaS Grade
   ═══════════════════════════════════════════════════════ */
export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>("week");

  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery({ dateRange });

  /* ─── derived data ─── */
  const prior = stats?.priorPeriod;
  const totalGraded = stats?.gradedCalls ?? 0;
  const totalGrades = stats?.gradeDistribution
    ? Object.values(stats.gradeDistribution).reduce((a, b) => a + b, 0)
    : 0;
  const passingRate =
    stats?.gradeDistribution
      ? pct(stats.gradeDistribution.A + stats.gradeDistribution.B, totalGrades)
      : 0;



  /* ─── render ─── */
  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter">
            Analytics
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--obs-text-tertiary)' }}>
            Performance intelligence across your entire team
          </p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">Last 30 Days</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ═══ EXECUTIVE KPI ROW ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 obs-stagger">
        {statsLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl p-5"
                style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg mb-1" />
                <Skeleton className="h-4 w-28 rounded" />
              </div>
            ))
          : [
              { label: "Calls Made", value: stats?.totalCalls ?? 0, prev: prior?.totalCalls, icon: Phone },
              { label: "Conversations", value: stats?.gradedCalls ?? 0, prev: prior?.gradedCalls, icon: MessageSquare },
              { label: "Leads Generated", value: stats?.leadsGenerated ?? 0, prev: prior?.leadsGenerated, icon: Target },
              { label: "Appointments", value: stats?.appointmentsSet ?? 0, prev: prior?.appointmentsSet, icon: Calendar },
              { label: "Offer Calls", value: stats?.offerCallsCompleted ?? 0, prev: prior?.offerCallsCompleted, icon: CheckCircle },
              { label: "Avg Score", value: Math.round(stats?.averageScore ?? 0), prev: prior?.averageScore ? Math.round(prior.averageScore) : undefined, icon: TrendingUp, suffix: "%", isPercentage: true },
            ].map((kpi, i) => {
              const d = kpi.prev != null ? (kpi as any).isPercentage ? Math.round(kpi.value - kpi.prev) : delta(kpi.value, kpi.prev) : null;
              const Icon = kpi.icon;
              const showChange = d !== null && Math.abs(d) >= 1;
              return (
                <div key={i} className="obs-stat-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="stat-icon-wrap"><Icon className="h-4 w-4" /></div>
                    {showChange && (
                      <span className={`change-badge ${d >= 0 ? 'change-up' : 'change-down'}`}>
                        {d >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(d)}%
                      </span>
                    )}
                  </div>
                  <div className="stat-value">
                    {Math.round(kpi.value).toLocaleString()}{(kpi as any).suffix || ""}
                  </div>
                  <p className="stat-label">{kpi.label}</p>
                </div>
              );
            })}
      </div>


      {/* ═══ MIDDLE ROW: Score Trends + Grade Distribution ═══ */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Score Trends */}
        <div className="obs-panel lg:col-span-3">
          <h3 className="obs-section-title mb-5">
            Score Trends — {stats?.weeklyTrends?.length ?? 12} Weeks
          </h3>
          {statsLoading ? (
            <div className="flex items-end gap-2" style={{ height: 220 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="flex-1 rounded-lg" style={{ height: `${25 + Math.sin(i * 0.8) * 35 + 20}%` }} />
              ))}
            </div>
          ) : stats?.weeklyTrends && stats.weeklyTrends.length > 0 ? (
            <div>
              {/* SVG area chart */}
              <div style={{ position: "relative", height: 220 }}>
                {/* Y-axis */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 36,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                  }}
                >
                  <span>100</span>
                  <span>75</span>
                  <span>50</span>
                  <span>25</span>
                  <span>0</span>
                </div>
                <div style={{ marginLeft: 44, height: "100%", position: "relative" }}>
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map((v) => (
                    <div
                      key={v}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: `${100 - v}%`,
                        borderTop: "1px solid var(--border)",
                        opacity: 0.5,
                      }}
                    />
                  ))}
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
                  >
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B1A1A" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#8B1A1A" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {(() => {
                      const weeks = stats.weeklyTrends;
                      const pts = weeks.map((w, i) => ({
                        x: weeks.length > 1 ? (i / (weeks.length - 1)) * 100 : 50,
                        y: 100 - Math.min(w.averageScore, 100),
                      }));
                      const lineD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                      const areaD = lineD + ` L ${pts[pts.length - 1].x} 100 L ${pts[0].x} 100 Z`;
                      return (
                        <>
                          <path d={areaD} fill="url(#trendGrad)" />
                          <path d={lineD} fill="none" stroke="#8B1A1A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                        </>
                      );
                    })()}
                    {stats.weeklyTrends.map((w, i) => {
                      const x = stats.weeklyTrends.length > 1 ? (i / (stats.weeklyTrends.length - 1)) * 100 : 50;
                      const y = 100 - Math.min(w.averageScore, 100);
                      return (
                        <circle key={i} cx={x} cy={y} r="2.5" fill="#8B1A1A" vectorEffect="non-scaling-stroke">
                          <title>
                            {new Date(w.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}:{" "}
                            {w.averageScore}% ({w.gradedCalls} graded)
                          </title>
                        </circle>
                      );
                    })}
                  </svg>
                </div>
              </div>
              {/* X-axis */}
              <div
                style={{
                  marginLeft: 44,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  marginTop: 8,
                }}
              >
                {stats.weeklyTrends
                  .filter((_, i) => i % Math.max(1, Math.floor(stats.weeklyTrends.length / 6)) === 0 || i === stats.weeklyTrends.length - 1)
                  .map((w, i) => (
                    <span key={i}>{new Date(w.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
              <BarChart3 size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p>No trend data available yet</p>
            </div>
          )}
        </div>

        {/* Grade Distribution + Call Metrics */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Grade Distribution */}
          <div className="obs-panel flex-1">
            <h3 className="obs-section-title mb-4">
              Grade Distribution
            </h3>
            {statsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-4 flex-1 rounded-full" />
                    <Skeleton className="h-4 w-8 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(["A", "B", "C", "D", "F"] as const).map((g) => {
                  const count = stats?.gradeDistribution?.[g] ?? 0;
                  const percentage = totalGrades > 0 ? (count / totalGrades) * 100 : 0;
                  return (
                    <div key={g} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 24,
                          borderRadius: 6,
                          background: gradeBg[g],
                          color: gradeColor[g],
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {g}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          borderRadius: 4,
                          background: "var(--muted)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${percentage}%`,
                            background: gradeColor[g],
                            borderRadius: 4,
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 60, textAlign: "right", color: "var(--muted-foreground)" }}>
                        {count} ({Math.round(percentage)}%)
                      </span>
                    </div>
                  );
                })}
                {/* Passing rate */}
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(22,163,74,0.06)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500 }}>A+B Passing Rate</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#16a34a" }}>{passingRate}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="obs-panel">
            <h3 className="obs-section-title mb-4">
              Quick Metrics
            </h3>
            {statsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 w-24 rounded" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Clock size={14} /> Avg Duration
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{fmtDur(stats?.averageCallDuration ?? 0)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Zap size={14} /> Calls Today
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{stats?.callsToday ?? 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                  <span style={{ fontSize: 13, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Award size={14} /> Graded Today
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{stats?.gradedToday ?? 0}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* ═══ INDIVIDUAL PERFORMANCE SPARKLINES ═══ */}
      {stats?.teamMemberTrends && stats.teamMemberTrends.filter((m) => m.weeklyScores.some((w) => w.callCount > 0)).length > 0 && (
        <div className="obs-panel">
          <h3 className="obs-section-title mb-5">
            Individual Trends
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {stats.teamMemberTrends
              .filter((m) => m.weeklyScores.some((w) => w.callCount > 0))
              .map((member, mi) => {
                const colors = ["#8B1A1A", "#16a34a", "#d97706", "#6366f1", "#ec4899", "#06b6d4"];
                const color = colors[mi % colors.length];
                const recentScores = member.weeklyScores.slice(-4).filter((w) => w.callCount > 0);
                const recentAvg = recentScores.length > 0 ? Math.round(recentScores.reduce((s, w) => s + w.averageScore, 0) / recentScores.length) : 0;
                const totalCalls = member.weeklyScores.reduce((s, w) => s + w.callCount, 0);

                return (
                  <div
                    key={member.memberId}
                    style={{
                      padding: 16,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: `linear-gradient(135deg, ${color}, ${color}88)`,
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {member.memberName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{member.memberName}</span>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 800, color }}>{recentAvg}%</span>
                    </div>
                    {/* Sparkline */}
                    <svg viewBox="0 0 100 30" style={{ width: "100%", height: 40 }} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={`ig-${member.memberId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                          <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {(() => {
                        const scores = member.weeklyScores;
                        const pts = scores.map((w, i) => ({
                          x: scores.length > 1 ? (i / (scores.length - 1)) * 100 : 50,
                          y: 30 - (Math.min(w.averageScore, 100) / 100) * 30,
                        }));
                        const lineD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                        const areaD = lineD + ` L ${pts[pts.length - 1].x} 30 L ${pts[0].x} 30 Z`;
                        return (
                          <>
                            <path d={areaD} fill={`url(#ig-${member.memberId})`} />
                            <path d={lineD} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                          </>
                        );
                      })()}
                    </svg>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
                      <span>{totalCalls} total calls</span>
                      <span>Last 4 wk avg</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ═══ WEEKLY BREAKDOWN TABLE ═══ */}
      {stats?.weeklyTrends && stats.weeklyTrends.length > 0 && (
        <div className="obs-panel">
          <h3 className="obs-section-title mb-5">
            Weekly Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="obs-table w-full">
              <thead>
                <tr>
                  <th>WEEK</th>
                  <th>AVG SCORE</th>
                  <th>TOTAL CALLS</th>
                  <th>GRADED</th>
                  <th>CHANGE</th>
                </tr>
              </thead>
              <tbody>
                {stats.weeklyTrends
                  .slice()
                  .reverse()
                  .filter((week: any) => week.totalCalls > 0 || week.gradedCalls > 0)
                  .slice(0, 8)
                  .map((week, i, arr) => {
                    const prevWeek = arr[i + 1];
                    const change = prevWeek && prevWeek.averageScore > 0 ? week.averageScore - prevWeek.averageScore : null;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 500 }}>
                          {new Date(week.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color:
                                week.averageScore >= 80
                                  ? "#16a34a"
                                  : week.averageScore >= 60
                                  ? "#ca8a04"
                                  : week.averageScore > 0
                                  ? "#dc2626"
                                  : "var(--muted-foreground)",
                            }}
                          >
                            {week.averageScore > 0 ? `${week.averageScore}%` : "—"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 13 }}>
                          {week.totalCalls}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 13 }}>
                          {week.gradedCalls}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          {change !== null ? (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: change >= 0 ? "#16a34a" : "#dc2626",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 2,
                              }}
                            >
                              {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {change >= 0 ? "+" : ""}
                              {Math.round(change)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
