import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, TrendingUp, Clock, CheckCircle, AlertCircle, Calendar, BarChart3 } from "lucide-react";

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
  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery();
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.leaderboard.get.useQuery();

  const isLoading = statsLoading || leaderboardLoading;

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

      {/* Individual Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Individual Performance</CardTitle>
          <CardDescription>
            Performance breakdown by team member
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : leaderboard && leaderboard.length > 0 ? (
            <div className="space-y-4">
              {leaderboard.map((entry) => (
                <div 
                  key={entry.teamMember.id}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium">{entry.teamMember.name}</h4>
                    <p className="text-sm text-muted-foreground capitalize">
                      {entry.teamMember.teamRole?.replace("_", " ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="font-bold">{entry.totalCalls}</p>
                      <p className="text-muted-foreground">Calls</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold">
                        {entry.averageScore ? `${Math.round(entry.averageScore)}%` : "N/A"}
                      </p>
                      <p className="text-muted-foreground">Avg</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-emerald-500">{entry.gradeDistribution.A}</p>
                      <p className="text-muted-foreground">A's</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-red-500">{entry.gradeDistribution.F}</p>
                      <p className="text-muted-foreground">F's</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No team data available</p>
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
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.completedCalls ?? 0}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-full">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.pendingCalls ?? 0}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-full">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {(stats?.totalCalls ?? 0) - (stats?.completedCalls ?? 0) - (stats?.pendingCalls ?? 0)}
                </p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
