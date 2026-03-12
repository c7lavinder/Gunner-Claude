import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Phone,
  BarChart3,
  Zap,
  UserPlus,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageShell } from "@/components/layout/PageShell";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { trpc } from "@/lib/trpc";
import { HOT_STREAK_THRESHOLD } from "@shared/types";
import { TeamAchievements } from "./team/TeamAchievements";
import { TeamHotStreaks } from "./team/TeamHotStreaks";

function scoreToLetter(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function gradeColor(letter: string): string {
  switch (letter) {
    case "A": return "text-[var(--g-grade-a)]";
    case "B": return "text-[var(--g-grade-b)]";
    case "C": return "text-[var(--g-grade-c)]";
    case "D": return "text-[var(--g-grade-d)]";
    default: return "text-[var(--g-grade-f)]";
  }
}

function MiniSparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const w = 60;
  const h = 24;
  const pad = 2;
  const points = scores.map((v, i) => {
    const x = pad + (i / (scores.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const color = scores[scores.length - 1]! > scores[0]! ? "var(--g-up)" : scores[scores.length - 1]! < scores[0]! ? "var(--g-down)" : "var(--g-text-tertiary)";
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" points={points.join(" ")} />
    </svg>
  );
}

function roleLabel(code: string, roles: { code: string; name: string }[]): string {
  return roles.find((r) => r.code === code)?.name ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Team() {
  const [period, setPeriod] = useState("week");
  const { roles } = useTenantConfig();
  const { data: members, isLoading: membersLoading, isError: membersError } = trpc.team.list.useQuery();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: leaderboard, isLoading: leaderboardLoading, isError: leaderboardError } = trpc.gamification.getLeaderboard.useQuery({ period });
  const { data: badgesData, isLoading: badgesLoading, isError: badgesError } = trpc.gamification.getBadges.useQuery();

  const isLoading = membersLoading || leaderboardLoading || badgesLoading;
  const isError = membersError || leaderboardError || badgesError;
  const currentMemberId = members?.find((m) => m.userId === me?.id)?.id ?? null;
  const displayList = (leaderboard ?? []).sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
  const activeStreaks = displayList.filter((m) => (m.streak?.hotStreakCurrent ?? 0) >= HOT_STREAK_THRESHOLD).length;
  const teamAvg =
    displayList.length > 0
      ? Math.round(displayList.reduce((s, m) => s + (m.averageScore ?? 0), 0) / displayList.length)
      : 0;
  const totalCalls = displayList.reduce((s, m) => s + (m.totalCalls ?? 0), 0);

  const periodLabel = period === "today" ? "Today" : period === "week" ? "This Week" : period === "month" ? "This Month" : "All Time";

  const earnedBadgeIds = new Set((badgesData?.earned ?? []).map((e) => e.badgeCode));
  const earnedAtMap = new Map(
    (badgesData?.earned ?? []).map((e) => [e.badgeCode, e.earnedAt])
  );
  const definitions = badgesData?.definitions ?? [];

  if (isError) {
    return (
      <PageShell title="Team Leaderboard">
        <ErrorState onRetry={() => window.location.reload()} />
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <PageShell title="Team Leaderboard">
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
          <CardContent className="pt-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Team Leaderboard">
      <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
        <CardHeader className="pb-2">
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList className="bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)]">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
              <TabsTrigger value="month">This Month</TabsTrigger>
              <TabsTrigger value="all">All Time</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-0">
          {displayList.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No team members yet"
              description="Invite team members from Settings to see the leaderboard."
              actionLabel="Go to Settings"
              onAction={() => window.location.assign("/settings")}
            />
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-4 px-4 pb-1">
                <div className="w-8 shrink-0" />
                <div className="size-9 shrink-0" />
                <div className="min-w-0 flex-1" />
                <div className="flex shrink-0 items-center gap-3">
                  <span className="w-10 text-right text-xs text-[var(--g-text-tertiary)]">Grade</span>
                  <span className="w-[60px] text-center text-xs text-[var(--g-text-tertiary)]">Trend</span>
                  <span className="w-10 text-right text-xs text-[var(--g-text-tertiary)]">Calls</span>
                  <span className="w-14 text-right text-xs text-[var(--g-text-tertiary)]">XP</span>
                  <span className="w-8 text-right text-xs text-[var(--g-text-tertiary)]">Streak</span>
                </div>
              </div>
              {displayList.map((m, i) => {
                const rank = i + 1;
                const medal = rank <= 3 ? ["var(--g-grade-a)", "var(--g-text-secondary)", "var(--g-accent-text)"][rank - 1] : null;
                const isCurrent = m.id === currentMemberId;
                const avgScore = Math.round(m.averageScore ?? 0);
                const letter = scoreToLetter(avgScore);
                const streak = m.streak?.hotStreakCurrent ?? 0;
                const change = (m as { scoreChange?: number }).scoreChange ?? 0;
                const totalXp = m.xp?.totalXp ?? 0;
                const weekly = ((m as { weeklyScores?: number[] }).weeklyScores ?? []);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center gap-4 rounded-lg px-4 py-3 transition-colors",
                      isCurrent && "bg-[var(--g-accent-soft)]"
                    )}
                  >
                    <div className="flex w-8 shrink-0 items-center justify-center">
                      {medal ? (
                        <span className="text-lg font-bold" style={{ color: medal }}>
                          #{rank}
                        </span>
                      ) : (
                        <span className="text-sm text-[var(--g-text-tertiary)]">
                          #{rank}
                        </span>
                      )}
                    </div>
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="text-xs font-medium bg-[var(--g-bg-inset)] text-[var(--g-text-primary)]">
                        {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--g-text-primary)]">
                        {m.name}
                      </p>
                      <Badge variant="secondary" className="mt-0.5 text-[10px] bg-[var(--g-bg-inset)] text-[var(--g-text-secondary)]">
                        {roleLabel(m.teamRole, roles)}
                      </Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="w-10 text-right flex items-center justify-end gap-1">
                        <span className={cn("text-lg font-bold", gradeColor(letter))}>{letter}</span>
                        {change !== 0 && (
                          <span className={cn("flex items-center text-[10px]", change > 0 ? "text-[var(--g-up)]" : "text-[var(--g-down)]")}>
                            {change > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                            {Math.abs(Math.round(change))}%
                          </span>
                        )}
                      </div>
                      <MiniSparkline scores={weekly} />
                      <span className="w-10 text-right text-sm text-[var(--g-text-secondary)]">
                        {m.totalCalls ?? 0}
                      </span>
                      <span className="w-14 text-right text-sm font-mono text-[var(--g-text-secondary)]">
                        {totalXp.toLocaleString()}
                      </span>
                      <span className={cn("w-8 text-right text-sm", streak >= HOT_STREAK_THRESHOLD ? "text-[var(--g-streak)]" : "text-[var(--g-text-tertiary)]")}>
                        {streak}d
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-2 bg-[var(--g-accent-soft)]">
                <Phone className="size-4 text-[var(--g-accent-text)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--g-text-secondary)]">Total Calls {periodLabel}</p>
                <p className="text-2xl font-bold text-[var(--g-text-primary)]">{totalCalls}</p>
                <p className="text-xs text-[var(--g-text-tertiary)]">Period total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-2 bg-[var(--g-accent-soft)]">
                <BarChart3 className="size-4 text-[var(--g-accent-text)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--g-text-secondary)]">Team Average Grade</p>
                <p className="text-2xl font-bold text-[var(--g-text-primary)]">{teamAvg}</p>
                <p className="text-xs text-[var(--g-text-tertiary)]">Period average</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-2 bg-[var(--g-streak-bg)]">
                <Zap className="size-4 text-[var(--g-streak)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--g-text-secondary)]">Active Streaks</p>
                <p className="text-2xl font-bold text-[var(--g-text-primary)]">{activeStreaks}</p>
                <p className="text-xs text-[var(--g-text-tertiary)]">{HOT_STREAK_THRESHOLD}+ day streaks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TeamAchievements
        definitions={definitions}
        earnedBadgeIds={earnedBadgeIds}
        earnedAtMap={earnedAtMap}
      />

      <TeamHotStreaks displayList={displayList} roles={roles} />
    </PageShell>
  );
}
