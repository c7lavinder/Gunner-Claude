import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, TrendingUp, TrendingDown, Award, Calendar, CheckCircle2, MessageSquare, Loader2, XCircle, Clock, VoicemailIcon, PhoneMissed, AlertCircle, Flame, Trophy, Target, Zap, AlertTriangle, Lightbulb, ArrowRight, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DateRange = "today" | "week" | "month" | "ytd" | "all";

// Compact stat card for mobile - icon + number + label in minimal space
function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  loading,
  priorValue,
  isPercentage,
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  loading?: boolean;
  priorValue?: number;
  isPercentage?: boolean;
}) {
  // Calculate percentage change vs prior period
  const getChange = () => {
    if (priorValue === undefined || loading) return null;
    const currentNum = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(currentNum)) return null;
    
    if (isPercentage) {
      // For percentage metrics (avg score), show point difference
      const diff = currentNum - priorValue;
      if (Math.abs(diff) < 0.5) return { pct: 0, direction: 'flat' as const };
      return { pct: Math.round(Math.abs(diff)), direction: diff > 0 ? 'up' as const : 'down' as const };
    }
    
    if (priorValue === 0 && currentNum === 0) return { pct: 0, direction: 'flat' as const };
    if (priorValue === 0) return { pct: 100, direction: 'up' as const };
    const pctChange = Math.round(((currentNum - priorValue) / priorValue) * 100);
    if (pctChange === 0) return { pct: 0, direction: 'flat' as const };
    return { pct: Math.abs(pctChange), direction: pctChange > 0 ? 'up' as const : 'down' as const };
  };
  
  const change = getChange();
  
  // Format the badge label
  const badgeLabel = change && change.direction !== 'flat'
    ? `${change.pct}%`
    : null;
  
  return (
    <div className="relative overflow-hidden rounded-[10px] p-4" style={{
      background: 'var(--card)',
      border: '1px solid var(--obs-border-subtle)',
      boxShadow: 'var(--obs-shadow-card)',
      transition: 'all 0.2s',
    }}>
      {/* Comparison badge — top right */}
      {badgeLabel && change && (
        <div className={`absolute top-3 right-3 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
          change.direction === 'up' 
            ? 'change-up' 
            : 'change-down'
        }`}>
          {change.direction === 'up' ? (
            <ArrowUpRight className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDownRight className="h-3 w-3 shrink-0" />
          )}
          {badgeLabel}
        </div>
      )}
      {/* Icon container with accent bg */}
      <div className="stat-icon-wrap mb-2.5">
        <Icon className="h-4 w-4" />
      </div>
      {/* Value */}
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <div className="stat-value">{value}</div>
      )}
      {/* Label */}
      <p className="stat-label">{title}</p>
    </div>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  const gradeClass = `grade-${grade.toLowerCase()}`;
  return <span className={`grade-badge ${gradeClass}`}>{grade}</span>;
}

const dateRangeLabels: Record<DateRange, string> = {
  today: "Today",
  week: "Last 7 Days",
  month: "Last 30 Days",
  ytd: "Year to Date",
  all: "All Time",
};

