import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, TrendingUp, Award, Calendar, CheckCircle2, MessageSquare, Loader2, CheckCircle, XCircle, Clock, PhoneOff, VoicemailIcon, PhoneMissed, AlertCircle, Flame, Trophy, Target, Zap, AlertTriangle, Lightbulb, ArrowRight } from "lucide-react";
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
  loading 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="p-1.5 sm:p-2 rounded-lg bg-muted shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <div className="text-xl sm:text-2xl font-bold truncate">{value}</div>
          )}
          <p className="text-xs text-muted-foreground truncate">{title}</p>
        </div>
      </div>
    </Card>
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
  
  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery({ dateRange });
  const { data: recentCalls, isLoading: callsLoading } = trpc.calls.withGrades.useQuery({ limit: 5 });
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.leaderboard.get.useQuery();
  const { data: gamification, isLoading: gamificationLoading } = trpc.gamification.getSummary.useQuery();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.isTenantAdmin === "true";
  const { data: signalCounts, isLoading: signalsLoading } = trpc.opportunities.counts.useQuery(undefined, {
    enabled: isAdmin,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back, {firstName}!</h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">
            Here's how your team is performing
          </p>
        </div>
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

      {/* Stats Grid - 2 columns on mobile, 5 on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
        <StatCard
          title="Calls Made"
          value={stats?.totalCalls ?? 0}
          icon={Phone}
          loading={statsLoading}
        />
        <StatCard
          title="Conversations"
          value={stats?.gradedCalls ?? 0}
          icon={MessageSquare}
          loading={statsLoading}
        />
        <StatCard
          title="Appointments"
          value={stats?.appointmentsSet ?? 0}
          icon={Calendar}
          loading={statsLoading}
        />
        <StatCard
          title="Offer Calls"
          value={stats?.offerCallsCompleted ?? 0}
          icon={CheckCircle2}
          loading={statsLoading}
        />
        <StatCard
          title="Avg Score"
          value={stats?.averageScore ? `${Math.round(stats.averageScore)}%` : "N/A"}
          icon={TrendingUp}
          loading={statsLoading}
        />
      </div>

      {/* Admin: Pipeline Signals Summary | Non-admin: Gamification Stats */}
      {isAdmin ? (
        <Link href="/opportunities">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 cursor-pointer group">
            {/* Missed */}
            <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950 dark:to-rose-950 p-3 sm:p-4 border-red-200 dark:border-red-800 group-hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">Missed</span>
                </div>
                {(signalCounts?.missed ?? 0) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 font-medium">
                    {signalCounts?.missed} active
                  </span>
                )}
              </div>
              {signalsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <>
                  <div className="text-2xl sm:text-3xl font-bold text-red-900 dark:text-red-100">
                    {signalCounts?.missed ?? 0}
                  </div>
                  <p className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 mt-1">
                    Deals slipping through the cracks
                  </p>
                </>
              )}
            </Card>

            {/* At Risk */}
            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 p-3 sm:p-4 border-amber-200 dark:border-amber-800 group-hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">At Risk</span>
                </div>
                {(signalCounts?.warning ?? 0) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 font-medium">
                    {signalCounts?.warning} active
                  </span>
                )}
              </div>
              {signalsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <>
                  <div className="text-2xl sm:text-3xl font-bold text-amber-900 dark:text-amber-100">
                    {signalCounts?.warning ?? 0}
                  </div>
                  <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Needs attention within 24h
                  </p>
                </>
              )}
            </Card>

            {/* Worth a Look */}
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 p-3 sm:p-4 border-blue-200 dark:border-blue-800 group-hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900">
                    <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Worth a Look</span>
                </div>
                {(signalCounts?.possible ?? 0) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 font-medium">
                    {signalCounts?.possible} active
                  </span>
                )}
              </div>
              {signalsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <>
                  <div className="text-2xl sm:text-3xl font-bold text-blue-900 dark:text-blue-100">
                    {signalCounts?.possible ?? 0}
                  </div>
                  <p className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Potential deals to review
                  </p>
                </>
              )}
            </Card>
          </div>
        </Link>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {/* Level & XP - Compact */}
          <Card className="bg-gradient-to-br from-orange-50 to-amber-50 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="text-xs font-medium text-orange-700">Level & XP</span>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <div className="text-lg sm:text-xl font-bold text-orange-900">
                  Lvl {gamification?.xp.level ?? 1}
                </div>
                <div className="mt-1.5 h-1.5 bg-orange-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-orange-500 transition-all duration-500" 
                    style={{ width: `${gamification?.xp.progress ?? 0}%` }}
                  />
                </div>
                <p className="text-[10px] sm:text-xs text-orange-600 mt-1 truncate">
                  {gamification?.xp.title ?? "Rookie"}
                </p>
              </>
            )}
          </Card>

          {/* Hot Streak - Compact */}
          <Card className="bg-gradient-to-br from-red-50 to-orange-50 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-xs font-medium text-red-700">Hot Streak</span>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <div className="text-lg sm:text-xl font-bold text-red-900">
                  {gamification?.streaks.hotStreakCurrent ?? 0} 🔥
                </div>
                <p className="text-[10px] sm:text-xs text-red-600 mt-1">
                  Best: {gamification?.streaks.hotStreakBest ?? 0}
                </p>
              </>
            )}
          </Card>

          {/* Consistency Streak - Compact */}
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-xs font-medium text-blue-700">Consistency</span>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <div className="text-lg sm:text-xl font-bold text-blue-900">
                  {gamification?.streaks.consistencyStreakCurrent ?? 0} days
                </div>
                <p className="text-[10px] sm:text-xs text-blue-600 mt-1">
                  Best: {gamification?.streaks.consistencyStreakBest ?? 0}
                </p>
              </>
            )}
          </Card>

          {/* Badges - Compact */}
          <Card className="bg-gradient-to-br from-purple-50 to-pink-50 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-4 w-4 text-purple-500 shrink-0" />
              <span className="text-xs font-medium text-purple-700">Badges</span>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <div className="text-lg sm:text-xl font-bold text-purple-900">
                  {gamification?.badgeCount ?? 0}
                </div>
                <div className="flex gap-0.5 mt-1">
                  {gamification?.badges.slice(0, 3).map((badge: { code: string; icon: string }, i: number) => (
                    <span key={i} className="text-sm" title={badge.code}>{badge.icon}</span>
                  ))}
                  {(gamification?.badgeCount ?? 0) > 3 && (
                    <span className="text-[10px] text-purple-600">+{(gamification?.badgeCount ?? 0) - 3}</span>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Recent Calls & Leaderboard - Stack on mobile */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Calls */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4 sm:p-6 pb-2 sm:pb-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Recent Calls</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Latest graded calls</CardDescription>
            </div>
            <Link href="/calls">
              <Button variant="outline" size="sm" className="h-8 text-xs sm:text-sm">View All</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
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
                    <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {call.contactName || call.contactPhone || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {call.teamMemberName || "Unassigned"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {call.grade ? (
                          <GradeBadge grade={call.grade.overallGrade || "?"} />
                        ) : (
                          <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                            {call.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Phone className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No calls yet</p>
                <p className="text-xs mt-1">Upload your first call recording to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leaderboard Preview - Horizontal top 3 on mobile */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4 sm:p-6 pb-2 sm:pb-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Team Leaderboard</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Top performers</CardDescription>
            </div>
            <Link href="/analytics">
              <Button variant="outline" size="sm" className="h-8 text-xs sm:text-sm">View Full</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
            {leaderboardLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : leaderboard && leaderboard.length > 0 ? (
              <>
                {/* Mobile: Horizontal podium for top 3 */}
                <div className="flex gap-2 sm:hidden">
                  {leaderboard.slice(0, 3).map((entry, index) => (
                    <div 
                      key={entry.teamMember.id} 
                      className={`flex-1 p-2 rounded-lg border text-center ${
                        index === 0 ? "bg-yellow-50 border-yellow-200" :
                        index === 1 ? "bg-gray-50 border-gray-200" :
                        "bg-amber-50 border-amber-200"
                      }`}
                    >
                      <div className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center font-bold text-xs ${
                        index === 0 ? "bg-yellow-500 text-white" :
                        index === 1 ? "bg-gray-400 text-white" :
                        "bg-amber-700 text-white"
                      }`}>
                        {index + 1}
                      </div>
                      <p className="font-medium text-xs mt-1 truncate">{entry.teamMember.name.split(' ')[0]}</p>
                      <p className="font-bold text-sm">
                        {entry.averageScore ? `${Math.round(entry.averageScore)}%` : "N/A"}
                      </p>
                    </div>
                  ))}
                </div>
                {/* Desktop: Vertical list */}
                <div className="hidden sm:block space-y-2">
                  {leaderboard.slice(0, 3).map((entry, index) => (
                    <div 
                      key={entry.teamMember.id} 
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        index === 0 ? "bg-yellow-500 text-white" :
                        index === 1 ? "bg-gray-400 text-white" :
                        "bg-amber-700 text-white"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{entry.teamMember.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {entry.teamMember.teamRole?.replace("_", " ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">
                          {entry.averageScore ? `${Math.round(entry.averageScore)}%` : "N/A"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.totalCalls} calls
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Award className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No leaderboard data yet</p>
                <p className="text-xs mt-1">Team rankings appear after calls are graded</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Processing Status - Horizontal row on mobile */}
      <Card>
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
            Call Processing
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
          {statsLoading ? (
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              <div className="flex flex-col items-center p-2 sm:p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 mb-1" />
                <p className="text-lg sm:text-2xl font-bold text-blue-700 dark:text-blue-300">{stats?.pendingCalls ?? 0}</p>
                <p className="text-[10px] sm:text-sm text-blue-600 dark:text-blue-400">Queued</p>
              </div>
              <div className="flex flex-col items-center p-2 sm:p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400 mb-1" />
                <p className="text-lg sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300">{stats?.gradedCalls ?? 0}</p>
                <p className="text-[10px] sm:text-sm text-emerald-600 dark:text-emerald-400">Scored</p>
              </div>
              <div className="flex flex-col items-center p-2 sm:p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400 mb-1" />
                <p className="text-lg sm:text-2xl font-bold text-amber-700 dark:text-amber-300">{stats?.skippedCalls ?? 0}</p>
                <p className="text-[10px] sm:text-sm text-amber-600 dark:text-amber-400">Skipped</p>
              </div>
              <div className="flex flex-col items-center p-2 sm:p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 dark:text-gray-400 mb-1" />
                <p className="text-lg sm:text-2xl font-bold text-gray-700 dark:text-gray-300">{stats?.totalCalls ?? 0}</p>
                <p className="text-[10px] sm:text-sm text-gray-600 dark:text-gray-400">Total</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
