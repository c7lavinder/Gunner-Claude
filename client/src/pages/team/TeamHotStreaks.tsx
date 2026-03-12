import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { HOT_STREAK_THRESHOLD } from "@shared/types";

function roleLabel(code: string, roles: { code: string; name: string }[]): string {
  return roles.find((r) => r.code === code)?.name ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  teamRole: string;
  streak: { hotStreakCurrent: number } | null;
}

export interface TeamHotStreaksProps {
  displayList: LeaderboardEntry[];
  roles: { code: string; name: string }[];
}

export function TeamHotStreaks({ displayList, roles }: TeamHotStreaksProps) {
  const streakers = displayList
    .filter((m) => (m.streak?.hotStreakCurrent ?? 0) >= 1)
    .sort((a, b) => (b.streak?.hotStreakCurrent ?? 0) - (a.streak?.hotStreakCurrent ?? 0))
    .slice(0, 5);

  return (
    <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
      <CardHeader>
        <CardTitle className="text-[var(--g-text-primary)] flex items-center gap-2">
          <Flame className="size-5 text-[var(--g-accent-text)]" />
          Hot Streaks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {streakers.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="No active streaks"
            description="Streaks start when team members get consecutive C+ grades."
          />
        ) : (
          streakers.map((m) => {
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
                <Badge variant="secondary" className={cn("text-xs", streak >= HOT_STREAK_THRESHOLD ? "bg-[var(--g-streak-bg)] text-[var(--g-streak)]" : "bg-[var(--g-bg-inset)] text-[var(--g-text-secondary)]")}>
                  {streak}d streak
                </Badge>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
