import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, TrendingUp, Award, Calendar, CheckCircle2, MessageSquare, Loader2, CheckCircle, XCircle, Clock, PhoneOff, VoicemailIcon, PhoneMissed, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DateRange = "today" | "week" | "month" | "ytd" | "all";

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  loading 
}: { 
  title: string; 
  value: string | number; 
  description?: string; 
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
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
  const [dateRange, setDateRange] = useState<DateRange>("today");
  
  const { data: stats, isLoading: statsLoading } = trpc.analytics.stats.useQuery({ dateRange });
  const { data: recentCalls, isLoading: callsLoading } = trpc.calls.withGrades.useQuery({ limit: 5 });
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.leaderboard.get.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome to Gunner - Your AI-powered call coaching platform
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

      {/* Stats Grid */}
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
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Calls */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Calls</CardTitle>
              <CardDescription>Latest graded calls from your team</CardDescription>
            </div>
            <Link href="/calls">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {callsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentCalls && recentCalls.length > 0 ? (
              <div className="space-y-3">
                {recentCalls.map((call) => (
                  <Link key={call.id} href={`/calls/${call.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {call.contactName || call.contactPhone || "Unknown Contact"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {call.teamMemberName || "Unassigned"} • {call.callType === "offer" ? "Offer Call" : "Qualification"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
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
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No calls yet</p>
                <p className="text-sm">Calls will appear here once received via webhook</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leaderboard Preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Team Leaderboard</CardTitle>
              <CardDescription>Top performers this period</CardDescription>
            </div>
            <Link href="/analytics">
              <Button variant="outline" size="sm">View Full</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {leaderboardLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : leaderboard && leaderboard.length > 0 ? (
              <div className="space-y-3">
                {leaderboard.slice(0, 3).map((entry, index) => (
                  <div 
                    key={entry.teamMember.id} 
                    className="flex items-center gap-4 p-3 rounded-lg border"
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Award className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No data yet</p>
                <p className="text-sm">Rankings will appear after calls are graded</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Processing Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call Processing Status
          </CardTitle>
          <CardDescription>
            Overview of call queue and processing results
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Processing Status Row */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                  <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats?.pendingCalls ?? 0}</p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">Queued</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                  <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900">
                    <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{stats?.gradedCalls ?? 0}</p>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">Scored</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats?.skippedCalls ?? 0}</p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">Skipped</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                  <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
                    <Phone className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{stats?.totalCalls ?? 0}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                  </div>
                </div>
              </div>

              {/* Classification Breakdown */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Classification Breakdown</h4>
                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <div className="flex items-center gap-2 p-3 rounded-lg border">
                    <MessageSquare className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="font-bold">{stats?.classificationBreakdown?.conversation ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Conversations</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border">
                    <VoicemailIcon className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="font-bold">{stats?.classificationBreakdown?.voicemail ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Voicemail</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border">
                    <PhoneMissed className="h-4 w-4 text-red-500" />
                    <div>
                      <p className="font-bold">{stats?.classificationBreakdown?.no_answer ?? 0}</p>
                      <p className="text-xs text-muted-foreground">No Answer</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border">
                    <Phone className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="font-bold">{stats?.classificationBreakdown?.callback_request ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Callback</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border">
                    <PhoneOff className="h-4 w-4 text-orange-500" />
                    <div>
                      <p className="font-bold">{stats?.classificationBreakdown?.wrong_number ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Wrong Number</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="font-bold">{stats?.classificationBreakdown?.too_short ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Too Short</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
