import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Flame,
  Star,
  Target,
  Medal,
  Crown,
  TrendingUp,
  TrendingDown,
  Minus,
  Phone,
  BarChart3,
  Zap,
} from "lucide-react";
import { useTenantConfig } from "@/hooks/useTenantConfig";

const MOCK_TEAM = [
  { id: 1, name: "Alex Rivera", initials: "AR", role: "lead_manager", avgGrade: 91, calls: 47, streak: 12, trend: "up" as const },
  { id: 2, name: "Jordan Lee", initials: "JL", role: "acquisition_manager", avgGrade: 87, calls: 39, streak: 8, trend: "up" as const },
  { id: 3, name: "Casey Morgan", initials: "CM", role: "lead_manager", avgGrade: 84, calls: 42, streak: 5, trend: "flat" as const },
  { id: 4, name: "Taylor Swift", initials: "TS", role: "dispo_manager", avgGrade: 79, calls: 31, streak: 3, trend: "down" as const },
  { id: 5, name: "Morgan Chen", initials: "MC", role: "lead_manager", avgGrade: 74, calls: 28, streak: 0, trend: "up" as const },
  { id: 6, name: "Sam Williams", initials: "SW", role: "acquisition_manager", avgGrade: 68, calls: 22, streak: 1, trend: "down" as const },
];

const ACHIEVEMENTS = [
  { id: "first90", icon: Trophy, title: "First 90+", desc: "First call graded 90+", earned: "Mar 2" },
  { id: "hotstreak", icon: Flame, title: "Hot Streak", desc: "5-day streak", earned: "Mar 5" },
  { id: "perfectweek", icon: Star, title: "Perfect Week", desc: "Graded every day", earned: "Mar 8" },
  { id: "teamplayer", icon: Target, title: "Team Player", desc: "Most notes created", earned: null },
  { id: "closer", icon: Medal, title: "Closer", desc: "Most stage advances", earned: null },
  { id: "champion", icon: Crown, title: "Champion", desc: "Top of leaderboard", earned: null },
];

const CURRENT_USER_ID = 2;

function roleLabel(code: string, roles: { code: string; name: string }[]): string {
  return roles.find((r) => r.code === code)?.name ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Team() {
  const [period, setPeriod] = useState("week");
  const { roles } = useTenantConfig();
  const activeStreaks = MOCK_TEAM.filter((m) => m.streak >= 3).length;
  const teamAvg = Math.round(MOCK_TEAM.reduce((s, m) => s + m.avgGrade, 0) / MOCK_TEAM.length);
  const totalCalls = MOCK_TEAM.reduce((s, m) => s + m.calls, 0);

  return (
    <div className="space-y-6 p-4 md:p-6" style={{ background: "var(--g-bg-base)" }}>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--g-text-primary)" }}>
        Team Leaderboard
      </h1>

      <Card className="border-[var(--g-border-subtle)]" style={{ background: "var(--g-bg-card)" }}>
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
          <div className="space-y-1">
            {MOCK_TEAM.map((m, i) => {
              const rank = i + 1;
              const medal = rank <= 3 ? ["#FFD700", "#C0C0C0", "#CD7F32"][rank - 1] : null;
              const isCurrent = m.id === CURRENT_USER_ID;
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
                      <span className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>
                        #{rank}
                      </span>
                    )}
                  </div>
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="text-xs font-medium" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-primary)" }}>
                      {m.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" style={{ color: "var(--g-text-primary)" }}>
                      {m.name}
                    </p>
                    <Badge variant="secondary" className="mt-0.5 text-[10px]" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}>
                      {roleLabel(m.role, roles)}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="w-10 text-right font-semibold" style={{ color: "var(--g-text-primary)" }}>
                      {m.avgGrade}
                    </span>
                    <span className="w-8 text-right text-sm" style={{ color: "var(--g-text-secondary)" }}>
                      {m.calls}
                    </span>
                    <span className="w-8 text-right text-sm" style={{ color: m.streak >= 3 ? "var(--g-streak)" : "var(--g-text-tertiary)" }}>
                      {m.streak}d
                    </span>
                    {m.trend === "up" && <TrendingUp className="size-4" style={{ color: "var(--g-up)" }} />}
                    {m.trend === "down" && <TrendingDown className="size-4" style={{ color: "var(--g-down)" }} />}
                    {m.trend === "flat" && <Minus className="size-4" style={{ color: "var(--g-text-tertiary)" }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[var(--g-border-subtle)]" style={{ background: "var(--g-bg-card)" }}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-2" style={{ background: "var(--g-accent-soft)" }}>
                <Phone className="size-4" style={{ color: "var(--g-accent-text)" }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Total Calls This Week</p>
                <p className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>{totalCalls}</p>
                <p className="text-xs" style={{ color: "var(--g-up)" }}>+12% vs last week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--g-border-subtle)]" style={{ background: "var(--g-bg-card)" }}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-2" style={{ background: "var(--g-accent-soft)" }}>
                <BarChart3 className="size-4" style={{ color: "var(--g-accent-text)" }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Team Average Grade</p>
                <p className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>{teamAvg}</p>
                <p className="text-xs" style={{ color: "var(--g-up)" }}>+3 pts vs last week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--g-border-subtle)]" style={{ background: "var(--g-bg-card)" }}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-2" style={{ background: "var(--g-streak-bg)" }}>
                <Zap className="size-4" style={{ color: "var(--g-streak)" }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Active Streaks</p>
                <p className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>{activeStreaks}</p>
                <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>3+ day streaks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--g-border-subtle)]" style={{ background: "var(--g-bg-card)" }}>
        <CardHeader>
          <CardTitle style={{ color: "var(--g-text-primary)" }}>Achievements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ACHIEVEMENTS.map((a) => {
              const Icon = a.icon;
              const earned = !!a.earned;
              return (
                <div
                  key={a.id}
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
                    <p className="font-medium" style={{ color: earned ? "var(--g-text-primary)" : "var(--g-text-secondary)" }}>
                      {a.title}
                    </p>
                    <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>
                      {a.desc}
                    </p>
                    {a.earned ? (
                      <p className="mt-1 text-xs font-medium" style={{ color: "var(--g-accent-text)" }}>
                        Earned {a.earned}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                        Locked
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
