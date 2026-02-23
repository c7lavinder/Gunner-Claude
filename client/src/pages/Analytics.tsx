import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, TrendingUp, CheckCircle, Calendar, Trophy, Users, MessageSquare, CheckCircle2, Clock, BarChart3, LineChart, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DateRange = "today" | "week" | "month" | "ytd" | "all";

const dateRangeLabels: Record<DateRange, string> = {
  today: "Today",
  week: "Last 7 Days",
  month: "Last 30 Days",
  ytd: "Year to Date",
  all: "All Time",
};

// Compact stat card matching Dashboard style
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

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  
  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery({ dateRange });
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.leaderboard.get.useQuery({ dateRange });

  const isLoading = statsLoading || leaderboardLoading;

  // Separate lead managers, acquisition managers, and lead generators
  const leadManagers = leaderboard?.filter(e => e.teamMember.teamRole === "lead_manager") || [];
  const acquisitionManagers = leaderboard?.filter(e => e.teamMember.teamRole === "acquisition_manager") || [];
  const leadGenerators = leaderboard?.filter(e => e.teamMember.teamRole === "lead_generator") || [];

  // Calculate team-wide metrics
  const teamMetrics = leaderboard?.reduce((acc, entry) => {
    acc.totalCalls += entry.totalCalls;
    acc.totalAGrades += entry.gradeDistribution.A;
    acc.totalBGrades += entry.gradeDistribution.B;
    acc.totalCGrades += entry.gradeDistribution.C;
    acc.totalDGrades += entry.gradeDistribution.D;
    acc.totalFGrades += entry.gradeDistribution.F;
    return acc;
  }, {
    totalCalls: 0,
    totalAGrades: 0,
    totalBGrades: 0,
    totalCGrades: 0,
    totalDGrades: 0,
    totalFGrades: 0,
  }) || {
    totalCalls: 0,
    totalAGrades: 0,
    totalBGrades: 0,
    totalCGrades: 0,
    totalDGrades: 0,
    totalFGrades: 0,
  };

  const totalGradedCalls = teamMetrics.totalAGrades + teamMetrics.totalBGrades + 
    teamMetrics.totalCGrades + teamMetrics.totalDGrades + teamMetrics.totalFGrades;
  
  const passingRate = totalGradedCalls > 0 
    ? Math.round(((teamMetrics.totalAGrades + teamMetrics.totalBGrades) / totalGradedCalls) * 100)
    : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">
            Team performance metrics and insights
          </p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[180px]">
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

      {/* Stats Grid - Same as Dashboard */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
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
          title="Leads Generated"
          value={stats?.leadsGenerated ?? 0}
          icon={Target}
          loading={statsLoading}
        />
        <StatCard
          title="Appointments Set"
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
          title="Average Score"
          value={stats?.averageScore ? `${Math.round(stats.averageScore)}%` : "N/A"}
          icon={TrendingUp}
          loading={statsLoading}
        />
      </div>

      {/* Team Leaderboard */}
      <Card className="mb-4 sm:mb-6">
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
            Team Leaderboard
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Ranked by appointments (LMs), offers (AMs), and leads generated (LGs) — {dateRange === 'today' ? 'today' : dateRange === 'week' ? 'last 7 days' : dateRange === 'month' ? 'last 30 days' : dateRange === 'ytd' ? 'year to date' : 'all time'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <Tabs defaultValue="lead_managers" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6">
              <TabsTrigger value="lead_managers">Lead Managers</TabsTrigger>
              <TabsTrigger value="acquisition_managers">Acquisition Managers</TabsTrigger>
              <TabsTrigger value="lead_generators">Lead Generators</TabsTrigger>
            </TabsList>

            {/* Lead Managers Leaderboard */}
            <TabsContent value="lead_managers">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : leadManagers.length > 0 ? (
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Rank</th>
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Name</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Calls</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Conv</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Appts</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">A-B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadManagers
                        .sort((a, b) => b.appointmentsSet - a.appointmentsSet)
                        .map((entry, index) => (
                        <tr key={entry.teamMember.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 sm:py-4 px-2 sm:px-4">
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm ${
                              index === 0 ? "bg-yellow-500 text-white" :
                              index === 1 ? "bg-gray-400 text-white" :
                              "bg-amber-700 text-white"
                            }`}>
                              {index + 1}
                            </div>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4">
                            <p className="font-medium text-sm sm:text-base">{entry.teamMember.name}</p>
                            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Lead Manager</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold">{entry.totalCalls}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold">{entry.gradedCalls}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold text-blue-600">{entry.appointmentsSet}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold text-emerald-600">{entry.abScoredCalls}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No lead managers data yet</p>
                </div>
              )}
            </TabsContent>

            {/* Acquisition Managers Leaderboard */}
            <TabsContent value="acquisition_managers">
              {isLoading ? (
                <div className="space-y-4">
                  {[1].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : acquisitionManagers.length > 0 ? (
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Rank</th>
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Name</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Calls</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Conv</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Offers</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">A-B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acquisitionManagers
                        .sort((a, b) => b.offerCallsCompleted - a.offerCallsCompleted)
                        .map((entry, index) => (
                        <tr key={entry.teamMember.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 sm:py-4 px-2 sm:px-4">
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm ${
                              index === 0 ? "bg-yellow-500 text-white" :
                              index === 1 ? "bg-gray-400 text-white" :
                              "bg-amber-700 text-white"
                            }`}>
                              {index + 1}
                            </div>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4">
                            <p className="font-medium text-sm sm:text-base">{entry.teamMember.name}</p>
                            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Acquisition Manager</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold">{entry.totalCalls}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold">{entry.gradedCalls}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold text-green-600">{entry.offerCallsCompleted}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold text-emerald-600">{entry.abScoredCalls}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No acquisition managers data yet</p>
                </div>
              )}
            </TabsContent>

            {/* Lead Generators Leaderboard */}
            <TabsContent value="lead_generators">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : leadGenerators.length > 0 ? (
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Rank</th>
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Name</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Calls</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Conv</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">Leads</th>
                        <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-medium text-muted-foreground text-xs sm:text-sm">A-B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadGenerators
                        .sort((a, b) => b.leadsGenerated - a.leadsGenerated)
                        .map((entry, index) => (
                        <tr key={entry.teamMember.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 sm:py-4 px-2 sm:px-4">
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm ${
                              index === 0 ? "bg-yellow-500 text-white" :
                              index === 1 ? "bg-gray-400 text-white" :
                              "bg-amber-700 text-white"
                            }`}>
                              {index + 1}
                            </div>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4">
                            <p className="font-medium text-sm sm:text-base">{entry.teamMember.name}</p>
                            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Lead Generator</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold">{entry.totalCalls}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold">{entry.gradedCalls}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold text-purple-600">{entry.leadsGenerated}</p>
                          </td>
                          <td className="py-2 sm:py-4 px-2 sm:px-4 text-center">
                            <p className="text-sm sm:text-lg font-bold text-emerald-600">{entry.abScoredCalls}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No lead generators data yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Analytics Insights Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Score Distribution
            </CardTitle>
            <CardDescription>
              Grade breakdown across all graded calls
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="space-y-3">
                {["A", "B", "C", "D", "F"].map((grade) => {
                  const count = stats?.gradeDistribution?.[grade as keyof typeof stats.gradeDistribution] ?? 0;
                  const total = Object.values(stats?.gradeDistribution ?? {}).reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  const colors: Record<string, string> = {
                    A: "bg-emerald-500",
                    B: "bg-green-500",
                    C: "bg-yellow-500",
                    D: "bg-orange-500",
                    F: "bg-red-500",
                  };
                  return (
                    <div key={grade} className="flex items-center gap-3">
                      <span className="w-8 font-bold text-lg">{grade}</span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${colors[grade]} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-sm text-muted-foreground">
                        {count} ({Math.round(percentage)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Call Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-500" />
              Call Metrics
            </CardTitle>
            <CardDescription>
              Performance metrics for graded calls
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-muted-foreground">Average Call Duration</span>
                  <span className="text-xl font-bold">
                    {stats?.averageCallDuration 
                      ? `${Math.floor(stats.averageCallDuration / 60)}m ${Math.round(stats.averageCallDuration % 60)}s`
                      : "N/A"
                    }
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-muted-foreground">Total Graded Calls</span>
                  <span className="text-xl font-bold">{stats?.gradedCalls ?? 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-muted-foreground">Passing Rate (A & B)</span>
                  <span className="text-xl font-bold text-emerald-600">
                    {stats?.gradeDistribution 
                      ? `${Math.round(((stats.gradeDistribution.A + stats.gradeDistribution.B) / Math.max(1, Object.values(stats.gradeDistribution).reduce((a, b) => a + b, 0))) * 100)}%`
                      : "N/A"
                    }
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Member Scores Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-500" />
            Team Member Scores
          </CardTitle>
          <CardDescription>
            Individual performance breakdown by team member
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : stats?.teamMemberScores && stats.teamMemberScores.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Team Member</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Avg Score</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Total Graded</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">A</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">B</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">C</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">D</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">F</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.teamMemberScores
                    .filter(m => m.totalGraded > 0)
                    .sort((a, b) => b.averageScore - a.averageScore)
                    .map((member) => (
                    <tr key={member.memberId} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-4 px-4 font-medium">{member.memberName}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`font-bold ${
                          member.averageScore >= 80 ? "text-emerald-600" :
                          member.averageScore >= 60 ? "text-yellow-600" : "text-red-600"
                        }`}>
                          {Math.round(member.averageScore)}%
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">{member.totalGraded}</td>
                      <td className="py-4 px-4 text-center text-emerald-600 font-medium">{member.gradeDistribution.A}</td>
                      <td className="py-4 px-4 text-center text-green-600 font-medium">{member.gradeDistribution.B}</td>
                      <td className="py-4 px-4 text-center text-yellow-600 font-medium">{member.gradeDistribution.C}</td>
                      <td className="py-4 px-4 text-center text-orange-600 font-medium">{member.gradeDistribution.D}</td>
                      <td className="py-4 px-4 text-center text-red-600 font-medium">{member.gradeDistribution.F}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No graded calls yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Trends Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-cyan-500" />
            Score Trends Over Time
          </CardTitle>
          <CardDescription>
            Weekly average scores for the past 12 weeks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : stats?.weeklyTrends && stats.weeklyTrends.length > 0 ? (
            <div className="space-y-6">
              {/* Team Average Trend Chart */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-4">Team Average Score</h4>
                <div className="relative h-48">
                  {/* Y-axis labels */}
                  <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-xs text-muted-foreground">
                    <span>100%</span>
                    <span>75%</span>
                    <span>50%</span>
                    <span>25%</span>
                    <span>0%</span>
                  </div>
                  {/* Chart area */}
                  <div className="ml-12 h-full relative">
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex flex-col justify-between">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="border-t border-muted h-0" />
                      ))}
                    </div>
                    {/* Line chart */}
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                      {/* Gradient fill under line */}
                      <defs>
                        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgb(6, 182, 212)" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="rgb(6, 182, 212)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {/* Build line segments that skip empty weeks (gradedCalls === 0) */}
                      {(() => {
                        const dataWeeks = stats.weeklyTrends
                          .map((week, i) => ({ ...week, i }))
                          .filter(w => w.gradedCalls > 0);
                        if (dataWeeks.length === 0) return null;
                        const total = stats.weeklyTrends.length;
                        // Build segments (consecutive data points)
                        const segments: typeof dataWeeks[] = [];
                        let current: typeof dataWeeks = [];
                        for (let j = 0; j < dataWeeks.length; j++) {
                          if (current.length === 0 || dataWeeks[j].i === dataWeeks[j-1].i + 1) {
                            current.push(dataWeeks[j]);
                          } else {
                            segments.push(current);
                            current = [dataWeeks[j]];
                          }
                        }
                        if (current.length > 0) segments.push(current);
                        return segments.map((seg, si) => {
                          const pts = seg.map(w => ({
                            x: total > 1 ? (w.i / (total - 1)) * 100 : 50,
                            y: 100 - w.averageScore,
                          }));
                          const lineD = pts.map((p, pi) => `${pi === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                          const areaD = lineD + ` L ${pts[pts.length-1].x} 100 L ${pts[0].x} 100 Z`;
                          return (
                            <g key={si}>
                              <path d={areaD} fill="url(#scoreGradient)" vectorEffect="non-scaling-stroke" />
                              <path d={lineD} fill="none" stroke="rgb(6, 182, 212)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                            </g>
                          );
                        });
                      })()}
                      {/* Data points — only for weeks with graded calls */}
                      {stats.weeklyTrends.map((week, i) => {
                        if (week.gradedCalls === 0) return null;
                        const x = stats.weeklyTrends.length > 1 ? (i / (stats.weeklyTrends.length - 1)) * 100 : 50;
                        const y = 100 - week.averageScore;
                        return (
                          <circle
                            key={i}
                            cx={`${x}%`}
                            cy={`${y}%`}
                            r="4"
                            fill="rgb(6, 182, 212)"
                            className="hover:r-6 transition-all"
                          >
                            <title>{`Week of ${week.weekStart}: ${week.averageScore}% (${week.gradedCalls} calls)`}</title>
                          </circle>
                        );
                      })}
                    </svg>
                  </div>
                </div>
                {/* X-axis labels */}
                <div className="ml-12 flex justify-between text-xs text-muted-foreground mt-2">
                  {stats.weeklyTrends.filter((_, i) => i % 3 === 0 || i === stats.weeklyTrends.length - 1).map((week, i) => (
                    <span key={i}>{new Date(week.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  ))}
                </div>
              </div>

              {/* Weekly Stats Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Week</th>
                      <th className="text-center py-2 px-3 font-medium">Avg Score</th>
                      <th className="text-center py-2 px-3 font-medium">Total Calls</th>
                      <th className="text-center py-2 px-3 font-medium">Graded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.weeklyTrends.slice().reverse().slice(0, 6).map((week, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="py-2 px-3">
                          {new Date(week.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`font-medium ${
                            week.averageScore >= 80 ? "text-emerald-600" :
                            week.averageScore >= 60 ? "text-yellow-600" :
                            week.averageScore > 0 ? "text-red-600" : "text-muted-foreground"
                          }`}>
                            {week.averageScore > 0 ? `${week.averageScore}%` : "—"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">{week.totalCalls}</td>
                        <td className="py-2 px-3 text-center">{week.gradedCalls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <LineChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No trend data available yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Team Member Trends */}
      {stats?.teamMemberTrends && stats.teamMemberTrends.filter(m => m.weeklyScores.some(w => w.callCount > 0)).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-violet-500" />
              Individual Performance Trends
            </CardTitle>
            <CardDescription>
              Weekly score trends by team member
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {stats.teamMemberTrends
                .filter(member => member.weeklyScores.some(w => w.callCount > 0))
                .map((member, memberIndex) => {
                  const colors = [
                    "rgb(59, 130, 246)", // blue
                    "rgb(16, 185, 129)", // emerald
                    "rgb(245, 158, 11)", // amber
                    "rgb(139, 92, 246)", // violet
                  ];
                  const color = colors[memberIndex % colors.length];
                  
                  return (
                    <div key={member.memberId} className="border rounded-lg p-4">
                      <h4 className="font-medium mb-3">{member.memberName}</h4>
                      <div className="relative h-32">
                        {/* Mini chart */}
                        <svg className="w-full h-full" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id={`gradient-${member.memberId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                              <stop offset="100%" stopColor={color} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {/* Area */}
                          <path
                            d={`M 0 ${100 - (member.weeklyScores[0]?.averageScore || 0)} ` +
                              member.weeklyScores.map((week, i) => {
                                const x = (i / (member.weeklyScores.length - 1)) * 100;
                                const y = 100 - week.averageScore;
                                return `L ${x} ${y}`;
                              }).join(' ') +
                              ` L 100 100 L 0 100 Z`}
                            fill={`url(#gradient-${member.memberId})`}
                            vectorEffect="non-scaling-stroke"
                          />
                          {/* Line */}
                          <path
                            d={`M 0 ${100 - (member.weeklyScores[0]?.averageScore || 0)} ` +
                              member.weeklyScores.map((week, i) => {
                                const x = (i / (member.weeklyScores.length - 1)) * 100;
                                const y = 100 - week.averageScore;
                                return `L ${x} ${y}`;
                              }).join(' ')}
                            fill="none"
                            stroke={color}
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                      </div>
                      {/* Stats summary */}
                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-muted-foreground">
                          {member.weeklyScores.reduce((sum, w) => sum + w.callCount, 0)} total calls
                        </span>
                        <span className="font-medium" style={{ color }}>
                          {(() => {
                            const recentScores = member.weeklyScores.slice(-4).filter(w => w.callCount > 0);
                            if (recentScores.length === 0) return "No recent data";
                            const avg = recentScores.reduce((sum, w) => sum + w.averageScore, 0) / recentScores.length;
                            return `${Math.round(avg)}% avg (last 4 weeks)`;
                          })()}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
