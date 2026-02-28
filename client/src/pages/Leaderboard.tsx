import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, Trophy, Medal, TrendingUp, Phone, Flame, Zap, Target, Crown, ChevronUp, ChevronDown, Minus, ArrowUp, ArrowDown } from "lucide-react";
import SparklineChart from "@/components/SparklineChart";
import { BADGE_ICON_URLS } from "../../../shared/badgeIcons";

/* ─── Rank podium for top 3 ─────────────────────────── */
function PodiumCard({ entry, rank, mode }: { entry: any; rank: number; mode: "xp" | "score" }) {
  const isXP = mode === "xp";
  const { teamMember } = entry;
  const initials = (teamMember?.name || "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const rankConfig = {
    1: {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      glow: "rgba(234,179,8,0.3)",
      border: "var(--g-rank-1)",
      icon: <Crown className="h-5 w-5" />,
      label: "1st",
      size: "h-[280px]",
      avatarSize: "w-20 h-20",
      textSize: "text-2xl",
    },
    2: {
      gradient: "from-slate-300 via-gray-400 to-slate-500",
      glow: "rgba(148,163,184,0.25)",
      border: "var(--g-rank-2)",
      icon: <Medal className="h-4 w-4" />,
      label: "2nd",
      size: "h-[240px]",
      avatarSize: "w-16 h-16",
      textSize: "text-xl",
    },
    3: {
      gradient: "from-amber-600 via-orange-700 to-amber-800",
      glow: "rgba(217,119,6,0.25)",
      border: "var(--g-rank-3)",
      icon: <Medal className="h-4 w-4" />,
      label: "3rd",
      size: "h-[200px]",
      avatarSize: "w-14 h-14",
      textSize: "text-lg",
    },
  }[rank] || { gradient: "", glow: "transparent", border: "var(--g-border-medium)", icon: null, label: `${rank}th`, size: "h-[180px]", avatarSize: "w-12 h-12", textSize: "text-base" };

  return (
    <div
      className="relative flex flex-col items-center justify-end rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02]"
      style={{
        background: "var(--g-bg-card)",
        border: `2px solid ${rankConfig.border}`,
        boxShadow: `0 0 30px ${rankConfig.glow}, var(--g-shadow-lg)`,
        minHeight: rank === 1 ? 280 : rank === 2 ? 240 : 200,
      }}
    >
      {/* Gradient accent top */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${rankConfig.gradient}`}
      />

      <div className="flex flex-col items-center gap-3 p-6 pt-8 w-full">
        {/* Rank icon */}
        <div
          className={`w-8 h-8 rounded-full bg-gradient-to-br ${rankConfig.gradient} flex items-center justify-center text-white shadow-lg`}
        >
          {rankConfig.icon || <span className="text-xs font-bold">{rank}</span>}
        </div>

        {/* Avatar */}
        <div
          className={`${rankConfig.avatarSize} rounded-2xl flex items-center justify-center text-white font-bold overflow-hidden`}
          style={{
            background: "linear-gradient(135deg, #374151, #1f2937)",
            border: `2px solid ${rankConfig.border}`,
          }}
        >
          {teamMember?.profilePicture ? (
            <img src={teamMember.profilePicture} alt={teamMember.name} className="w-full h-full object-cover" />
          ) : (
            <span className={rank === 1 ? "text-xl" : "text-base"}>{initials}</span>
          )}
        </div>

        {/* Name */}
        <div className="text-center">
          <h3 className={`${rankConfig.textSize} font-bold tracking-tight`} style={{ color: "var(--g-text-primary)" }}>
            {teamMember?.name || "Unknown"}
          </h3>
          <p className="text-xs mt-0.5 capitalize" style={{ color: "var(--g-text-tertiary)" }}>
            {teamMember?.teamRole?.replace("_", " ") || "Team Member"}
          </p>
        </div>

        {/* Stat */}
        <div className="text-center">
          {isXP ? (
            <>
              <p className="text-3xl font-extrabold font-mono" style={{ color: "var(--g-accent-text)" }}>
                {entry.level}
              </p>
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--g-text-tertiary)" }}>
                Level
              </p>
              <p className="text-xs mt-1 font-mono" style={{ color: "var(--g-accent-text)", opacity: 0.7 }}>
                {entry.xp?.toLocaleString()} XP
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-extrabold font-mono" style={{ color: "var(--g-accent-text)" }}>
                {entry.averageScore ? `${Math.round(entry.averageScore)}%` : "N/A"}
              </p>
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--g-text-tertiary)" }}>
                Avg Score
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--g-text-secondary)" }}>
                {entry.totalCalls} calls
              </p>
            </>
          )}
        </div>

        {/* Badges / Streak */}
        {isXP && entry.hotStreak > 0 && (
          <div className="obs-streak-badge">
            <Flame className="h-3 w-3" /> {entry.hotStreak} day streak
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Rank Change Indicator ─────────────────────────── */
function RankChange({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === current) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-bold" style={{ color: "var(--g-text-tertiary)" }}>
        <Minus className="h-2.5 w-2.5" />
      </span>
    );
  }
  const diff = previous - current; // positive = moved up
  if (diff > 0) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: "var(--g-up)", background: "var(--g-up-bg)" }}>
        <ArrowUp className="h-2.5 w-2.5" /> {diff}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: "var(--g-down)", background: "var(--g-down-bg)" }}>
      <ArrowDown className="h-2.5 w-2.5" /> {Math.abs(diff)}
    </span>
  );
}

/* ─── List row for rank 4+ ──────────────────────────── */
function LeaderRow({ entry, rank, mode }: { entry: any; rank: number; mode: "xp" | "score" }) {
  const isXP = mode === "xp";
  const { teamMember } = entry;
  const initials = (teamMember?.name || "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Generate sparkline data from weekly scores if available
  const sparkData = useMemo(() => {
    if (!entry.weeklyScores || entry.weeklyScores.length < 2) return null;
    return entry.weeklyScores.map((w: any) => w.averageScore || 0);
  }, [entry.weeklyScores]);

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 rounded-xl transition-all duration-300 hover:translate-y-[-1px] group"
      style={{
        background: "var(--g-bg-card)",
        border: "1px solid var(--g-border-subtle)",
        boxShadow: "var(--g-shadow-card)",
      }}
    >
      {/* Rank + change indicator */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center font-mono text-sm font-bold"
          style={{ background: "var(--g-bg-inset)", color: "var(--g-text-tertiary)" }}
        >
          {rank}
        </div>
        <RankChange current={rank} previous={entry.previousRank} />
      </div>

      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #374151, #1f2937)", border: "1px solid var(--g-border-medium)" }}
      >
        {teamMember?.profilePicture ? (
          <img src={teamMember.profilePicture} alt={teamMember.name} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm truncate" style={{ color: "var(--g-text-primary)" }}>
          {teamMember?.name || "Unknown"}
        </h4>
        <p className="text-xs capitalize" style={{ color: "var(--g-text-tertiary)" }}>
          {teamMember?.teamRole?.replace("_", " ")}
        </p>
      </div>

      {/* Sparkline trend */}
      {!isXP && sparkData && (
        <div className="hidden sm:block shrink-0">
          <SparklineChart data={sparkData} width={80} height={28} color="var(--g-accent)" showDots />
        </div>
      )}

      {/* Badges */}
      {isXP && entry.badges && entry.badges.length > 0 && (
        <div className="hidden sm:flex gap-1">
          {entry.badges.slice(0, 4).map((badge: any, i: number) => (
            <span key={i} className="text-sm" title={badge.name}>
              {BADGE_ICON_URLS[badge.code] ? (
                <img src={BADGE_ICON_URLS[badge.code]} alt={badge.name} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                badge.icon
              )}
            </span>
          ))}
        </div>
      )}

      {/* Streak */}
      {isXP && entry.hotStreak > 0 && (
        <div className="obs-streak-badge text-xs">
          <Flame className="h-3 w-3" /> {entry.hotStreak}
        </div>
      )}

      {/* Score / Level */}
      <div className="text-right shrink-0">
        {isXP ? (
          <>
            <p className="text-lg font-extrabold font-mono" style={{ color: "var(--g-accent-text)" }}>
              {entry.level}
            </p>
            <p className="text-[10px] font-mono" style={{ color: "var(--g-text-tertiary)" }}>
              {entry.xp?.toLocaleString()} XP
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-extrabold font-mono" style={{ color: "var(--g-accent-text)" }}>
              {entry.averageScore ? `${Math.round(entry.averageScore)}%` : "—"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>
              {entry.totalCalls} calls
            </p>
          </>
        )}
      </div>

      {/* Grade distribution for score mode */}
      {!isXP && entry.gradeDistribution && (
        <div className="hidden md:flex w-32">
          <GradeBar distribution={entry.gradeDistribution} />
        </div>
      )}
    </div>
  );
}

/* ─── Mini grade distribution bar ───────────────────── */
function GradeBar({ distribution }: { distribution: { A: number; B: number; C: number; D: number; F: number } }) {
  const total = distribution.A + distribution.B + distribution.C + distribution.D + distribution.F;
  if (total === 0) return null;

  return (
    <div className="w-full">
      <div className="flex h-2 rounded-full overflow-hidden gap-[1px]">
        {distribution.A > 0 && (
          <div style={{ width: `${(distribution.A / total) * 100}%`, background: "var(--g-grade-a)" }} />
        )}
        {distribution.B > 0 && (
          <div style={{ width: `${(distribution.B / total) * 100}%`, background: "var(--g-grade-b)" }} />
        )}
        {distribution.C > 0 && (
          <div style={{ width: `${(distribution.C / total) * 100}%`, background: "var(--g-grade-c)" }} />
        )}
        {distribution.D > 0 && (
          <div style={{ width: `${(distribution.D / total) * 100}%`, background: "var(--g-grade-d)" }} />
        )}
        {distribution.F > 0 && (
          <div style={{ width: `${(distribution.F / total) * 100}%`, background: "var(--g-grade-f)" }} />
        )}
      </div>
    </div>
  );
}

/* ─── Skeleton loaders ──────────────────────────────── */
function PodiumSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[240, 280, 200].map((h, i) => (
        <div
          key={i}
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)", minHeight: h }}
        >
          <div className="flex flex-col items-center gap-3 p-6 pt-10">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-16 h-16 rounded-2xl" />
            <Skeleton className="w-24 h-5" />
            <Skeleton className="w-16 h-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-5 py-4 rounded-xl"
          style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
        >
          <Skeleton className="w-9 h-9 rounded-lg" />
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

/* ─── Main Leaderboard ──────────────────────────────── */
export default function Leaderboard() {
  const [leaderTab, setLeaderTab] = useState<"xp" | "score">("xp");
  const { data: scoreLeaderboard, isLoading: scoreLoading } = trpc.leaderboard.get.useQuery();
  const { data: gamificationLeaderboard, isLoading: gamificationLoading } = trpc.gamification.getLeaderboard.useQuery();

  const activeData = leaderTab === "xp" ? gamificationLeaderboard : scoreLeaderboard;
  const isLoading = leaderTab === "xp" ? gamificationLoading : scoreLoading;

  // Split into podium (top 3) and rest
  const podium = useMemo(() => (activeData || []).slice(0, 3), [activeData]);
  const rest = useMemo(() => (activeData || []).slice(3), [activeData]);

  // Reorder podium for visual display: [2nd, 1st, 3rd]
  const podiumDisplay = useMemo(() => {
    if (podium.length < 3) return podium.map((e: any, i: number) => ({ entry: e, rank: i + 1 }));
    return [
      { entry: podium[1], rank: 2 },
      { entry: podium[0], rank: 1 },
      { entry: podium[2], rank: 3 },
    ];
  }, [podium]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tighter" style={{ color: "var(--g-text-primary)" }}>
            Leaderboard
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--g-text-secondary)" }}>
            Track team performance, rankings, and achievements
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="obs-role-tabs" style={{ maxWidth: 320 }}>
        <button
          className={`obs-role-tab ${leaderTab === "xp" ? "active" : ""}`}
          onClick={() => setLeaderTab("xp")}
        >
          <Zap className="h-4 w-4" /> XP & Level
        </button>
        <button
          className={`obs-role-tab ${leaderTab === "score" ? "active" : ""}`}
          onClick={() => setLeaderTab("score")}
        >
          <Target className="h-4 w-4" /> Avg Score
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-8">
          <PodiumSkeleton />
          <RowSkeleton />
        </div>
      ) : activeData && activeData.length > 0 ? (
        <div className="space-y-8 obs-fade-in">
          {/* Podium — top 3 */}
          {podium.length >= 3 ? (
            <div className="grid grid-cols-3 gap-4 items-end">
              {podiumDisplay.map(({ entry, rank }) => (
                <PodiumCard key={rank} entry={entry} rank={rank} mode={leaderTab} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {podium.map((entry: any, i: number) => (
                <LeaderRow key={i} entry={entry} rank={i + 1} mode={leaderTab} />
              ))}
            </div>
          )}

          {/* Remaining rows */}
          {rest.length > 0 && (
            <div className="space-y-3">
              {rest.map((entry: any, i: number) => (
                <LeaderRow key={i} entry={entry} rank={i + 4} mode={leaderTab} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-2xl"
          style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}
        >
          {leaderTab === "xp" ? (
            <>
              <Zap className="h-16 w-16 mb-4" style={{ color: "var(--g-text-tertiary)", opacity: 0.4 }} />
              <h3 className="text-lg font-semibold" style={{ color: "var(--g-text-primary)" }}>No XP earned yet</h3>
              <p className="text-sm mt-1 max-w-md text-center" style={{ color: "var(--g-text-secondary)" }}>
                XP rankings will appear here once team members view their graded calls.
              </p>
            </>
          ) : (
            <>
              <Award className="h-16 w-16 mb-4" style={{ color: "var(--g-text-tertiary)", opacity: 0.4 }} />
              <h3 className="text-lg font-semibold" style={{ color: "var(--g-text-primary)" }}>No rankings yet</h3>
              <p className="text-sm mt-1 max-w-md text-center" style={{ color: "var(--g-text-secondary)" }}>
                Rankings will appear here once team members have graded calls.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
