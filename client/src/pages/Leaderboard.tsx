import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, Trophy, Medal, TrendingUp, Phone, Flame, Zap, Target } from "lucide-react";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg">
        <Trophy className="h-6 w-6 text-white" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-lg">
        <Medal className="h-6 w-6 text-white" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center shadow-lg">
        <Medal className="h-6 w-6 text-white" />
      </div>
    );
  }
  return (
    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
      <span className="text-lg font-bold text-muted-foreground">{rank}</span>
    </div>
  );
}

// Tier badge colors
const tierColors: Record<string, string> = {
  bronze: "bg-amber-700 text-amber-100",
  silver: "bg-gray-400 text-gray-900",
  gold: "bg-yellow-500 text-yellow-900",
};

function BadgeDisplay({ badges }: { badges: Array<{ code: string; name: string; icon: string; tier: string }> }) {
  if (!badges || badges.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1">
      {badges.slice(0, 5).map((badge, i) => (
        <span 
          key={i} 
          className={`text-sm px-1.5 py-0.5 rounded ${tierColors[badge.tier] || "bg-gray-200"}`}
          title={`${badge.name} (${badge.tier})`}
        >
          {badge.icon}
        </span>
      ))}
      {badges.length > 5 && (
        <span className="text-xs text-muted-foreground">+{badges.length - 5}</span>
      )}
    </div>
  );
}

function GamificationLeaderboardCard({ entry, rank }: { entry: any; rank: number }) {
  const { teamMember, xp, level, title, hotStreak, badges } = entry;

  return (
    <div className={`obs-panel ${rank <= 3 ? "border-2" : ""} ${
      rank === 1 ? "border-yellow-400" : 
      rank === 2 ? "border-gray-400" : 
      rank === 3 ? "border-amber-600" : ""
    }`}>
      <div className="p-6">
        <div className="flex items-center gap-6">
          <RankBadge rank={rank} />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">{teamMember.name}</h3>
              {hotStreak > 0 && (
                <span className="text-sm bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Flame className="h-3 w-3" /> {hotStreak}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground capitalize">
              {teamMember.teamRole?.replace("_", " ")}
            </p>
            <BadgeDisplay badges={badges} />
          </div>

          <div className="text-right">
            <p className="text-3xl font-bold text-orange-600">
              Lvl {level}
            </p>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-xs text-orange-500">{xp.toLocaleString()} XP</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreLeaderboardCard({ entry, rank }: { entry: any; rank: number }) {
  const { teamMember, totalCalls, averageScore, gradeDistribution } = entry;
  const totalGrades = gradeDistribution.A + gradeDistribution.B + gradeDistribution.C + gradeDistribution.D + gradeDistribution.F;

  return (
    <div className={`obs-panel ${rank <= 3 ? "border-2" : ""} ${
      rank === 1 ? "border-yellow-400" : 
      rank === 2 ? "border-gray-400" : 
      rank === 3 ? "border-amber-600" : ""
    }`}>
      <div className="p-6">
        <div className="flex items-center gap-6">
          <RankBadge rank={rank} />
          
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold">{teamMember.name}</h3>
            <p className="text-sm text-muted-foreground capitalize">
              {teamMember.teamRole?.replace("_", " ")}
            </p>
          </div>

          <div className="text-right">
            <p className="text-3xl font-bold">
              {averageScore ? `${Math.round(averageScore)}%` : "N/A"}
            </p>
            <p className="text-sm text-muted-foreground">Average Score</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{totalCalls}</p>
            <p className="text-xs text-muted-foreground">Total Calls</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-emerald-500">{gradeDistribution.A}</p>
            <p className="text-xs text-muted-foreground">A Grades</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-teal-500">{gradeDistribution.B}</p>
            <p className="text-xs text-muted-foreground">B Grades</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-500">{gradeDistribution.C + gradeDistribution.D + gradeDistribution.F}</p>
            <p className="text-xs text-muted-foreground">C or Below</p>
          </div>
        </div>

        {totalGrades > 0 && (
          <div className="mt-4">
            <div className="flex h-3 rounded-full overflow-hidden">
              {gradeDistribution.A > 0 && (
                <div 
                  className="bg-emerald-500" 
                  style={{ width: `${(gradeDistribution.A / totalGrades) * 100}%` }}
                />
              )}
              {gradeDistribution.B > 0 && (
                <div 
                  className="bg-teal-500" 
                  style={{ width: `${(gradeDistribution.B / totalGrades) * 100}%` }}
                />
              )}
              {gradeDistribution.C > 0 && (
                <div 
                  className="bg-yellow-500" 
                  style={{ width: `${(gradeDistribution.C / totalGrades) * 100}%` }}
                />
              )}
              {gradeDistribution.D > 0 && (
                <div 
                  className="bg-orange-500" 
                  style={{ width: `${(gradeDistribution.D / totalGrades) * 100}%` }}
                />
              )}
              {gradeDistribution.F > 0 && (
                <div 
                  className="bg-red-500" 
                  style={{ width: `${(gradeDistribution.F / totalGrades) * 100}%` }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Grade Distribution</span>
              <span>{totalGrades} graded calls</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [leaderTab, setLeaderTab] = useState("xp");
  const { data: scoreLeaderboard, isLoading: scoreLoading } = trpc.leaderboard.get.useQuery();
  const { data: gamificationLeaderboard, isLoading: gamificationLoading } = trpc.gamification.getLeaderboard.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tighter">Team Leaderboard</h1>
        <p className="text-muted-foreground mt-1">
          Track team performance, rankings, and achievements
        </p>
      </div>

      <div className="w-full">
        <div className="obs-role-tabs">
          <button className={`obs-role-tab ${leaderTab === "xp" ? "active" : ""}`} onClick={() => setLeaderTab("xp")}>
            <Zap className="h-4 w-4" /> XP & Level
          </button>
          <button className={`obs-role-tab ${leaderTab === "score" ? "active" : ""}`} onClick={() => setLeaderTab("score")}>
            <TrendingUp className="h-4 w-4" /> Avg Score
          </button>
        </div>

        {leaderTab === "xp" && (<div className="mt-6">
          {gamificationLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div className="obs-panel" key={i}>
                  <div className="p-6">
                    <Skeleton className="h-24 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : gamificationLeaderboard && gamificationLeaderboard.length > 0 ? (
            <div className="space-y-4">
              {gamificationLeaderboard.map((entry: any, index: number) => (
                <GamificationLeaderboardCard key={entry.teamMember.id} entry={entry} rank={index + 1} />
              ))}
            </div>
          ) : (
            <div className="obs-panel">
              <div className="flex flex-col items-center justify-center py-16">
                <Zap className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No XP earned yet</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  XP rankings will appear here once team members view their graded calls.
                </p>
              </div>
            </div>
          )}
        </div>)}

        {leaderTab === "score" && (<div className="mt-6">
          {scoreLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div className="obs-panel" key={i}>
                  <div className="p-6">
                    <Skeleton className="h-32 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : scoreLeaderboard && scoreLeaderboard.length > 0 ? (
            <div className="space-y-4">
              {scoreLeaderboard.map((entry, index) => (
                <ScoreLeaderboardCard key={entry.teamMember.id} entry={entry} rank={index + 1} />
              ))}
            </div>
          ) : (
            <div className="obs-panel">
              <div className="flex flex-col items-center justify-center py-16">
                <Award className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No rankings yet</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Rankings will appear here once team members have graded calls.
                </p>
              </div>
            </div>
          )}
        </div>)}
      </div>
    </div>
  );
}