export default function Home() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const { user } = useAuth();
  const searchString = useSearch();
  
  // Show toast on checkout success and clean up URL
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get('checkout') === 'success') {
      toast.success("Welcome to Gunner! Your subscription is now active.", {
        duration: 5000,
      });
      // Clean up URL after a short delay to allow the page to render
      setTimeout(() => {
        window.history.replaceState({}, '', '/dashboard');
      }, 100);
    }
  }, [searchString]);
  
  const firstName = user?.name?.split(' ')[0] || 'there';
  const isImpersonatingTenant = (user as any)?._isImpersonating === true;
  const impersonatedTenantName = (user as any)?._impersonatedTenantName;
  
  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery({ dateRange });
  const [todayStart] = useState(() => {
    const now = new Date();
    const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    cst.setHours(0, 0, 0, 0);
    return cst.toISOString();
  });
  const { data: recentCalls, isLoading: callsLoading } = trpc.calls.withGrades.useQuery({ 
    limit: 5, 
    statuses: ["completed"],
  });
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.leaderboard.get.useQuery({ dateRange });
  const { data: gamification, isLoading: gamificationLoading } = trpc.gamification.getSummary.useQuery();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.isTenantAdmin === "true";
  const { data: signalCounts, isLoading: signalsLoading } = trpc.opportunities.counts.useQuery(undefined, {
    enabled: isAdmin,
  });
  const { data: syncStatus } = trpc.sync.status.useQuery(undefined, {
    refetchInterval: 60000, // refresh every minute
  });

  // Format last synced time
  const formatLastSynced = () => {
    if (!syncStatus?.lastSyncedAt) return null;
    const lastSync = new Date(syncStatus.lastSyncedAt);
    const now = new Date();
    const diffMs = now.getTime() - lastSync.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return lastSync.toLocaleDateString();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter">
            {isImpersonatingTenant
              ? `Viewing: ${impersonatedTenantName || 'Tenant'}`
              : isAdmin 
                ? ((signalCounts?.missed ?? 0) + (signalCounts?.warning ?? 0) > 0
                  ? `${(signalCounts?.missed ?? 0) + (signalCounts?.warning ?? 0)} signals need attention`
                  : `All clear, ${firstName}`)
                : ((stats?.personalStats?.gradedToday ?? 0) > 0
                  ? `${stats?.personalStats?.callsToday ?? 0} calls today — ${stats?.personalStats?.gradedToday ?? 0} graded${stats?.personalStats?.averageScore ? `, avg ${Math.round(stats.personalStats.averageScore)}%` : ''}`
                  : `Welcome back, ${firstName}`)}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">
            {isImpersonatingTenant
              ? `Viewing as ${user?.name || 'admin'} — Team made ${stats?.callsToday ?? 0} calls today`
              : isAdmin 
                ? `Team made ${stats?.callsToday ?? 0} calls today — ${stats?.gradedToday ?? 0} graded, ${stats?.skippedToday ?? 0} skipped`
                : "Here's how you're performing"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {formatLastSynced() && (
            <p className="text-xs text-muted-foreground hidden sm:block">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 align-middle" />
              Synced {formatLastSynced()}
            </p>
          )}
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-full sm:w-[180px]">
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

      {/* Stats Grid - 2 columns on mobile, 6 on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        <StatCard
          title="Calls Made"
          value={stats?.totalCalls ?? 0}
          icon={Phone}
          loading={statsLoading}
          priorValue={stats?.priorPeriod?.totalCalls}
        />
        <StatCard
          title="Conversations"
          value={stats?.gradedCalls ?? 0}
          icon={MessageSquare}
          loading={statsLoading}
          priorValue={stats?.priorPeriod?.gradedCalls}
        />
        <StatCard
          title="Leads Generated"
          value={stats?.leadsGenerated ?? 0}
          icon={Target}
          loading={statsLoading}
          priorValue={stats?.priorPeriod?.leadsGenerated}
        />
        <StatCard
          title="Appointments"
          value={stats?.appointmentsSet ?? 0}
          icon={Calendar}
          loading={statsLoading}
          priorValue={stats?.priorPeriod?.appointmentsSet}
        />
        <StatCard
          title="Offer Calls"
          value={stats?.offerCallsCompleted ?? 0}
          icon={CheckCircle2}
          loading={statsLoading}
          priorValue={stats?.priorPeriod?.offerCallsCompleted}
        />
        <StatCard
          title="Avg Score"
          value={stats?.averageScore ? `${Math.round(stats.averageScore)}%` : "N/A"}
          icon={TrendingUp}
          loading={statsLoading}
          priorValue={stats?.priorPeriod?.averageScore}
          isPercentage
        />
      </div>

      {/* Admin: Pipeline Signals Summary | Non-admin: Gamification Stats */}
      {isAdmin ? (
        <Link href="/opportunities">
          <div className="grid grid-cols-3 gap-3 sm:gap-4 cursor-pointer group pb-2">
            {/* Missed */}
            <div className="rounded-xl p-4" style={{
              background: 'var(--card)',
              border: '1px solid rgba(220,38,38,0.15)',
              boxShadow: 'var(--obs-shadow-card)',
              transition: 'all 0.25s',
            }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="signal-icon signal-icon-missed">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
                <span className="text-xs font-semibold" style={{color: 'var(--obs-text-secondary)'}}>Missed</span>
              </div>
              {signalsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <>
                  <div className="signal-count" style={{color: '#dc2626'}}>
                    {signalCounts?.missed ?? 0}
                  </div>
                  <p className="text-xs mt-1" style={{color: 'var(--obs-text-tertiary)'}}>
                    Deals slipping through the cracks — act now
                  </p>
                </>
              )}
            </div>

            {/* At Risk */}
            <div className="rounded-xl p-4" style={{
              background: 'var(--card)',
              border: '1px solid rgba(217,119,6,0.15)',
              boxShadow: 'var(--obs-shadow-card)',
              transition: 'all 0.25s',
            }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="signal-icon signal-icon-at-risk">
                  <Clock className="h-4 w-4 text-amber-500" />
                </div>
                <span className="text-xs font-semibold" style={{color: 'var(--obs-text-secondary)'}}>At Risk</span>
              </div>
              {signalsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <>
                  <div className="signal-count" style={{color: '#d97706'}}>
                    {signalCounts?.warning ?? 0}
                  </div>
                  <p className="text-xs mt-1" style={{color: 'var(--obs-text-tertiary)'}}>
                    Leads going cold — needs attention within 24h
                  </p>
                </>
              )}
            </div>

            {/* Worth a Look */}
            <div className="rounded-xl p-4" style={{
              background: 'var(--card)',
              border: '1px solid rgba(37,99,235,0.15)',
              boxShadow: 'var(--obs-shadow-card)',
              transition: 'all 0.25s',
            }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="signal-icon signal-icon-worth">
                  <Lightbulb className="h-4 w-4 text-blue-500" />
                </div>
                <span className="text-xs font-semibold" style={{color: 'var(--obs-text-secondary)'}}>Worth a Look</span>
              </div>
              {signalsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <>
                  <div className="signal-count" style={{color: '#2563eb'}}>
                    {signalCounts?.possible ?? 0}
                  </div>
                  <p className="text-xs mt-1" style={{color: 'var(--obs-text-tertiary)'}}>
                    Potential deals that deserve a second look
                  </p>
                </>
              )}
            </div>
          </div>
        </Link>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Level & XP */}
          <div className="rounded-xl p-4" style={{
            background: 'var(--card)',
            border: '1px solid var(--obs-border-subtle)',
            boxShadow: 'var(--obs-shadow-card)',
          }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="stat-icon-wrap" style={{background: 'rgba(234,88,12,0.08)'}}>
                <Trophy className="h-4 w-4" style={{color: '#ea580c'}} />
              </div>
              <span className="text-xs font-semibold" style={{color: 'var(--obs-text-secondary)'}}>Level & XP</span>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <div className="text-lg sm:text-xl font-extrabold" style={{letterSpacing: '-0.02em'}}>
                  Lvl {gamification?.xp.level ?? 1} &middot; {gamification?.xp.title ?? "Rookie"}
                </div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{background: 'var(--obs-bg-elevated)'}}>
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ width: `${gamification?.xp.progress ?? 0}%`, background: 'var(--obs-accent-text)' }}
                  />
                </div>
                <p className="text-[10px] sm:text-xs mt-1.5 truncate" style={{color: 'var(--obs-text-tertiary)'}}>
                  {gamification?.xp.totalXp?.toLocaleString() ?? 0} / {gamification?.xp.nextLevelXp?.toLocaleString() ?? 500} XP
                </p>
              </>
            )}
          </div>

          {/* Hot Streak */}
          <div className="rounded-xl p-4" style={{
            background: 'var(--card)',
            border: '1px solid var(--obs-border-subtle)',
            boxShadow: 'var(--obs-shadow-card)',
          }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="stat-icon-wrap" style={{background: 'rgba(220,38,38,0.08)'}}>
                <Flame className="h-4 w-4" style={{color: '#dc2626'}} />
              </div>
              <span className="text-xs font-semibold" style={{color: 'var(--obs-text-secondary)'}}>Hot Streak</span>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-extrabold" style={{letterSpacing: '-0.02em'}}>
                  {gamification?.streaks.hotStreakCurrent ?? 0} 🔥
                </div>
                <p className="text-xs mt-1" style={{color: 'var(--obs-text-tertiary)'}}>
                  Best: {gamification?.streaks.hotStreakBest ?? 0}
                </p>
              </>
            )}
          </div>

          {/* Consistency Streak */}
          <div className="rounded-xl p-4" style={{
            background: 'var(--card)',
            border: '1px solid var(--obs-border-subtle)',
            boxShadow: 'var(--obs-shadow-card)',
          }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="stat-icon-wrap" style={{background: 'rgba(37,99,235,0.08)'}}>
                <Target className="h-4 w-4" style={{color: '#2563eb'}} />
              </div>
              <span className="text-xs font-semibold" style={{color: 'var(--obs-text-secondary)'}}>Consistency</span>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-extrabold" style={{letterSpacing: '-0.02em'}}>
                  {gamification?.streaks.consistencyStreakCurrent ?? 0} <span className="text-sm font-semibold" style={{color: 'var(--obs-text-tertiary)'}}>days</span>
                </div>
                <p className="text-xs mt-1" style={{color: 'var(--obs-text-tertiary)'}}>
                  Best: {gamification?.streaks.consistencyStreakBest ?? 0}
                </p>
              </>
            )}
          </div>

          {/* Badges */}
          <div className="rounded-xl p-4" style={{
            background: 'var(--card)',
            border: '1px solid var(--obs-border-subtle)',
            boxShadow: 'var(--obs-shadow-card)',
          }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="stat-icon-wrap" style={{background: 'rgba(124,58,237,0.08)'}}>
                <Award className="h-4 w-4" style={{color: '#7c3aed'}} />
              </div>
              <span className="text-xs font-semibold" style={{color: 'var(--obs-text-secondary)'}}>Badges</span>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-extrabold" style={{letterSpacing: '-0.02em'}}>
                  {gamification?.badgeCount ?? 0} <span className="text-sm font-semibold" style={{color: 'var(--obs-text-tertiary)'}}>earned</span>
                </div>
                <div className="flex flex-col gap-0.5 mt-1.5">
                  {gamification?.badges.slice(0, 3).map((badge: { code: string; name: string; icon: string; tier: string }, i: number) => (
                    <span key={i} className="text-[10px] sm:text-xs truncate" style={{color: 'var(--obs-text-secondary)'}} title={badge.name}>
                      {badge.icon} {badge.name} <span style={{color: 'var(--obs-text-tertiary)'}} className="capitalize">({badge.tier})</span>
                    </span>
                  ))}
                  {(gamification?.badgeCount ?? 0) > 3 && (
                    <span className="text-[10px]" style={{color: 'var(--obs-text-tertiary)'}}>+{(gamification?.badgeCount ?? 0) - 3} more</span>
                  )}
                  {(gamification?.badgeCount ?? 0) === 0 && (
                    <span className="text-[10px]" style={{color: 'var(--obs-text-tertiary)'}}>Grade calls to earn badges</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Recent Calls & Leaderboard - Stack on mobile */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Calls */}
        <div className="obs-panel">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold" style={{color: 'var(--foreground)', marginBottom: '2px'}}>Recent Calls</h3>
              <p className="text-xs" style={{color: 'var(--obs-text-tertiary)'}}>Last 5 graded calls</p>
            </div>
            <Link href="/calls">
              <Button variant="outline" size="sm" className="h-8 text-xs">View All</Button>
            </Link>
          </div>
          <div>
            {callsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : recentCalls?.items && recentCalls.items.length > 0 ? (
              <div className="space-y-2">
                {recentCalls.items.map((call: any) => (
                  <Link key={call.id} href={`/calls/${call.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all" style={{
                      border: '1px solid var(--obs-border-subtle)',
                      background: 'var(--card)',
                    }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {call.contactName || call.contactPhone || "Unknown"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs" style={{color: 'var(--obs-text-tertiary)'}}>
                            {call.teamMemberName || "Unassigned"}
                          </p>
                          <span className="text-xs" style={{color: 'var(--obs-text-tertiary)'}}>•</span>
                          <p className="text-xs" style={{color: 'var(--obs-text-tertiary)'}}>
                            {(() => {
                              const now = Date.now();
                              const callTime = new Date(call.createdAt).getTime();
                              const diffMs = now - callTime;
                              const diffMins = Math.floor(diffMs / 60000);
                              const diffHours = Math.floor(diffMins / 60);
                              const diffDays = Math.floor(diffHours / 24);
                              if (diffMins < 60) return `${diffMins}m ago`;
                              if (diffHours < 24) return `${diffHours}h ago`;
                              return `${diffDays}d ago`;
                            })()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {call.grade ? (
                          <GradeBadge grade={call.grade.overallGrade || "?"} />
                        ) : (
                          <span className="text-xs px-2 py-1 rounded" style={{background: 'var(--obs-bg-inset)', color: 'var(--obs-text-tertiary)'}}>
                            {call.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-6" style={{color: 'var(--obs-text-tertiary)'}}>
                <Phone className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No graded calls today</p>
                <p className="text-xs mt-1">Calls will appear here once they're graded</p>
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard Preview */}
        <div className="obs-panel">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold" style={{color: 'var(--foreground)', marginBottom: '2px'}}>Team Leaderboard</h3>
              <p className="text-xs" style={{color: 'var(--obs-text-tertiary)'}}>Top performers</p>
            </div>
            <Link href="/analytics">
              <Button variant="outline" size="sm" className="h-8 text-xs">View Full</Button>
            </Link>
          </div>
          <div>
            {leaderboardLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : leaderboard && leaderboard.length > 0 ? (
              <>
                <div className="space-y-2">
                  {leaderboard.slice(0, 5).map((entry, index) => (
                    <div 
                      key={entry.teamMember.id} 
                      className="flex items-center gap-3 p-3 rounded-lg transition-all"
                      style={{
                        border: '1px solid var(--obs-border-subtle)',
                        background: 'var(--card)',
                      }}
                    >
                      <div className={`lb-rank ${
                        index === 0 ? "lb-rank-1" :
                        index === 1 ? "lb-rank-2" :
                        index === 2 ? "lb-rank-3" :
                        "lb-rank-default"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{entry.teamMember.name}</p>
                        <p className="text-xs capitalize" style={{color: 'var(--obs-text-tertiary)'}}>
                          {entry.teamMember.teamRole?.replace("_", " ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg" style={{letterSpacing: '-0.02em'}}>
                          {entry.averageScore ? `${Math.round(entry.averageScore)}%` : "N/A"}
                        </p>
                        <p className="text-xs" style={{color: 'var(--obs-text-tertiary)'}}>
                          {entry.totalCalls} calls
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-6" style={{color: 'var(--obs-text-tertiary)'}}>
                <Award className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No leaderboard data yet</p>
                <p className="text-xs mt-1">Team rankings appear after calls are graded</p>
              </div>
            )}
          </div>
        </div>
      </div>


    </div>
  );
}
