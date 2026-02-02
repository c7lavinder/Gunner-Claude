import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, TrendingUp, Clock, CheckCircle, AlertCircle, Calendar, BarChart3, Trophy, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  loading,
  variant = "default"
}: { 
  title: string; 
  value: string | number; 
  description?: string; 
  icon: React.ElementType;
  loading?: boolean;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantStyles = {
    default: "",
    success: "border-green-200 dark:border-green-900",
    warning: "border-yellow-200 dark:border-yellow-900",
    danger: "border-red-200 dark:border-red-900",
  };

  const iconStyles = {
    default: "text-muted-foreground",
    success: "text-green-500",
    warning: "text-yellow-500",
    danger: "text-red-500",
  };

  return (
    <Card className={variantStyles[variant]}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconStyles[variant]}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery({});
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.leaderboard.get.useQuery();

  const isLoading = statsLoading || leaderboardLoading;

  // Separate lead managers and acquisition managers
  const leadManagers = leaderboard?.filter(e => e.teamMember.teamRole === "lead_manager") || [];
  const acquisitionManagers = leaderboard?.filter(e => e.teamMember.teamRole === "acquisition_manager") || [];

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Team performance metrics and insights
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Calls"
          value={stats?.totalCalls ?? 0}
          description="All time"
          icon={Phone}
          loading={isLoading}
        />
        <StatCard
          title="Calls This Week"
          value={stats?.callsThisWeek ?? 0}
          description="Last 7 days"
          icon={Calendar}
          loading={isLoading}
        />
        <StatCard
          title="Team Average"
          value={stats?.averageScore ? `${Math.round(stats.averageScore)}%` : "N/A"}
          description="Average score"
          icon={TrendingUp}
          loading={isLoading}
          variant={stats?.averageScore && stats.averageScore >= 80 ? "success" : 
                   stats?.averageScore && stats.averageScore >= 60 ? "warning" : "default"}
        />
        <StatCard
          title="Passing Rate"
          value={`${passingRate}%`}
          description="A & B grades"
          icon={CheckCircle}
          loading={isLoading}
          variant={passingRate >= 80 ? "success" : passingRate >= 60 ? "warning" : "danger"}
        />
      </div>

      {/* Team Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Team Leaderboard
          </CardTitle>
          <CardDescription>
            Performance rankings by role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="lead_managers" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="lead_managers">Lead Managers</TabsTrigger>
              <TabsTrigger value="acquisition_managers">Acquisition Managers</TabsTrigger>
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
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rank</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">Total Calls</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">Conversations</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">Appts Set</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">A-B Calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadManagers
                        .sort((a, b) => b.appointmentsSet - a.appointmentsSet)
                        .map((entry, index) => (
                        <tr key={entry.teamMember.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-4 px-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              index === 0 ? "bg-yellow-500 text-white" :
                              index === 1 ? "bg-gray-400 text-white" :
                              "bg-amber-700 text-white"
                            }`}>
                              {index + 1}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <p className="font-medium">{entry.teamMember.name}</p>
                            <p className="text-sm text-muted-foreground">Lead Manager</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="text-lg font-bold">{entry.totalCalls}</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="text-lg font-bold">{entry.gradedCalls}</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="text-lg font-bold text-blue-600">{entry.appointmentsSet}</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="text-lg font-bold text-emerald-600">{entry.abScoredCalls}</p>
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
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rank</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">Total Calls</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">Conversations</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">Offers Accepted</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">A-B Calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acquisitionManagers
                        .sort((a, b) => b.offersAccepted - a.offersAccepted)
                        .map((entry, index) => (
                        <tr key={entry.teamMember.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-4 px-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              index === 0 ? "bg-yellow-500 text-white" :
                              index === 1 ? "bg-gray-400 text-white" :
                              "bg-amber-700 text-white"
                            }`}>
                              {index + 1}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <p className="font-medium">{entry.teamMember.name}</p>
                            <p className="text-sm text-muted-foreground">Acquisition Manager</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="text-lg font-bold">{entry.totalCalls}</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="text-lg font-bold">{entry.gradedCalls}</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="text-lg font-bold text-green-600">{entry.offersAccepted}</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="text-lg font-bold text-emerald-600">{entry.abScoredCalls}</p>
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
          </Tabs>
        </CardContent>
      </Card>

      {/* Grade Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Grade Distribution
          </CardTitle>
          <CardDescription>
            Breakdown of all graded calls by grade
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : totalGradedCalls > 0 ? (
            <div className="space-y-4">
              {/* Visual bar chart */}
              <div className="flex h-8 rounded-lg overflow-hidden">
                {teamMetrics.totalAGrades > 0 && (
                  <div 
                    className="bg-emerald-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(teamMetrics.totalAGrades / totalGradedCalls) * 100}%` }}
                  >
                    {teamMetrics.totalAGrades > 2 && "A"}
                  </div>
                )}
                {teamMetrics.totalBGrades > 0 && (
                  <div 
                    className="bg-teal-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(teamMetrics.totalBGrades / totalGradedCalls) * 100}%` }}
                  >
                    {teamMetrics.totalBGrades > 2 && "B"}
                  </div>
                )}
                {teamMetrics.totalCGrades > 0 && (
                  <div 
                    className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(teamMetrics.totalCGrades / totalGradedCalls) * 100}%` }}
                  >
                    {teamMetrics.totalCGrades > 2 && "C"}
                  </div>
                )}
                {teamMetrics.totalDGrades > 0 && (
                  <div 
                    className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(teamMetrics.totalDGrades / totalGradedCalls) * 100}%` }}
                  >
                    {teamMetrics.totalDGrades > 2 && "D"}
                  </div>
                )}
                {teamMetrics.totalFGrades > 0 && (
                  <div 
                    className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(teamMetrics.totalFGrades / totalGradedCalls) * 100}%` }}
                  >
                    {teamMetrics.totalFGrades > 2 && "F"}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="grid grid-cols-5 gap-4 text-center">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-600">{teamMetrics.totalAGrades}</p>
                  <p className="text-sm text-muted-foreground">A (90-100%)</p>
                </div>
                <div className="p-3 bg-teal-50 dark:bg-teal-950 rounded-lg">
                  <p className="text-2xl font-bold text-teal-600">{teamMetrics.totalBGrades}</p>
                  <p className="text-sm text-muted-foreground">B (80-89%)</p>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{teamMetrics.totalCGrades}</p>
                  <p className="text-sm text-muted-foreground">C (70-79%)</p>
                </div>
                <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                  <p className="text-2xl font-bold text-orange-600">{teamMetrics.totalDGrades}</p>
                  <p className="text-sm text-muted-foreground">D (60-69%)</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{teamMetrics.totalFGrades}</p>
                  <p className="text-sm text-muted-foreground">F (&lt;60%)</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No graded calls yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Status */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Status</CardTitle>
          <CardDescription>
            Current call processing queue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Clock className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold">{stats?.pendingCalls ?? 0}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
                <p className="text-2xl font-bold">{stats?.gradedCalls ?? 0}</p>
                <p className="text-sm text-muted-foreground">Graded</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <AlertCircle className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
                <p className="text-2xl font-bold">{stats?.skippedCalls ?? 0}</p>
                <p className="text-sm text-muted-foreground">Skipped</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Phone className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">{stats?.totalCalls ?? 0}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Classification Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Call Classification</CardTitle>
          <CardDescription>
            Breakdown of call types received
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : stats?.classificationBreakdown ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <p className="text-xl font-bold text-green-600">{stats.classificationBreakdown.conversation}</p>
                <p className="text-xs text-muted-foreground">Conversations</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p className="text-xl font-bold text-gray-600">{stats.classificationBreakdown.voicemail}</p>
                <p className="text-xs text-muted-foreground">Voicemails</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                <p className="text-xl font-bold text-yellow-600">{stats.classificationBreakdown.no_answer}</p>
                <p className="text-xs text-muted-foreground">No Answer</p>
              </div>
              <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <p className="text-xl font-bold text-blue-600">{stats.classificationBreakdown.callback_request}</p>
                <p className="text-xs text-muted-foreground">Callbacks</p>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                <p className="text-xl font-bold text-red-600">{stats.classificationBreakdown.wrong_number}</p>
                <p className="text-xs text-muted-foreground">Wrong Number</p>
              </div>
              <div className="text-center p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <p className="text-xl font-bold text-orange-600">{stats.classificationBreakdown.too_short}</p>
                <p className="text-xs text-muted-foreground">Too Short</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No classification data yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
