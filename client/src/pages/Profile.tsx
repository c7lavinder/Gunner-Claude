import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Award, Trophy, Flame, Target, Zap, Lock, CheckCircle } from "lucide-react";


// Tier badge colors
const tierColors: Record<string, { bg: string; border: string; text: string }> = {
  bronze: { bg: "bg-amber-100", border: "border-amber-700", text: "text-amber-800" },
  silver: { bg: "bg-gray-100", border: "border-gray-400", text: "text-gray-700" },
  gold: { bg: "bg-yellow-100", border: "border-yellow-500", text: "text-yellow-800" },
};

interface BadgeTier {
  target: number;
  earned: boolean;
  earnedAt?: Date | string;
}

interface BadgeData {
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tiers: {
    bronze: BadgeTier;
    silver: BadgeTier;
    gold: BadgeTier;
  };
  currentProgress: number;
}

function BadgeCard({ badge }: { badge: BadgeData }) {
  // Find the highest earned tier and next target tier
  const tiers = ["bronze", "silver", "gold"] as const;
  let highestEarnedTier: string | null = null;
  let nextTargetTier: typeof tiers[number] | null = null;
  let nextTarget = 0;
  
  for (const tier of tiers) {
    if (badge.tiers[tier].earned) {
      highestEarnedTier = tier;
    } else if (!nextTargetTier) {
      nextTargetTier = tier;
      nextTarget = badge.tiers[tier].target;
    }
  }
  
  const isEarned = highestEarnedTier !== null;
  const tierStyle = highestEarnedTier ? tierColors[highestEarnedTier] : tierColors.bronze;
  const progressPercent = nextTarget > 0 ? Math.min((badge.currentProgress / nextTarget) * 100, 100) : 100;

  return (
    <Card className={`relative overflow-hidden transition-all ${
      isEarned 
        ? `${tierStyle.bg} ${tierStyle.border} border-2` 
        : "bg-muted/30 border-dashed opacity-70"
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`text-3xl ${!isEarned && "grayscale opacity-50"}`}>
            {badge.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`font-semibold ${isEarned ? tierStyle.text : "text-muted-foreground"}`}>
                {badge.name}
              </h4>
              {isEarned ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{badge.description}</p>
            
            {/* Show progress to next tier */}
            {nextTargetTier && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress to {nextTargetTier}</span>
                  <span>{badge.currentProgress} / {nextTarget}</span>
                </div>
                <Progress value={progressPercent} className="h-1.5" />
              </div>
            )}
            
            {/* Show earned tiers */}
            {isEarned && (
              <div className="flex gap-1 mt-2">
                {tiers.map(tier => (
                  badge.tiers[tier].earned && (
                    <span 
                      key={tier}
                      className={`text-xs px-2 py-0.5 rounded-full ${tierColors[tier].bg} ${tierColors[tier].text} border ${tierColors[tier].border}`}
                    >
                      {tier}
                    </span>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Profile() {
  const { data: gamification, isLoading: gamificationLoading } = trpc.gamification.getSummary.useQuery();
  const { data: allBadges, isLoading: badgesLoading } = trpc.gamification.getAllBadges.useQuery();

  // Separate earned and in-progress badges
  const earnedBadges = allBadges?.filter((b: BadgeData) => 
    b.tiers.bronze.earned || b.tiers.silver.earned || b.tiers.gold.earned
  ) || [];
  const inProgressBadges = allBadges?.filter((b: BadgeData) => 
    !b.tiers.bronze.earned && !b.tiers.silver.earned && !b.tiers.gold.earned
  ) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground mt-1">
          Track your progress, achievements, and badges
        </p>
      </div>

      {/* XP & Level Card */}
      <Card className="bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <Trophy className="h-5 w-5" />
            Level & Experience
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gamificationLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-bold text-orange-900">
                    Level {gamification?.xp.level ?? 1}
                  </p>
                  <p className="text-lg text-orange-700">{gamification?.xp.title ?? "Rookie"}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-orange-800">
                    {gamification?.xp.totalXp?.toLocaleString() ?? 0} XP
                  </p>
                  <p className="text-sm text-orange-600">
                    {((gamification?.xp.nextLevelXp ?? 500) - (gamification?.xp.totalXp ?? 0)).toLocaleString()} XP to next level
                  </p>
                </div>
              </div>
              <div>
                <div className="h-4 bg-orange-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500" 
                    style={{ width: `${gamification?.xp.progress ?? 0}%` }}
                  />
                </div>
                <p className="text-xs text-orange-600 mt-1 text-right">
                  {gamification?.xp.progress ?? 0}% to Level {(gamification?.xp.level ?? 1) + 1}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Streaks */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-800 text-lg">
              <Flame className="h-5 w-5" />
              Hot Streak
            </CardTitle>
            <CardDescription>Consecutive C+ or better grades</CardDescription>
          </CardHeader>
          <CardContent>
            {gamificationLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-bold text-red-900">
                    {gamification?.streaks.hotStreakCurrent ?? 0} 🔥
                  </p>
                  <p className="text-sm text-red-600">Current streak</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-700">
                    {gamification?.streaks.hotStreakBest ?? 0}
                  </p>
                  <p className="text-sm text-red-600">Best ever</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-800 text-lg">
              <Target className="h-5 w-5" />
              Consistency Streak
            </CardTitle>
            <CardDescription>Days with at least one graded call</CardDescription>
          </CardHeader>
          <CardContent>
            {gamificationLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-bold text-blue-900">
                    {gamification?.streaks.consistencyStreakCurrent ?? 0} days
                  </p>
                  <p className="text-sm text-blue-600">Current streak</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-700">
                    {gamification?.streaks.consistencyStreakBest ?? 0}
                  </p>
                  <p className="text-sm text-blue-600">Best ever</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Badges Section */}
      <div className="space-y-6">
        {/* Earned Badges */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-purple-600" />
            Earned Badges ({earnedBadges.length})
          </h2>
          {badgesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : earnedBadges.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {earnedBadges.map((badge: BadgeData) => (
                <BadgeCard key={badge.code} badge={badge} />
              ))}
            </div>
          ) : (
            <Card className="bg-muted/30">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Award className="h-12 w-12 text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No badges earned yet. Keep grinding!</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* In Progress Badges */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-600" />
            In Progress ({inProgressBadges.length})
          </h2>
          {badgesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : inProgressBadges.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {inProgressBadges.map((badge: BadgeData) => (
                <BadgeCard key={badge.code} badge={badge} />
              ))}
            </div>
          ) : earnedBadges.length === allBadges?.length ? (
            <Card className="bg-muted/30">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500/50 mb-2" />
                <p className="text-muted-foreground">All badges earned! You're a legend!</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-muted/30">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Zap className="h-12 w-12 text-orange-500/50 mb-2" />
                <p className="text-muted-foreground">Start making calls to unlock badges!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
