import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearch } from "wouter";
import { toast } from "sonner";
import {
  Phone, TrendingUp, MessageSquare, Calendar, CheckCircle2,
  Target, ArrowUpRight, ArrowDownRight, Search, Award,
  Activity, Flame, Crown, Medal, Zap, BarChart3,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useTenantConfig } from "@/hooks/useTenantConfig";

type DateRange = "today" | "week" | "month" | "ytd" | "all";
type CallFilter = "completed" | "needs_review";

/* ═══════════════════════════════════════════════════════
   STAT CARD — Glass morphism with glow on hover
   ═══════════════════════════════════════════════════════ */
function StatCard({
  title, value, icon: Icon, loading, priorValue, isPercentage, accentColor,
}: {
  title: string; value: string | number; icon: React.ElementType;
  loading?: boolean; priorValue?: number; isPercentage?: boolean;
  accentColor?: string;
}) {
  const change = useMemo(() => {
    if (priorValue === undefined || loading) return null;
    const currentNum = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(currentNum)) return null;
    if (isPercentage) {
      const diff = currentNum - priorValue;
      if (Math.abs(diff) < 0.5) return null;
      return { pct: Math.round(Math.abs(diff)), direction: diff > 0 ? ("up" as const) : ("down" as const) };
    }
    if (priorValue === 0 && currentNum === 0) return null;
    if (priorValue === 0) return { pct: 100, direction: "up" as const };
    const pctChange = Math.round(((currentNum - priorValue) / priorValue) * 100);
    if (pctChange === 0) return null;
    return { pct: Math.abs(pctChange), direction: pctChange > 0 ? ("up" as const) : ("down" as const) };
  }, [value, priorValue, loading, isPercentage]);

  const accent = accentColor || "var(--g-accent)";

  return (
    <div className="group relative bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] rounded-2xl p-5 hover:border-[var(--g-border-medium)] transition-all duration-500 overflow-hidden">
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}15, transparent 70%)` }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>
            {title}
          </p>
          {change && (
            <span
              className="flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: change.direction === "up" ? "var(--g-up-bg)" : "var(--g-down-bg)",
                color: change.direction === "up" ? "var(--g-up)" : "var(--g-down)",
              }}
            >
              {change.direction === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {change.pct}%
            </span>
          )}
        </div>
        {loading ? (
          <Skeleton className="h-9 w-20 mb-1 rounded-lg" />
        ) : (
          <div
            className="text-2xl font-extrabold tracking-tight font-mono"
            style={{ color: "var(--g-text-primary)", letterSpacing: "-0.03em" }}
          >
            {value}
          </div>
        )}

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   GRADE BADGE
   ═══════════════════════════════════════════════════════ */
function GradeBadge({ grade }: { grade: string }) {
  const g = grade.toLowerCase();
  const colors: Record<string, { bg: string; text: string; glow: string }> = {
    a: { bg: "var(--g-grade-a-bg)", text: "var(--g-grade-a)", glow: "var(--g-grade-a-glow)" },
    b: { bg: "var(--g-grade-b-bg)", text: "var(--g-grade-b)", glow: "var(--g-grade-b-glow)" },
    c: { bg: "var(--g-grade-c-bg)", text: "var(--g-grade-c)", glow: "var(--g-grade-c-glow)" },
    d: { bg: "var(--g-grade-d-bg)", text: "var(--g-grade-d)", glow: "var(--g-grade-d-glow)" },
    f: { bg: "var(--g-grade-f-bg)", text: "var(--g-grade-f)", glow: "var(--g-grade-f-glow)" },
  };
  const c = colors[g] || colors.c;
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-extrabold tracking-tight"
      style={{ background: c.bg, color: c.text, boxShadow: `0 0 12px ${c.glow}` }}
    >
      {grade}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   SCORE TRENDS — Animated bar chart with gradient bars
   ═══════════════════════════════════════════════════════ */
function ScoreTrendsChart({ stats, loading }: { stats: any; loading: boolean }) {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const weeklyData = useMemo(() => {
    if (!stats?.teamMemberTrends || stats.teamMemberTrends.length === 0) return [];
    const weekMap = new Map<string, { totalScore: number; count: number }>();
    for (const member of stats.teamMemberTrends) {
      for (const week of member.weeklyScores) {
        if (week.callCount === 0) continue;
        const existing = weekMap.get(week.weekStart);
        if (existing) {
          existing.totalScore += week.averageScore * week.callCount;
          existing.count += week.callCount;
        } else {
          weekMap.set(week.weekStart, { totalScore: week.averageScore * week.callCount, count: week.callCount });
        }
      }
    }
    return Array.from(weekMap.entries())
      .map(([weekStart, data]) => ({
        weekStart,
        averageScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
        callCount: data.count,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .slice(-8);
  }, [stats]);

  const maxScore = Math.max(...weeklyData.map((w) => w.averageScore), 100);

  if (loading) {
    return (
      <div className="bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] rounded-2xl p-6" style={{ minHeight: 360 }}>
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--g-text-secondary)" }}>Score Trends</h3>
        </div>
        <div className="flex items-end gap-3 h-52">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 rounded-lg" style={{ height: `${30 + Math.random() * 60}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] rounded-2xl p-6" style={{ minHeight: 360 }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--g-text-secondary)" }}>
            Score Trends{weeklyData.length > 0 ? ` — ${weeklyData.length} Week${weeklyData.length === 1 ? "" : "s"}` : ""}
          </h3>
        </div>
      </div>

      {weeklyData.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-52 gap-2" style={{ color: "var(--g-text-tertiary)" }}>
          <BarChart3 className="h-8 w-8 opacity-30" />
          <p className="text-sm">No score data yet</p>
        </div>
      ) : (
        <>
          {/* Chart area with inset background */}
          <div
            className="rounded-xl p-5 relative overflow-hidden"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--g-border-subtle)" }}
          >
            {/* Horizontal grid lines */}
            {[25, 50, 75, 100].map((line) => (
              <div
                key={line}
                className="absolute left-5 right-5"
                style={{
                  bottom: `${(line / maxScore) * 220 + 20}px`,
                  height: 1,
                  background: "var(--g-border-subtle)",
                }}
              />
            ))}

            {/* Bars */}
            <div className="flex items-end gap-3" style={{ height: 240, position: "relative", zIndex: 2 }}>
              {weeklyData.map((week, i) => {
                const rawRatio = maxScore > 0 ? week.averageScore / maxScore : 0;
                const barHeight = week.averageScore > 0 ? Math.max(Math.round(rawRatio * 200), 30) : 8;
                const isHovered = hoveredBar === i;
                const scoreColor =
                  week.averageScore >= 80 ? "var(--g-grade-a)" :
                  week.averageScore >= 60 ? "var(--g-grade-c)" : "var(--g-grade-f)";

                return (
                  <div
                    key={week.weekStart}
                    className="flex-1 flex flex-col items-center justify-end relative cursor-pointer"
                    style={{ height: 240 }}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div
                        className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[var(--g-bg-elevated)] border border-[var(--g-border-medium)] rounded-lg px-3 py-2 text-xs shadow-xl z-10 whitespace-nowrap"
                      >
                        <div className="font-bold" style={{ color: scoreColor }}>{week.averageScore}%</div>
                        <div style={{ color: "var(--g-text-tertiary)" }}>{week.callCount} calls</div>
                      </div>
                    )}

                    {/* Bar */}
                    <div
                      className="w-full max-w-[40px] rounded-t-lg transition-all duration-700 ease-out relative overflow-hidden"
                      style={{
                        height: barHeight,
                        background: `linear-gradient(180deg, var(--g-accent-light) 0%, var(--g-accent) 50%, #5a1018 100%)`,
                        boxShadow: isHovered ? `0 0 20px var(--g-accent-glow)` : "none",
                        opacity: isHovered ? 1 : 0.8,
                        transform: isHovered ? "scaleY(1.02)" : "scaleY(1)",
                        transformOrigin: "bottom",
                      }}
                    >
                      {/* Shine effect */}
                      <div
                        className="absolute inset-0 rounded-t-lg"
                        style={{
                          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                          opacity: isHovered ? 1 : 0,
                          transition: "opacity 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Week labels */}
          <div className="flex gap-3 mt-3 px-5">
            {weeklyData.map((week) => {
              const d = new Date(week.weekStart);
              const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={week.weekStart + "-label"} className="flex-1 text-center">
                  <span className="text-[10px] font-medium" style={{ color: "var(--g-text-tertiary)" }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LEADERBOARD PANEL — Ranked list with medals and glow
   ═══════════════════════════════════════════════════════ */
function LeaderboardPanel({ leaderboard, loading }: { leaderboard: any[] | undefined; loading: boolean }) {
  const { t } = useTenantConfig();
  if (loading) {
    return (
      <div className="bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] rounded-2xl p-6" style={{ minHeight: 360 }}>
        <div className="flex items-center gap-2 mb-5">
          <Crown className="h-4 w-4" style={{ color: "var(--g-rank-1)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--g-text-secondary)" }}>Leaderboard</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] rounded-2xl p-6" style={{ minHeight: 360 }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4" style={{ color: "var(--g-rank-1)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--g-text-secondary)" }}>Leaderboard</h3>
        </div>
        <Link href="/leaderboard">
          <button className="text-xs font-medium hover:underline" style={{ color: "var(--g-accent-text)" }}>
            View All
          </button>
        </Link>
      </div>

      {!leaderboard || leaderboard.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-52 gap-2" style={{ color: "var(--g-text-tertiary)" }}>
          <Award className="h-8 w-8 opacity-30" />
          <p className="text-sm">No data yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {leaderboard.slice(0, 5).map((entry, index) => {
            const initials = (entry.teamMember.name || "??")
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            const rankColors = [
              { bg: "var(--g-rank-1-bg)", text: "var(--g-rank-1)", icon: Crown },
              { bg: "var(--g-rank-2-bg)", text: "var(--g-rank-2)", icon: Medal },
              { bg: "var(--g-rank-3-bg)", text: "var(--g-rank-3)", icon: Medal },
            ];
            const rankStyle = rankColors[index] || null;

            return (
              <div
                key={entry.teamMember.id}
                className="group flex items-center gap-3 py-3 px-3 rounded-xl transition-all duration-300 hover:bg-[var(--g-bg-card-hover)]"
                style={{
                  background: index === 0 ? "var(--g-rank-1-bg)" : "transparent",
                  border: index === 0 ? "1px solid rgba(234,179,8,0.15)" : "1px solid transparent",
                }}
              >
                {/* Rank */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0"
                  style={{
                    background: rankStyle?.bg || "var(--g-badge-bg)",
                    color: rankStyle?.text || "var(--g-text-tertiary)",
                  }}
                >
                  {index < 3 && rankStyle ? (
                    <rankStyle.icon className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, var(--g-accent), #5a1018)" }}
                >
                  {initials}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--g-text-primary)" }}>
                    {entry.teamMember.name}
                  </p>
                  <p className="text-[11px] capitalize" style={{ color: "var(--g-text-tertiary)" }}>
                    {t.role(entry.teamMember.teamRole) || "Team Member"}
                  </p>
                </div>

                {/* Score */}
                <div className="text-right shrink-0">
                  <p
                    className="text-lg font-extrabold font-mono"
                    style={{
                      color: "var(--g-text-primary)",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {entry.averageScore ? `${Math.round(entry.averageScore)}%` : "N/A"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   RECENT ACTIVITY FEED — Timeline style
   ═══════════════════════════════════════════════════════ */
function RecentActivityFeed({ calls, loading }: { calls: any[] | undefined; loading: boolean }) {
  const activities = useMemo(() => {
    if (!calls || calls.length === 0) return [];
    const items: { prefix: string; highlight: string; suffix: string; timeAgo: string; type: string }[] = [];

    calls.slice(0, 8).forEach((call: any, idx: number) => {
      const name = call.teamMemberName || "Unknown";
      const contact = call.contactName || call.contactPhone || "Unknown";
      const score = call.grade?.overallScore ? Math.round(parseFloat(call.grade.overallScore)) : null;
      const grade = call.grade?.overallGrade;
      const callTime = new Date(call.createdAt).getTime();
      const diffMs = Date.now() - callTime;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      let timeAgo = "";
      if (diffMins < 1) timeAgo = "just now";
      else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
      else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
      else timeAgo = `${diffDays}d ago`;

      if (score !== null) {
        items.push({
          prefix: `${name} scored `,
          highlight: `${score}%`,
          suffix: ` on call with ${contact}`,
          timeAgo,
          type: "score",
        });
        if (grade === "A" && idx < 3) {
          items.push({
            prefix: `${name} earned `,
            highlight: `'Closer'`,
            suffix: ` badge`,
            timeAgo,
            type: "badge",
          });
        }
      } else {
        items.push({
          prefix: `${name} logged a call with `,
          highlight: contact,
          suffix: "",
          timeAgo,
          type: "call",
        });
      }
    });

    return items.slice(0, 5);
  }, [calls]);

  if (loading) {
    return (
      <div className="bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--g-text-secondary)" }}>Recent Activity</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  const typeIcons: Record<string, { icon: React.ElementType; color: string }> = {
    score: { icon: Target, color: "var(--g-accent)" },
    badge: { icon: Award, color: "var(--g-rank-1)" },
    call: { icon: Phone, color: "var(--g-text-tertiary)" },
  };

  return (
    <div className="bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--g-text-secondary)" }}>Recent Activity</h3>
      </div>
      {activities.length === 0 ? (
        <p className="text-sm py-4" style={{ color: "var(--g-text-tertiary)" }}>No recent activity</p>
      ) : (
        <div className="space-y-0">
          {activities.map((item, i) => {
            const ti = typeIcons[item.type] || typeIcons.call;
            return (
              <div
                key={i}
                className="flex items-center gap-3 py-3"
                style={{ borderBottom: i < activities.length - 1 ? "1px solid var(--g-border-subtle)" : "none" }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${ti.color}15` }}
                >
                  <ti.icon className="h-3.5 w-3.5" style={{ color: ti.color }} />
                </div>
                <div className="flex-1 min-w-0 text-sm" style={{ color: "var(--g-text-secondary)" }}>
                  <span>{item.prefix}</span>
                  {item.highlight && (
                    <span className="font-bold" style={{ color: "var(--g-text-primary)" }}>
                      {item.highlight}
                    </span>
                  )}
                  {item.suffix && <span>{item.suffix}</span>}
                </div>
                <span className="text-[11px] shrink-0 font-medium" style={{ color: "var(--g-text-tertiary)" }}>
                  {item.timeAgo}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CALL HISTORY TABLE — Premium table with hover effects
   ═══════════════════════════════════════════════════════ */
function CallHistoryTable({ dateRange }: { dateRange: DateRange }) {
  const [filter, setFilter] = useState<CallFilter>("completed");
  const [searchQuery, setSearchQuery] = useState("");

  const statuses = useMemo(() => {
    if (filter === "completed") return ["completed"] as string[];
    if (filter === "needs_review") return ["pending", "processing"] as string[];
    return undefined;
  }, [filter]);

  const dateFilter = useMemo(() => {
    const now = new Date();
    if (dateRange === "today") {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      return d.toISOString();
    } else if (dateRange === "week") {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return d.toISOString();
    } else if (dateRange === "month") {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return d.toISOString();
    } else if (dateRange === "ytd") {
      return new Date(now.getFullYear(), 0, 1).toISOString();
    }
    return undefined;
  }, [dateRange]);

  const { data: callsData, isLoading } = trpc.calls.withGrades.useQuery({
    limit: 10,
    statuses,
    startDate: dateFilter,
  });

  const calls = callsData?.items || [];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return "--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] rounded-2xl p-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4" style={{ color: "var(--g-accent)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--g-text-secondary)" }}>Recent Calls</h3>
        </div>
        <div className="flex-1" />
        <div className="flex gap-2 shrink-0">
          {(["completed", "needs_review"] as CallFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300"
              style={{
                background: filter === f ? "var(--g-accent-soft)" : "transparent",
                color: filter === f ? "var(--g-accent-text)" : "var(--g-text-tertiary)",
                border: filter === f ? "1px solid var(--g-accent-medium)" : "1px solid var(--g-border-subtle)",
              }}
            >
              {f === "completed" ? "Completed" : "Needs Review"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
              {["DATE", "CALLER", "LEAD", "DURATION", "GRADE", "SCORE", "STATUS"].map((h) => (
                <th
                  key={h}
                  className="text-left text-[10px] font-bold tracking-wider py-3 px-3"
                  style={{ color: "var(--g-text-tertiary)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="py-3 px-3"><Skeleton className="h-5 w-16 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : calls.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-sm" style={{ color: "var(--g-text-tertiary)" }}>
                  No calls found
                </td>
              </tr>
            ) : (
              calls.map((call: any) => {
                const initials = (call.teamMemberName || "??")
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                const score = call.grade?.overallScore ? Math.round(parseFloat(call.grade.overallScore)) : null;
                const grade = call.grade?.overallGrade;
                const isCompleted = call.status === "completed";

                return (
                  <tr
                    key={call.id}
                    className="cursor-pointer transition-all duration-200 hover:bg-[var(--g-bg-card-hover)]"
                    style={{ borderBottom: "1px solid var(--g-border-subtle)" }}
                    onClick={() => (window.location.href = `/calls/${call.id}`)}
                  >
                    <td className="py-3.5 px-3 text-xs font-medium" style={{ color: "var(--g-text-secondary)" }}>
                      {formatDate(call.createdAt)}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ background: "linear-gradient(135deg, var(--g-accent), #5a1018)" }}
                        >
                          {initials}
                        </div>
                        <span className="font-semibold text-sm" style={{ color: "var(--g-text-primary)" }}>
                          {call.teamMemberName || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-sm" style={{ color: "var(--g-text-secondary)" }}>
                      {call.contactName || call.contactPhone || "Unknown"}
                    </td>
                    <td className="py-3.5 px-3 text-sm font-mono" style={{ color: "var(--g-text-tertiary)" }}>
                      {formatDuration(call.duration)}
                    </td>
                    <td className="py-3.5 px-3">
                      {grade ? <GradeBadge grade={grade} /> : <span style={{ color: "var(--g-text-tertiary)" }}>—</span>}
                    </td>
                    <td className="py-3.5 px-3">
                      {score !== null ? (
                        <span
                          className="font-extrabold font-mono text-sm"
                          style={{
                            color: score >= 80 ? "var(--g-grade-a)" : score >= 60 ? "var(--g-grade-c)" : "var(--g-grade-f)",
                          }}
                        >
                          {score}%
                        </span>
                      ) : (
                        <span style={{ color: "var(--g-text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: isCompleted ? "var(--g-grade-a)" : "var(--g-grade-c)" }}
                        />
                        <span className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>
                          {call.status === "completed" ? "Completed" : call.status === "pending" ? "Pending" : call.status === "processing" ? "Processing" : call.status}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {calls.length > 0 && (
        <div className="mt-5 text-center">
          <Link href="/calls">
            <Button
              variant="outline"
              size="sm"
              className="text-xs rounded-lg"
              style={{
                background: "transparent",
                border: "1px solid var(--g-border-medium)",
                color: "var(--g-text-secondary)",
              }}
            >
              View All Calls
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════ */
export default function Home() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const { user } = useAuth();
  const { t } = useTenantConfig();
  const searchString = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("checkout") === "success") {
      toast.success("Welcome to Gunner! Your subscription is now active.", { duration: 5000 });
      setTimeout(() => window.history.replaceState({}, "", "/dashboard"), 100);
    }
  }, [searchString]);

  const firstName = user?.name?.split(" ")[0] || "there";
  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || (user as any)?.isTenantAdmin === "true";

  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery({ dateRange });
  const { data: recentCalls, isLoading: callsLoading } = trpc.calls.withGrades.useQuery({
    limit: 5,
    statuses: ["completed"],
  });
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.leaderboard.get.useQuery({ dateRange });
  const { data: syncStatus } = trpc.sync.status.useQuery(undefined, { refetchInterval: 60000 });

  const formatLastSynced = () => {
    if (!syncStatus?.lastSyncedAt) return null;
    const lastSync = new Date(syncStatus.lastSyncedAt);
    const diffMin = Math.floor((Date.now() - lastSync.getTime()) / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return lastSync.toLocaleDateString();
  };

  const statCards = [
    { title: t.kpi("calls_made"), value: stats?.totalCalls ?? 0, icon: Phone, prior: stats?.priorPeriod?.totalCalls, color: "#c41e3a" },
    { title: "Conversations", value: stats?.gradedCalls ?? 0, icon: MessageSquare, prior: stats?.priorPeriod?.gradedCalls, color: "#3b82f6" },
    { title: "Leads Generated", value: stats?.leadsGenerated ?? 0, icon: Target, prior: stats?.priorPeriod?.leadsGenerated, color: "#22c55e" },
    { title: t.kpi("appointments_set"), value: stats?.appointmentsSet ?? 0, icon: Calendar, prior: stats?.priorPeriod?.appointmentsSet, color: "#eab308" },
    { title: t.kpi("offers_made"), value: stats?.offerCallsCompleted ?? 0, icon: CheckCircle2, prior: stats?.priorPeriod?.offerCallsCompleted, color: "#f97316" },
    { title: "Avg Score", value: stats?.averageScore ? `${Math.round(stats.averageScore)}%` : "N/A", icon: TrendingUp, prior: stats?.priorPeriod?.averageScore, isPercentage: true, color: "#a855f7" },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold"
            style={{ letterSpacing: "-0.04em", color: "var(--g-text-primary)" }}
          >
            Welcome back, {firstName}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--g-text-tertiary)" }}>
            Team performance at a glance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {formatLastSynced() && (
            <div className="hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg" style={{
              background: "var(--g-up-bg)",
              color: "var(--g-up)",
              border: "1px solid rgba(34,197,94,0.15)",
            }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Synced {formatLastSynced()}
            </div>
          )}
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger
              className="w-full sm:w-[160px] rounded-xl"
              style={{
                background: "var(--g-bg-surface)",
                border: "1px solid var(--g-border-medium)",
                color: "var(--g-text-secondary)",
              }}
            >
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
      </div>

      {/* ─── 6 Stat Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            value={card.value}
            icon={card.icon}
            loading={statsLoading}
            priorValue={card.prior}
            isPercentage={card.isPercentage}
            accentColor={card.color}
          />
        ))}
      </div>

      {/* ─── Score Trends + Leaderboard ─── */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ScoreTrendsChart stats={stats} loading={statsLoading} />
        </div>
        <div className="lg:col-span-2">
          <LeaderboardPanel leaderboard={leaderboard} loading={leaderboardLoading} />
        </div>
      </div>

      {/* ─── Recent Activity ─── */}
      <RecentActivityFeed calls={recentCalls?.items} loading={callsLoading} />

      {/* ─── Call History Table ─── */}
      <CallHistoryTable dateRange={dateRange} />
    </div>
  );
}
