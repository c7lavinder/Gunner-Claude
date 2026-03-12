import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Trophy, Flame, Star, Target, Medal, Crown } from "lucide-react";

const BADGE_ICONS: Record<string, typeof Trophy> = {
  first90: Trophy,
  hotstreak: Flame,
  perfectweek: Star,
  teamplayer: Target,
  closer: Medal,
  champion: Crown,
};

function formatEarned(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

export interface BadgeDefinition {
  id: number;
  code: string;
  name: string;
  description: string | null;
}

export interface TeamAchievementsProps {
  definitions: BadgeDefinition[];
  earnedBadgeIds: Set<string>;
  earnedAtMap: Map<string, Date | string | null>;
}

export function TeamAchievements({ definitions, earnedBadgeIds, earnedAtMap }: TeamAchievementsProps) {
  return (
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
  );
}
