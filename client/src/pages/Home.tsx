import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { Phone, TrendingUp, MessageSquare, Calendar, CheckCircle2, Target, ArrowUpRight, ArrowDownRight, Search, Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type DateRange = "today" | "week" | "month" | "ytd" | "all";
type CallFilter = "completed" | "needs_review";

/* ─── Stat Card ─── */
function StatCard({ 
  title, value, icon: Icon, loading, priorValue, isPercentage,
}: { 
  title: string; value: string | number; icon: React.ElementType;
  loading?: boolean; priorValue?: number; isPercentage?: boolean;
}) {
  const change = useMemo(() => {
    if (priorValue === undefined || loading) return null;
    const currentNum = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(currentNum)) return null;
    if (isPercentage) {
      const diff = currentNum - priorValue;
      if (Math.abs(diff) < 0.5) return null;
      return { pct: Math.round(Math.abs(diff)), direction: diff > 0 ? 'up' as const : 'down' as const };
    }
    if (priorValue === 0 && currentNum === 0) return null;
    if (priorValue === 0) return { pct: 100, direction: 'up' as const };
    const pctChange = Math.round(((currentNum - priorValue) / priorValue) * 100);
    if (pctChange === 0) return null;
    return { pct: Math.abs(pctChange), direction: pctChange > 0 ? 'up' as const : 'down' as const };
  }, [value, priorValue, loading, isPercentage]);

  return (
    <div className="obs-stat-card">
      <div className="flex items-center justify-between mb-2">
        <div className="stat-icon-wrap"><Icon className="h-4 w-4" /></div>
        {change && (
          <span className={`change-badge ${change.direction === 'up' ? 'change-up' : 'change-down'}`}>
            {change.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {change.pct}%
          </span>
        )}
      </div>
      {loading ? <Skeleton className="h-8 w-16 mb-1" /> : <div className="stat-value">{value}</div>}
      <p className="stat-label">{title}</p>
    </div>
  );
}

/* ─── Grade Badge ─── */
function GradeBadge({ grade }: { grade: string }) {
  return <span className={`grade-badge grade-${grade.toLowerCase()}`}>{grade}</span>;
}

/* ─── Score Trends Bar Chart ─── */
function ScoreTrendsChart({ stats, loading }: { stats: any; loading: boolean }) {
  // Aggregate weekly scores across all team members
  const weeklyData = useMemo(() => {
    if (!stats?.teamMemberTrends || stats.teamMemberTrends.length === 0) return [];
    // Collect all unique weeks
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
    // Convert to array, sort by date, take last 8
    return Array.from(weekMap.entries())
      .map(([weekStart, data]) => ({
        weekStart,
        averageScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
        callCount: data.count,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .slice(-8);
  }, [stats]);

  const maxScore = Math.max(...weeklyData.map(w => w.averageScore), 100);

  if (loading) {
    return (
      <div className="obs-panel" style={{ minHeight: 320 }}>
        <h3 className="obs-section-title mb-6">Score Trends — 8 Weeks</h3>
        <div className="flex items-end gap-3 h-48">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 rounded-md" style={{ height: `${30 + Math.random() * 60}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="obs-panel" style={{ minHeight: 320 }}>
      <h3 className="obs-section-title mb-6">Score Trends — 8 Weeks</h3>
      {weeklyData.length === 0 ? (
        <div className="flex items-center justify-center h-48" style={{ color: 'var(--obs-text-tertiary)' }}>
          <p className="text-sm">No score data yet</p>
        </div>
      ) : (
        <div style={{ padding: '0 12px' }}>
          {/* Inset container with beige/gray background like lookbook */}
          <div style={{
            background: 'linear-gradient(180deg, rgba(200,190,175,0.15) 0%, rgba(200,190,175,0.08) 100%)',
            borderRadius: 12,
            padding: '24px 20px 16px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Bottom gradient mist/fade */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '40%',
              background: 'linear-gradient(to top, rgba(255,245,240,0.6), transparent)',
              pointerEvents: 'none',
              zIndex: 1,
            }} />
            {/* Chart bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 200, position: 'relative', zIndex: 2 }}>
              {weeklyData.map((week, i) => {
                const rawRatio = maxScore > 0 ? week.averageScore / maxScore : 0;
                const barHeight = week.averageScore > 0 ? Math.max(Math.round(rawRatio * 180), 35) : 10;
                return (
                  <div key={week.weekStart} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: 200 }}>
                    {/* 3D bar group */}
                    <div style={{ position: 'relative', width: '80%', height: barHeight }}>
                      {/* Main bar face */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(180deg, #c41e3a 0%, #8b1528 40%, #5a0d1a 100%)',
                          borderRadius: '4px 4px 1px 1px',
                          boxShadow: '0 2px 8px rgba(140,20,40,0.3)',
                          transition: 'height 0.7s ease-out',
                        }}
                      />
                      {/* Right face for 3D depth */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: -4,
                          width: 4,
                          height: barHeight - 2,
                          background: 'linear-gradient(180deg, #7a1020 0%, #3d0810 100%)',
                          borderRadius: '0 3px 3px 0',
                        }}
                      />
                      {/* Top face for 3D depth */}
                      <div
                        style={{
                          position: 'absolute',
                          top: -3,
                          left: 2,
                          right: -2,
                          height: 5,
                          background: 'linear-gradient(90deg, #d4354f, #c41e3a)',
                          borderRadius: '3px 3px 0 0',
                          transform: 'skewX(-8deg)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Labels below container */}
          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
            {weeklyData.map((week) => (
              <div key={week.weekStart + '-label'} style={{ flex: 1, textAlign: 'center' }}>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--obs-text-secondary)' }}>
                  {week.averageScore > 0 ? `${week.averageScore}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Leaderboard Panel ─── */
function LeaderboardPanel({ leaderboard, loading }: { leaderboard: any[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="obs-panel" style={{ minHeight: 320 }}>
        <h3 className="obs-section-title mb-4">Leaderboard</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="obs-panel" style={{ minHeight: 320 }}>
      <h3 className="obs-section-title mb-4">Leaderboard</h3>
      {!leaderboard || leaderboard.length === 0 ? (
        <div className="flex items-center justify-center h-48" style={{ color: 'var(--obs-text-tertiary)' }}>
          <Award className="h-8 w-8 mr-2 opacity-50" />
          <p className="text-sm">No data yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.slice(0, 5).map((entry, index) => {
            const initials = (entry.teamMember.name || '??')
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);
            const roleLabel = entry.teamMember.teamRole?.replace('_', ' ') || 'Team Member';
            return (
              <div key={entry.teamMember.id} className="flex items-center gap-3 py-2.5 px-1">
                {/* Rank number */}
                <div className={`lb-rank ${
                  index === 0 ? 'lb-rank-1' : index === 1 ? 'lb-rank-2' : index === 2 ? 'lb-rank-3' : 'lb-rank-default'
                }`}>
                  {index + 1}
                </div>

                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{entry.teamMember.name}</p>
                  <p className="text-xs capitalize" style={{ color: 'var(--obs-text-tertiary)' }}>{roleLabel}</p>
                </div>
                {/* Score */}
                <div className="text-right shrink-0">
                  <p className="text-lg font-extrabold" style={{ letterSpacing: '-0.02em' }}>
                    {entry.averageScore ? `${Math.round(entry.averageScore)}%` : 'N/A'}
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

/* ─── Recent Activity Feed ─── */
function RecentActivityFeed({ calls, loading }: { calls: any[] | undefined; loading: boolean }) {
  // Build activity items from recent calls with variety
  const activities = useMemo(() => {
    if (!calls || calls.length === 0) return [];
    const items: { prefix: string; highlight: string; suffix: string; timeAgo: string }[] = [];

    calls.slice(0, 8).forEach((call: any, idx: number) => {
      const name = call.teamMemberName || 'Unknown';
      const contact = call.contactName || call.contactPhone || 'Unknown';
      const score = call.grade?.overallScore ? Math.round(parseFloat(call.grade.overallScore)) : null;
      const grade = call.grade?.overallGrade;
      const callTime = new Date(call.createdAt).getTime();
      const now = Date.now();
      const diffMs = now - callTime;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      let timeAgo = '';
      if (diffMins < 1) timeAgo = 'just now';
      else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
      else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
      else timeAgo = `${diffDays}d ago`;

      // Primary: scored event
      if (score !== null) {
        items.push({
          prefix: `${name} scored `,
          highlight: `${score}%`,
          suffix: ` on call with ${contact}`,
          timeAgo,
        });
        // Add variety events for notable scores
        if (grade === 'A' && idx < 3) {
          items.push({
            prefix: `${name} earned the `,
            highlight: `'Closer'`,
            suffix: ` badge`,
            timeAgo,
          });
        }
      } else {
        items.push({
          prefix: `${name} logged a new call with ${contact}`,
          highlight: '',
          suffix: '',
          timeAgo,
        });
      }
    });

    // Sort by recency (keep original order) and limit to 5
    return items.slice(0, 5);
  }, [calls]);

  if (loading) {
    return (
      <div className="obs-panel">
        <h3 className="obs-section-title mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="obs-panel">
      <h3 className="obs-section-title mb-4">Recent Activity</h3>
      {activities.length === 0 ? (
        <p className="text-sm py-4" style={{ color: 'var(--obs-text-tertiary)' }}>No recent activity</p>
      ) : (
        <div className="space-y-0">
          {activities.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-3" style={{
              borderBottom: i < activities.length - 1 ? '1px solid var(--obs-border-subtle)' : 'none',
            }}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{
                background: 'var(--obs-accent)',
              }} />
              <div className="flex-1 min-w-0 text-sm" style={{ color: 'var(--obs-text-secondary)' }}>
                <span>{item.prefix}</span>
                {item.highlight && (
                  <span className="font-bold" style={{
                    color: 'var(--foreground)',
                    margin: '0 6px',
                    letterSpacing: '-0.01em',
                  }}>{item.highlight}</span>
                )}
                {item.suffix && <span>{item.suffix}</span>}
              </div>
              <span className="text-xs shrink-0" style={{ color: 'var(--obs-text-tertiary)' }}>{item.timeAgo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Call History Table ─── */
function CallHistoryTable({ dateRange }: { dateRange: DateRange }) {
  const [filter, setFilter] = useState<CallFilter>("completed");
  const [searchQuery, setSearchQuery] = useState("");

  const statuses = useMemo(() => {
    if (filter === "completed") return ["completed"] as string[];
    if (filter === "needs_review") return ["pending", "processing"] as string[];
    return undefined;
  }, [filter]);

  // Convert dateRange to startDate/endDate
  const dateFilter = useMemo(() => {
    const now = new Date();
    let startDate: string | undefined;
    if (dateRange === 'today') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      startDate = d.toISOString();
    } else if (dateRange === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString();
    } else if (dateRange === 'month') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString();
    } else if (dateRange === 'ytd') {
      startDate = new Date(now.getFullYear(), 0, 1).toISOString();
    }
    return startDate;
  }, [dateRange]);

  const { data: callsData, isLoading } = trpc.calls.withGrades.useQuery({
    limit: 10,
    statuses: statuses,
    startDate: dateFilter,
  });

  const calls = callsData?.items || [];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="obs-panel">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--obs-text-tertiary)' }} />
            <Input
              placeholder="Search calls by name, lead, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
              style={{
                background: 'var(--obs-bg-inset)',
                border: '1px solid var(--obs-border-subtle)',
                borderRadius: 8,
              }}
            />
          </div>
          <div className="flex gap-2 shrink-0">
            {(["completed", "needs_review"] as CallFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`call-filter-pill ${filter === f ? 'active' : ''}`}
              >
                {f === "completed" ? "Completed" : "Needs Review"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="obs-table w-full">
            <thead>
              <tr>
                <th>DATE</th>
                <th>CALLER</th>
                <th>LEAD</th>
                <th>DURATION</th>
                <th>GRADE</th>
                <th>SCORE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j}><Skeleton className="h-5 w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : calls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8" style={{ color: 'var(--obs-text-tertiary)' }}>
                    No calls found
                  </td>
                </tr>
              ) : (
                calls.map((call: any) => {
                  const initials = (call.teamMemberName || '??')
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);
                  const score = call.grade?.overallScore ? Math.round(parseFloat(call.grade.overallScore)) : null;
                  const grade = call.grade?.overallGrade;
                  const statusLabel = call.status === 'completed' ? 'Completed' :
                    call.status === 'pending' ? 'Pending' :
                    call.status === 'processing' ? 'Processing' :
                    call.status === 'skipped' ? 'Skipped' : call.status;
                  const isCompleted = call.status === 'completed';

                  return (
                    <tr key={call.id} className="cursor-pointer" onClick={() => window.location.href = `/calls/${call.id}`}>
                      <td>{formatDate(call.createdAt)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{
                            background: 'linear-gradient(135deg, var(--obs-accent), #5a1018)',
                          }}>
                            {initials}
                          </div>
                          <span className="font-semibold text-sm">{call.teamMemberName || 'Unknown'}</span>
                        </div>
                      </td>
                      <td>{call.contactName || call.contactPhone || 'Unknown'}</td>
                      <td>{formatDuration(call.duration)}</td>
                      <td>
                        {grade ? <GradeBadge grade={grade} /> : <span style={{ color: 'var(--obs-text-tertiary)' }}>—</span>}
                      </td>
                      <td>
                        {score !== null ? (
                          <span className="font-bold" style={{
                            color: score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444',
                          }}>
                            {score}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--obs-text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{
                            background: isCompleted ? '#22c55e' : '#eab308',
                          }} />
                          <span className="text-xs">{statusLabel}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* View all link */}
        {calls.length > 0 && (
          <div className="mt-4 text-center">
            <Link href="/calls">
              <Button variant="outline" size="sm" className="text-xs">View All Calls</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════ */
export default function Home() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const { user } = useAuth();
  const searchString = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get('checkout') === 'success') {
      toast.success("Welcome to Gunner! Your subscription is now active.", { duration: 5000 });
      setTimeout(() => window.history.replaceState({}, '', '/dashboard'), 100);
    }
  }, [searchString]);

  const firstName = user?.name?.split(' ')[0] || 'there';
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

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--obs-text-tertiary)' }}>
            Team performance at a glance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {formatLastSynced() && (
            <p className="text-xs hidden sm:flex items-center gap-1" style={{ color: 'var(--obs-text-tertiary)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
              Synced {formatLastSynced()}
            </p>
          )}
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
      </div>

      {/* ─── 6 Stat Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Calls Made" value={stats?.totalCalls ?? 0} icon={Phone} loading={statsLoading} priorValue={stats?.priorPeriod?.totalCalls} />
        <StatCard title="Conversations" value={stats?.gradedCalls ?? 0} icon={MessageSquare} loading={statsLoading} priorValue={stats?.priorPeriod?.gradedCalls} />
        <StatCard title="Leads Generated" value={stats?.leadsGenerated ?? 0} icon={Target} loading={statsLoading} priorValue={stats?.priorPeriod?.leadsGenerated} />
        <StatCard title="Appointments" value={stats?.appointmentsSet ?? 0} icon={Calendar} loading={statsLoading} priorValue={stats?.priorPeriod?.appointmentsSet} />
        <StatCard title="Offer Calls" value={stats?.offerCallsCompleted ?? 0} icon={CheckCircle2} loading={statsLoading} priorValue={stats?.priorPeriod?.offerCallsCompleted} />
        <StatCard title="Avg Score" value={stats?.averageScore ? `${Math.round(stats.averageScore)}%` : "N/A"} icon={TrendingUp} loading={statsLoading} priorValue={stats?.priorPeriod?.averageScore} isPercentage />
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
