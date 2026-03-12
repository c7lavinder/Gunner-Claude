import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Flame,
  Star,
  Target,
  Medal,
  Crown,
  Phone,
  BarChart3,
  Zap,
  UserPlus,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { trpc } from "@/lib/trpc";

const BADGE_ICONS: Record<string, typeof Trophy> = {
  first90: Trophy,
  hotstreak: Flame,
  perfectweek: Star,
  teamplayer: Target,
  closer: Medal,
  champion: Crown,
};

function roleLabel(code: string, roles: { code: string; name: string }[]): string {
  return roles.find((r) => r.code === code)?.name ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEarned(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

export function Team() {
  const [period, setPeriod] = useState("week");
  const { roles } = useTenantConfig();
  const { data: members, isLoading: membersLoading } = trpc.team.list.useQuery();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.gamification.getLeaderboard.useQuery({ period });
  const { data: badgesData, isLoading: badgesLoading } = trpc.gamification.getBadges.useQuery();

  const isLoading = membersLoading || leaderboardLoading || badgesLoading;
  const currentMemberId = members?.find((m) => m.userId === me?.id)?.id ?? null;
  const displayList = (leaderboard ?? []).sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
  const activeStreaks = displayList.filter((m) => (m.streak?.hotStreakCurrent ?? 0) >= 3).length;
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

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6 bg-[var(--g-bg-base)]">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--g-text-primary)]">
          Team Leaderboard
        </h1>
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
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 bg-[var(--g-bg-base)]">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--g-text-primary)]">
        Team Leaderboard
      </h1>

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
                <div className="flex shrink-0 items-center gap-4">
                  <span className="w-10 text-right text-xs text-[var(--g-text-tertiary)]">Score</span>
                  <span className="w-8 text-right text-xs text-[var(--g-text-tertiary)]">Calls</span>
                  <span className="w-8 text-right text-xs text-[var(--g-text-tertiary)]">Streak</span>
                </div>
              </div>
              {displayList.map((m, i) => {
                const rank = i + 1;
                const medal = rank <= 3 ? ["#FFD700", "#C0C0C0", "#CD7F32"][rank - 1] : null;
                const isCurrent = m.id === currentMemberId;
                const avgScore = Math.round(m.averageScore ?? 0);
                const streak = m.streak?.hotStreakCurrent ?? 0;
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
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="w-10 text-right font-semibold text-[var(--g-text-primary)]">
                        {avgScore}
                      </span>
                      <span className="w-8 text-right text-sm text-[var(--g-text-secondary)]">
                        {m.totalCalls ?? 0}
                      </span>
                      <span className={cn("w-8 text-right text-sm", streak >= 3 ? "text-[var(--g-streak)]" : "text-[var(--g-text-tertiary)]")}>
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
                <p className="text-xs text-[var(--g-text-tertiary)]">3+ day streaks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
        <CardHeader>
          <CardTitle className="text-[var(--g-text-primary)]">Achievements</CardTitle>
        </CardHeader>
        <CardContent>
          {definitions.length === 0 ? (
            <p className="text-sm py-6 text-center text-[var(--g-text-tertiary)]">
              No badges configured yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {definitions.map((b) => {
                const earned = earnedBadgeIds.has(b.code);
                const earnedStr = earned ? formatEarned(earnedAtMap.get(b.code) ?? null) : null;
                const Icon = BADGE_ICONS[b.code] ?? Trophy;
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "flex items-start gap-4 rounded-lg border p-4 transition-colors",
                      earned ? "border-[var(--g-accent-medium)] bg-[var(--g-accent-soft)]" : "border-[var(--g-border-subtle)] opacity-60"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg",
                        earned ? "bg-[var(--g-accent-soft)]" : "bg-[var(--g-bg-inset)]"
                      )}
                    >
                      <Icon className={cn("size-5", earned ? "text-[var(--g-accent-text)]" : "text-[var(--g-text-tertiary)]")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-medium", earned ? "text-[var(--g-text-primary)]" : "text-[var(--g-text-secondary)]")}>
                        {b.name}
                      </p>
                      <p className="text-sm text-[var(--g-text-tertiary)]">
                        {b.description ?? b.code}
                      </p>
                      {earnedStr ? (
                        <p className="mt-1 text-xs font-medium text-[var(--g-accent-text)]">
                          Earned {earnedStr}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-[var(--g-text-tertiary)]">
                          Locked
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
        <CardHeader>
          <CardTitle className="text-[var(--g-text-primary)] flex items-center gap-2">
            <Flame className="size-5 text-[var(--g-accent-text)]" />
            Hot Streaks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const streakers = displayList
              .filter((m) => (m.streak?.hotStreakCurrent ?? 0) >= 1)
              .sort((a, b) => (b.streak?.hotStreakCurrent ?? 0) - (a.streak?.hotStreakCurrent ?? 0))
              .slice(0, 5);
            if (streakers.length === 0) {
              return (
                <EmptyState
                  icon={Flame}
                  title="No active streaks"
                  description="Streaks start when team members get consecutive C+ grades."
                />
              );
            }
            return streakers.map((m) => {
              const streak = m.streak?.hotStreakCurrent ?? 0;
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--g-bg-surface)]">
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-[var(--g-bg-inset)] text-[var(--g-text-primary)]">
                      {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-[var(--g-text-primary)]">{m.name}</p>
                    <p className="text-xs text-[var(--g-text-tertiary)]">{roleLabel(m.teamRole, roles)}</p>
                  </div>
                  <Badge variant="secondary" className={cn("text-xs", streak >= 3 ? "bg-[var(--g-streak-bg)] text-[var(--g-streak)]" : "bg-[var(--g-bg-inset)] text-[var(--g-text-secondary)]")}>
                    {streak}d streak
                  </Badge>
                </div>
              );
            });
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
