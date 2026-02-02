import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, TrendingUp, CheckCircle, Calendar, Trophy, Users, MessageSquare, CheckCircle2 } from "lucide-react";
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
  const [dateRange, setDateRange] = useState<DateRange>("today");
  
  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery({ dateRange });
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Calls Made"
          value={stats?.totalCalls ?? 0}
          description={dateRangeLabels[dateRange]}
          icon={Phone}
          loading={statsLoading}
        />
        <StatCard
          title="Conversations"
          value={stats?.gradedCalls ?? 0}
          description="Actual conversations"
          icon={MessageSquare}
          loading={statsLoading}
        />
        <StatCard
          title="Appointments Set"
          value={stats?.appointmentsSet ?? 0}
          description={dateRangeLabels[dateRange]}
          icon={Calendar}
          loading={statsLoading}
        />
        <StatCard
          title="Offers Accepted"
          value={stats?.offersAccepted ?? 0}
          description={dateRangeLabels[dateRange]}
          icon={CheckCircle2}
          loading={statsLoading}
        />
        <StatCard
          title="Average Score"
          value={stats?.averageScore ? `${Math.round(stats.averageScore)}%` : "N/A"}
          description="Team average"
          icon={TrendingUp}
          loading={statsLoading}
          variant={stats?.averageScore && stats.averageScore >= 80 ? "success" : 
                   stats?.averageScore && stats.averageScore >= 60 ? "warning" : "default"}
        />
      </div>

      {/* Additional Analytics Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Passing Rate"
          value={`${passingRate}%`}
          description="A & B grades"
          icon={CheckCircle}
          loading={isLoading}
          variant={passingRate >= 80 ? "success" : passingRate >= 60 ? "warning" : "danger"}
        />
        <StatCard
          title="Total Graded"
          value={totalGradedCalls}
          description="All time graded calls"
          icon={Phone}
          loading={isLoading}
        />
        <StatCard
          title="Team Members"
          value={leaderboard?.length ?? 0}
          description="Active team members"
          icon={Users}
          loading={isLoading}
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
    </div>
  );
}
