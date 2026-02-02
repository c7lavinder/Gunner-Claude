import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Award, Trophy, Medal, TrendingUp, Phone } from "lucide-react";

function GradeBadge({ grade }: { grade: string }) {
  const gradeClass = `grade-${grade.toLowerCase()}`;
  return <span className={`grade-badge ${gradeClass}`}>{grade}</span>;
}

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

function LeaderboardCard({ entry, rank }: { entry: any; rank: number }) {
  const { teamMember, totalCalls, averageScore, gradeDistribution } = entry;
  const totalGrades = gradeDistribution.A + gradeDistribution.B + gradeDistribution.C + gradeDistribution.D + gradeDistribution.F;

  return (
    <Card className={`${rank <= 3 ? "border-2" : ""} ${
      rank === 1 ? "border-yellow-400" : 
      rank === 2 ? "border-gray-400" : 
      rank === 3 ? "border-amber-600" : ""
    }`}>
      <CardContent className="p-6">
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
      </CardContent>
    </Card>
  );
}

export default function Leaderboard() {
  const { data: leaderboard, isLoading } = trpc.leaderboard.get.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Leaderboard</h1>
        <p className="text-muted-foreground mt-1">
          Track team performance and rankings
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : leaderboard && leaderboard.length > 0 ? (
        <div className="space-y-4">
          {leaderboard.map((entry, index) => (
            <LeaderboardCard key={entry.teamMember.id} entry={entry} rank={index + 1} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Award className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rankings yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Rankings will appear here once team members have graded calls.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
