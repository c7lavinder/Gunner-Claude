import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Users, UserPlus, Trophy, Flame, Zap, Target, 
  Camera, Upload, Award, Lock, CheckCircle, User,
  Swords
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useDemo } from "@/hooks/useDemo";

// ─── ROLE CONFIG ────────────────────────────────────────
const roleLabels: Record<string, string> = {
  admin: "Admin",
  lead_manager: "Lead Manager",
  acquisition_manager: "Acquisition Manager",
  lead_generator: "Lead Generator",
};

// Map team roles to lookbook CSS class suffixes
const roleClassMap: Record<string, string> = {
  admin: "acq",
  acquisition_manager: "acq",
  lead_manager: "lead",
  lead_generator: "gen",
};

function getRoleClass(teamRole: string): string {
  return roleClassMap[teamRole] || "gen";
}

// ─── LEVEL TIER LABELS ─────────────────────────────────
function getLevelTitle(level: number): string {
  if (level >= 5) return "LEGENDARY";
  if (level >= 4) return "EPIC";
  if (level >= 3) return "RARE";
  if (level >= 2) return "UNCOMMON";
  return "COMMON";
}

// ─── PROFILE PICTURE UPLOAD ─────────────────────────────
function ProfilePictureUpload({ currentPicture, onUpload }: { currentPicture?: string | null; onUpload: (base64: string, mimeType: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be less than 5MB'); return; }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPreview(base64);
      const base64Data = base64.split(',')[1];
      onUpload(base64Data, file.type);
    };
    reader.readAsDataURL(file);
  };
  
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Avatar className="h-32 w-32">
          <AvatarImage src={preview || currentPicture || undefined} />
          <AvatarFallback className="text-4xl"><Camera className="h-12 w-12" style={{color: 'var(--obs-text-tertiary)'}} /></AvatarFallback>
        </Avatar>
        <Button size="icon" variant="secondary" className="absolute bottom-0 right-0 rounded-full" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" />
        </Button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <p className="text-sm" style={{color: 'var(--obs-text-tertiary)'}}>Click to upload a profile picture</p>
    </div>
  );
}

// ─── LOOKBOOK ROSTER CARD ─────────────────────────────
function CharacterCard({ 
  member, gamificationData, scoreData, rank, isCurrentUser, onUploadPicture, isSelected, onSelect
}: { 
  member: any; gamificationData?: any; scoreData?: any; rank: number; isCurrentUser: boolean;
  onUploadPicture?: (base64: string, mimeType: string) => void;
  isSelected: boolean; onSelect: () => void;
}) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  
  const xp = gamificationData?.xp || 0;
  const level = gamificationData?.level || 1;
  const title = gamificationData?.title || "Rookie";
  const hotStreak = gamificationData?.hotStreak || 0;
  const badges = gamificationData?.badges || [];
  
  const avgScore = scoreData?.averageScore;
  const totalCalls = scoreData?.totalCalls || 0;
  const gradeDistribution = scoreData?.gradeDistribution || { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const abCount = gradeDistribution.A + gradeDistribution.B;
  
  const roleClass = getRoleClass(member.teamRole);
  const levelTitle = getLevelTitle(level);
  
  // Max values for stat bars
  const maxCalls = 200;
  const maxScore = 100;
  const maxAB = Math.max(totalCalls, 50);
  const maxBadges = 20;
  
  const callsPct = maxCalls > 0 ? Math.min((totalCalls / maxCalls) * 100, 100) : 0;
  const scorePct = avgScore ? Math.min(avgScore, 100) : 0;
  const abPct = maxAB > 0 ? Math.min((abCount / maxAB) * 100, 100) : 0;
  const badgesPct = maxBadges > 0 ? Math.min((badges.length / maxBadges) * 100, 100) : 0;
  const xpProgress = Math.min((xp % 500) / 5, 100);
  
  // Grade distribution percentages
  const totalGraded = gradeDistribution.A + gradeDistribution.B + gradeDistribution.C + gradeDistribution.D + gradeDistribution.F;
  const gradeA = totalGraded > 0 ? (gradeDistribution.A / totalGraded) * 100 : 0;
  const gradeB = totalGraded > 0 ? (gradeDistribution.B / totalGraded) * 100 : 0;
  const gradeC = totalGraded > 0 ? (gradeDistribution.C / totalGraded) * 100 : 0;
  const gradeD = totalGraded > 0 ? (gradeDistribution.D / totalGraded) * 100 : 0;
  const gradeF = totalGraded > 0 ? (gradeDistribution.F / totalGraded) * 100 : 0;

  const rankBadgeType = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;
  const rankEmoji = rank === 1 ? "👑" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

  const initials = member.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div 
      className={`obs-roster-card ${isSelected ? 'ring-2 ring-[var(--obs-accent)]' : ''}`}
      data-rank={rank <= 3 ? rank : undefined}
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      {/* Role-colored top gradient strip */}
      <div className={`obs-roster-card-header ${roleClass}`}>
        <div className="obs-roster-card-header-inner">
          <div className="obs-roster-top-row">
            {/* Avatar with rank */}
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <div className={`obs-roster-avatar-wrap ${isCurrentUser ? 'cursor-pointer' : 'cursor-default'}`} onClick={e => { if (!isCurrentUser) e.preventDefault(); }}>
                  {/* Rank crown/medal badge */}
                  {rankBadgeType && (
                    <div className={`obs-rank-badge ${rankBadgeType}`}>
                      {rankEmoji}
                    </div>
                  )}
                  {/* Avatar */}
                  <div className="obs-roster-avatar">
                    {member.user?.profilePicture ? (
                      <img src={member.user.profilePicture} alt={member.name} />
                    ) : (
                      initials
                    )}
                  </div>
                  {/* Rank number */}
                  <div className="obs-rank-number">#{rank}</div>
                </div>
              </DialogTrigger>
              {isCurrentUser && onUploadPicture && (
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Profile Picture</DialogTitle>
                    <DialogDescription>Upload a new profile picture. Images should be less than 5MB.</DialogDescription>
                  </DialogHeader>
                  <ProfilePictureUpload 
                    currentPicture={member.user?.profilePicture}
                    onUpload={(base64, mimeType) => { onUploadPicture(base64, mimeType); setUploadDialogOpen(false); }}
                  />
                </DialogContent>
              )}
            </Dialog>
            
            {/* Name, role, badges */}
            <div className="obs-roster-info">
              <div className="obs-roster-name">{member.name}</div>
              <div className={`obs-roster-role-badge ${roleClass}`}>
                {roleLabels[member.teamRole] || member.teamRole}
              </div>
              {badges.length > 0 && (
                <div className="obs-badges-row">
                  {badges.slice(0, 5).map((badge: any, i: number) => (
                    <span key={i} className="obs-badge-icon" title={`${badge.name} (${badge.tier})`}>
                      {badge.icon}
                    </span>
                  ))}
                  {badges.length > 5 && (
                    <span style={{fontSize: '10px', color: 'var(--obs-text-tertiary)'}}>+{badges.length - 5}</span>
                  )}
                </div>
              )}
            </div>
            
            {/* Level display */}
            <div className="obs-level-display">
              <div className="obs-level-number">{level}</div>
              <div className="obs-level-label">LVL</div>
              <div className="obs-level-title">{levelTitle}</div>
              {hotStreak > 0 && (
                <div className="obs-streak-badge">🔥 {hotStreak}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* XP bar */}
      <div className="obs-xp-section">
        <div className="obs-xp-label">{xp.toLocaleString()} XP</div>
        <div className="obs-xp-bar">
          <div className="obs-xp-fill" style={{width: `${xpProgress}%`}} />
        </div>
      </div>
      
      {/* Stat bars */}
      <div className="obs-roster-stats">
        <div className="obs-stat-bar-row">
          <span className="obs-stat-bar-label">Calls</span>
          <div className="obs-stat-bar-track"><div className="obs-stat-bar-fill calls" style={{width: `${callsPct}%`}} /></div>
          <span className="obs-stat-bar-value">{totalCalls}</span>
        </div>
        <div className="obs-stat-bar-row">
          <span className="obs-stat-bar-label">Score</span>
          <div className="obs-stat-bar-track"><div className="obs-stat-bar-fill score" style={{width: `${scorePct}%`}} /></div>
          <span className="obs-stat-bar-value">{avgScore ? `${Math.round(avgScore)}%` : 'N/A'}</span>
        </div>
        <div className="obs-stat-bar-row">
          <span className="obs-stat-bar-label">A & B</span>
          <div className="obs-stat-bar-track"><div className="obs-stat-bar-fill ab" style={{width: `${abPct}%`}} /></div>
          <span className="obs-stat-bar-value">{abCount}</span>
        </div>
        <div className="obs-stat-bar-row">
          <span className="obs-stat-bar-label">Badge</span>
          <div className="obs-stat-bar-track"><div className="obs-stat-bar-fill badges" style={{width: `${badgesPct}%`}} /></div>
          <span className="obs-stat-bar-value">{badges.length}</span>
        </div>
      </div>
      
      {/* Grade distribution */}
      {totalGraded > 0 && (
        <div className="obs-grade-dist">
          <div className="obs-grade-bar">
            {gradeA > 0 && <div className="obs-grade-seg a" style={{width: `${gradeA}%`}} />}
            {gradeB > 0 && <div className="obs-grade-seg b" style={{width: `${gradeB}%`}} />}
            {gradeC > 0 && <div className="obs-grade-seg c" style={{width: `${gradeC}%`}} />}
            {gradeD > 0 && <div className="obs-grade-seg d" style={{width: `${gradeD}%`}} />}
            {gradeF > 0 && <div className="obs-grade-seg f" style={{width: `${gradeF}%`}} />}
          </div>
          <div className="obs-grade-legend">
            <span><span className="dot a" />A</span>
            <span><span className="dot b" />B</span>
            <span><span className="dot c" />C</span>
            <span><span className="dot d" />D</span>
            <span><span className="dot f" />F</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SELECTED TEAMMATE DETAIL PANEL ────────────────────
function CharacterDetailPanel({ member, gamificationData, scoreData, rank }: {
  member: any; gamificationData?: any; scoreData?: any; rank: number;
}) {
  const xp = gamificationData?.xp || 0;
  const level = gamificationData?.level || 1;
  const title = gamificationData?.title || "Rookie";
  const hotStreak = gamificationData?.hotStreak || 0;
  const badges = gamificationData?.badges || [];
  const avgScore = scoreData?.averageScore;
  const totalCalls = scoreData?.totalCalls || 0;
  const gradeDistribution = scoreData?.gradeDistribution || { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const roleClass = getRoleClass(member.teamRole);
  const initials = member.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div className="obs-roster-card" data-rank={rank <= 3 ? rank : undefined} style={{maxWidth: '100%'}}>
      <div className={`obs-roster-card-header ${roleClass}`}>
        <div className="obs-roster-card-header-inner">
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Large avatar */}
            <div className="obs-roster-avatar-wrap">
              <div className="obs-roster-avatar" style={{width: 80, height: 80, fontSize: 24}}>
                {member.user?.profilePicture ? (
                  <img src={member.user.profilePicture} alt={member.name} />
                ) : (
                  initials
                )}
              </div>
              {rank <= 3 && <div className="obs-rank-number">#{rank}</div>}
            </div>
            
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="obs-roster-name" style={{fontSize: 18}}>{member.name}</div>
              <div className={`obs-roster-role-badge ${roleClass}`}>
                {roleLabels[member.teamRole] || member.teamRole}
              </div>
              
              <div className="flex items-center gap-4 mt-3">
                <div>
                  <span className="obs-level-number" style={{fontSize: 32}}>
                    LVL {level}
                  </span>
                </div>
                <div>
                  <div className="obs-level-title" style={{fontSize: 11, opacity: 1}}>{title}</div>
                  <div style={{fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: 'var(--obs-text-tertiary)'}}>{xp.toLocaleString()} XP</div>
                </div>
                {hotStreak > 0 && (
                  <div className="obs-streak-badge" style={{fontSize: 13}}>
                    🔥 {hotStreak}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Stats grid */}
      <div style={{padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, background: 'var(--obs-bg-inset)'}}>
        {[
          { label: "CALLS", value: totalCalls, color: 'var(--obs-accent-text)' },
          { label: "AVG SCORE", value: avgScore ? `${Math.round(avgScore)}%` : "N/A", color: '#d97706' },
          { label: "A & B GRADES", value: gradeDistribution.A + gradeDistribution.B, color: 'var(--obs-accent-text)' },
          { label: "BADGES", value: badges.length, color: '#7f1d1d' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--obs-bg-card)',
            border: '1px solid var(--obs-border-subtle)',
            borderRadius: 8,
            padding: 12,
            textAlign: 'center',
          }}>
            <div style={{fontFamily: "'Orbitron', sans-serif", fontSize: 24, fontWeight: 900, color: stat.color}}>
              {stat.value}
            </div>
            <div style={{fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: 'var(--obs-text-tertiary)', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginTop: 4}}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      
      {/* Badges showcase */}
      {badges.length > 0 && (
        <div style={{padding: '12px 16px 16px', background: 'var(--obs-bg-card)'}}>
          <div className="flex items-center gap-2 mb-2">
            <Award className="h-4 w-4" style={{color: 'var(--obs-accent-text)'}} />
            <span style={{fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: 'var(--obs-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' as const}}>Achievements</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge: any, i: number) => (
              <div key={i} style={{
                background: 'var(--obs-bg-inset)',
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--obs-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }} title={`${badge.name} (${badge.tier})`}>
                <span style={{fontSize: 14}}>{badge.icon}</span>
                <span style={{fontSize: 10, color: 'var(--obs-text-secondary)'}}>{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE BADGE CARD ─────────────────────────────────
const profileTierColors: Record<string, { bg: string; border: string; text: string }> = {
  bronze: { bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.2)", text: "var(--obs-role-gen)" },
  silver: { bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)", text: "var(--obs-text-secondary)" },
  gold: { bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.2)", text: "#d97706" },
};

interface BadgeTier { target: number; earned: boolean; earnedAt?: Date | string; }
interface BadgeData {
  code: string; name: string; description: string; icon: string; category: string;
  tiers: { bronze: BadgeTier; silver: BadgeTier; gold: BadgeTier; };
  currentProgress: number;
}

function ProfileBadgeCard({ badge }: { badge: BadgeData }) {
  const tiers = ["bronze", "silver", "gold"] as const;
  let highestEarnedTier: string | null = null;
  let nextTargetTier: typeof tiers[number] | null = null;
  let nextTarget = 0;
  
  for (const tier of tiers) {
    if (badge.tiers[tier].earned) highestEarnedTier = tier;
    else if (!nextTargetTier) { nextTargetTier = tier; nextTarget = badge.tiers[tier].target; }
  }
  
  const isEarned = highestEarnedTier !== null;
  const tierStyle = highestEarnedTier ? profileTierColors[highestEarnedTier] : profileTierColors.bronze;
  const progressPercent = nextTarget > 0 ? Math.min((badge.currentProgress / nextTarget) * 100, 100) : 100;

  return (
    <div style={{
      borderRadius: 10,
      overflow: 'hidden',
      border: `1px solid ${isEarned ? tierStyle.border : 'var(--obs-border-subtle)'}`,
      background: isEarned ? tierStyle.bg : 'var(--obs-bg-inset)',
      opacity: isEarned ? 1 : 0.6,
      borderStyle: isEarned ? 'solid' : 'dashed',
      transition: 'all 0.2s',
    }}>
      <div style={{padding: 16}}>
        <div className="flex items-start gap-3">
          <div style={{fontSize: 28, filter: isEarned ? 'none' : 'grayscale(1) opacity(0.5)'}}>{badge.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 style={{fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 12, color: isEarned ? tierStyle.text : 'var(--obs-text-tertiary)'}}>
                {badge.name}
              </h4>
              {isEarned ? <CheckCircle className="h-4 w-4" style={{color: '#22c55e'}} /> : <Lock className="h-4 w-4" style={{color: 'var(--obs-text-tertiary)'}} />}
            </div>
            <p style={{fontSize: 11, color: 'var(--obs-text-tertiary)', marginTop: 2}}>{badge.description}</p>
            {nextTargetTier && (
              <div style={{marginTop: 8}}>
                <div className="flex justify-between" style={{fontSize: 9, color: 'var(--obs-text-tertiary)', fontFamily: "'Orbitron', sans-serif", marginBottom: 4}}>
                  <span>{nextTargetTier.toUpperCase()}</span>
                  <span>{badge.currentProgress} / {nextTarget}</span>
                </div>
                <div className="obs-xp-bar">
                  <div className="obs-xp-fill" style={{width: `${progressPercent}%`}} />
                </div>
              </div>
            )}
            {isEarned && (
              <div className="flex gap-1 mt-2">
                {tiers.map(tier => badge.tiers[tier].earned && (
                  <span key={tier} style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 9,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: profileTierColors[tier].bg,
                    color: profileTierColors[tier].text,
                    border: `1px solid ${profileTierColors[tier].border}`,
                  }}>
                    {tier.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MY PROFILE ────────────────────────────────────────
function MyProfileContent() {
  const { data: gamification, isLoading: gamificationLoading } = trpc.gamification.getSummary.useQuery();
  const { data: allBadges, isLoading: badgesLoading } = trpc.gamification.getAllBadges.useQuery();

  const earnedBadges = allBadges?.filter((b: BadgeData) => b.tiers.bronze.earned || b.tiers.silver.earned || b.tiers.gold.earned) || [];
  const inProgressBadges = allBadges?.filter((b: BadgeData) => !b.tiers.bronze.earned && !b.tiers.silver.earned && !b.tiers.gold.earned) || [];

  return (
    <div className="space-y-6">
      {/* XP & Level */}
      <div className="obs-roster-card" style={{maxWidth: '100%'}}>
        <div className="obs-roster-card-header acq">
          <div className="obs-roster-card-header-inner">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5" style={{color: '#d97706'}} />
              <h3 style={{fontFamily: "'Orbitron', sans-serif", fontSize: 11, color: 'var(--obs-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' as const}}>Level & Experience</h3>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="obs-level-number" style={{fontSize: 36}}>
                      Level {gamification?.xp.level ?? 1}
                    </p>
                    <p className="obs-level-title" style={{fontSize: 14, opacity: 1, marginTop: 4}}>{gamification?.xp.title ?? "Rookie"}</p>
                  </div>
                  <div className="text-right">
                    <p style={{fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 900, color: 'var(--obs-accent-text)'}}>
                      {gamification?.xp.totalXp?.toLocaleString() ?? 0} XP
                    </p>
                    <p style={{fontSize: 12, color: 'var(--obs-text-tertiary)'}}>
                      {((gamification?.xp.nextLevelXp ?? 500) - (gamification?.xp.totalXp ?? 0)).toLocaleString()} XP to next level
                    </p>
                  </div>
                </div>
                <div>
                  <div className="obs-xp-bar" style={{height: 10}}>
                    <div className="obs-xp-fill" style={{width: `${gamification?.xp.progress ?? 0}%`}} />
                  </div>
                  <p style={{fontSize: 11, color: 'var(--obs-text-tertiary)', marginTop: 4, textAlign: 'right'}}>{gamification?.xp.progress ?? 0}% to Level {(gamification?.xp.level ?? 1) + 1}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Streaks */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="obs-panel">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="h-5 w-5" style={{color: '#ea580c'}} />
            <h3 style={{fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: 'var(--obs-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' as const}}>Hot Streak</h3>
          </div>
          <p style={{fontSize: 10, color: 'var(--obs-text-tertiary)', marginBottom: 12}}>Consecutive C+ or better grades</p>
          {gamificationLoading ? <Skeleton className="h-16 w-full" /> : (
            <div className="flex items-center justify-between">
              <div>
                <p style={{fontFamily: "'Orbitron', sans-serif", fontSize: 36, fontWeight: 900, color: '#ea580c'}}>
                  {gamification?.streaks.hotStreakCurrent ?? 0}
                </p>
                <p style={{fontSize: 11, color: 'var(--obs-text-tertiary)'}}>Current</p>
              </div>
              <div className="text-right">
                <p style={{fontFamily: "'Orbitron', sans-serif", fontSize: 24, fontWeight: 900, color: 'var(--obs-text-secondary)'}}>
                  {gamification?.streaks.hotStreakBest ?? 0}
                </p>
                <p style={{fontSize: 11, color: 'var(--obs-text-tertiary)'}}>Best</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="obs-panel">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-5 w-5" style={{color: '#2563eb'}} />
            <h3 style={{fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: 'var(--obs-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' as const}}>Consistency Streak</h3>
          </div>
          <p style={{fontSize: 10, color: 'var(--obs-text-tertiary)', marginBottom: 12}}>Days with at least one graded call</p>
          {gamificationLoading ? <Skeleton className="h-16 w-full" /> : (
            <div className="flex items-center justify-between">
              <div>
                <p style={{fontFamily: "'Orbitron', sans-serif", fontSize: 36, fontWeight: 900, color: '#2563eb'}}>
                  {gamification?.streaks.consistencyStreakCurrent ?? 0}
                </p>
                <p style={{fontSize: 11, color: 'var(--obs-text-tertiary)'}}>Current</p>
              </div>
              <div className="text-right">
                <p style={{fontFamily: "'Orbitron', sans-serif", fontSize: 24, fontWeight: 900, color: 'var(--obs-text-secondary)'}}>
                  {gamification?.streaks.consistencyStreakBest ?? 0}
                </p>
                <p style={{fontSize: 11, color: 'var(--obs-text-tertiary)'}}>Best</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Earned Badges */}
      <div>
        <h2 className="obs-section-title flex items-center gap-2" style={{marginBottom: 16}}>
          <Award className="h-5 w-5" style={{color: 'var(--obs-accent-text)'}} />
          Earned ({earnedBadges.length})
        </h2>
        {badgesLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : earnedBadges.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {earnedBadges.map((badge: BadgeData) => <ProfileBadgeCard key={badge.code} badge={badge} />)}
          </div>
        ) : (
          <div style={{
            borderRadius: 10,
            border: '1px solid var(--obs-border-subtle)',
            background: 'var(--obs-bg-inset)',
            padding: '32px 16px',
            textAlign: 'center',
          }}>
            <Award className="h-12 w-12 mx-auto mb-2" style={{color: 'var(--obs-text-tertiary)', opacity: 0.5}} />
            <p style={{fontSize: 13, color: 'var(--obs-text-tertiary)'}}>No badges earned yet. Keep grinding!</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="obs-section-title flex items-center gap-2" style={{marginBottom: 16}}>
          <Zap className="h-5 w-5" style={{color: '#ea580c'}} />
          In Progress ({inProgressBadges.length})
        </h2>
        {badgesLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : inProgressBadges.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {inProgressBadges.map((badge: BadgeData) => <ProfileBadgeCard key={badge.code} badge={badge} />)}
          </div>
        ) : earnedBadges.length === allBadges?.length ? (
          <div style={{
            borderRadius: 10,
            border: '1px solid var(--obs-border-subtle)',
            background: 'var(--obs-bg-inset)',
            padding: '32px 16px',
            textAlign: 'center',
          }}>
            <CheckCircle className="h-12 w-12 mx-auto mb-2" style={{color: '#22c55e', opacity: 0.5}} />
            <p style={{fontSize: 13, color: 'var(--obs-text-tertiary)'}}>All badges earned! You're a legend!</p>
          </div>
        ) : (
          <div style={{
            borderRadius: 10,
            border: '1px solid var(--obs-border-subtle)',
            background: 'var(--obs-bg-inset)',
            padding: '32px 16px',
            textAlign: 'center',
          }}>
            <Zap className="h-12 w-12 mx-auto mb-2" style={{color: '#ea580c', opacity: 0.5}} />
            <p style={{fontSize: 13, color: 'var(--obs-text-tertiary)'}}>Start making calls to unlock badges!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TEAM MEMBERS CONTENT ───────────────────────────────
function TeamMembersContent() {
  const { user } = useAuth();
  const { isDemo, guardAction: guardDemoAction } = useDemo();
  const utils = trpc.useUtils();
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  
  const { data: teamMembers, isLoading: membersLoading, refetch } = trpc.team.list.useQuery();
  const { data: scoreLeaderboard, isLoading: scoreLoading } = trpc.leaderboard.get.useQuery();
  const { data: gamificationLeaderboard, isLoading: gamificationLoading } = trpc.gamification.getLeaderboard.useQuery();
  
  const uploadPictureMutation = trpc.auth.updateProfilePicture.useMutation({
    onSuccess: () => { toast.success("Profile picture updated!"); utils.team.list.invalidate(); utils.auth.me.invalidate(); },
    onError: (error) => { toast.error(`Failed to upload: ${error.message}`); },
  });
  
  const seedMutation = trpc.team.seed.useMutation({
    onSuccess: () => { toast.success("Team members seeded successfully"); refetch(); },
    onError: (error) => { toast.error(`Failed to seed team: ${error.message}`); },
  });

  const isLoading = membersLoading || scoreLoading || gamificationLoading;

  const scoreMap = useMemo(() => {
    const m = new Map();
    if (scoreLeaderboard) {
      scoreLeaderboard.forEach((entry) => {
        m.set(entry.teamMember.id, { totalCalls: entry.totalCalls, averageScore: entry.averageScore, gradeDistribution: entry.gradeDistribution });
      });
    }
    return m;
  }, [scoreLeaderboard]);
  
  const gamificationMap = useMemo(() => {
    const m = new Map();
    if (gamificationLeaderboard) {
      gamificationLeaderboard.forEach((entry: any) => {
        m.set(entry.teamMemberId, { xp: entry.totalXp, level: entry.level, title: entry.title, hotStreak: entry.hotStreak, badges: entry.topBadges });
      });
    }
    return m;
  }, [gamificationLeaderboard]);
  
  const sortedMembers = useMemo(() => {
    let members = teamMembers?.slice().sort((a, b) => {
      const aXp = gamificationMap.get(a.id)?.xp || 0;
      const bXp = gamificationMap.get(b.id)?.xp || 0;
      return bXp - aXp;
    }) || [];
    
    if (roleFilter !== "all") {
      members = members.filter(m => m.teamRole === roleFilter);
    }
    
    return members;
  }, [teamMembers, gamificationMap, roleFilter]);

  const selectedMember = sortedMembers.find(m => m.id === selectedMemberId);
  const selectedRank = selectedMember ? sortedMembers.indexOf(selectedMember) + 1 : 0;

  return (
    <div className="space-y-6">
      {(!teamMembers || teamMembers.length === 0) && !isLoading && (
        <div className="flex justify-end">
          <Button onClick={() => { if (!guardDemoAction("Team management")) seedMutation.mutate(); }} disabled={seedMutation.isPending || isDemo}
            style={{background: 'linear-gradient(135deg, var(--obs-accent), var(--obs-accent-light))', color: '#fff', border: 'none'}}>
            <UserPlus className="h-4 w-4 mr-2" /> Initialize Team
          </Button>
        </div>
      )}

      {/* Selected teammate detail panel */}
      {selectedMember && (
        <CharacterDetailPanel
          member={selectedMember}
          gamificationData={gamificationMap.get(selectedMember.id)}
          scoreData={scoreMap.get(selectedMember.id)}
          rank={selectedRank}
        />
      )}

      {/* Teammate grid */}
      {isLoading ? (
        <div className="obs-roster-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="obs-roster-card" style={{overflow: 'hidden'}}>
              <div style={{padding: 16}}><Skeleton className="h-24 w-full" /></div>
              <div style={{padding: '0 16px 16px'}}>
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedMembers.length > 0 ? (
        <div className="obs-roster-grid">
          {sortedMembers.map((member, index) => {
            const isCurrentUser = member.userId === user?.id;
            return (
              <CharacterCard
                key={member.id}
                member={member}
                gamificationData={gamificationMap.get(member.id)}
                scoreData={scoreMap.get(member.id)}
                rank={index + 1}
                isCurrentUser={isCurrentUser}
                onUploadPicture={isCurrentUser ? (base64, mimeType) => { uploadPictureMutation.mutate({ imageBase64: base64, mimeType }); } : undefined}
                isSelected={selectedMemberId === member.id}
                onSelect={() => setSelectedMemberId(selectedMemberId === member.id ? null : member.id)}
              />
            );
          })}
        </div>
      ) : (
        <div style={{
          borderRadius: 12,
          border: '1px solid var(--obs-border-subtle)',
          background: 'var(--obs-bg-card)',
          padding: '64px 16px',
          textAlign: 'center',
        }}>
          <Users className="h-16 w-16 mx-auto mb-4" style={{color: 'var(--obs-text-tertiary)'}} />
          <h3 style={{fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--obs-text-primary)'}}>No Teammates Found</h3>
          <p style={{fontSize: 13, color: 'var(--obs-text-tertiary)', maxWidth: 400, margin: '8px auto 16px'}}>
            Add your first team members to start tracking call performance and coaching.
          </p>
          <Button onClick={() => window.location.href = "/settings"} style={{background: 'linear-gradient(135deg, var(--obs-accent), var(--obs-accent-light))', color: '#fff', border: 'none'}}>
            <UserPlus className="h-4 w-4 mr-2" /> Go to Settings
          </Button>
        </div>
      )}

      {/* Team Roles Legend */}
      <div className="obs-panel" style={{padding: 0, overflow: 'hidden'}}>
        <div style={{padding: '12px 16px', borderBottom: '1px solid var(--obs-border-subtle)'}}>
          <h3 style={{fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: 'var(--obs-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' as const}} className="flex items-center gap-2">
            <Swords className="h-4 w-4" /> Teammate Classes
          </h3>
        </div>
        <div style={{padding: 16}} className="grid gap-3 sm:grid-cols-3">
          {[
            { role: "lead_manager", label: "Lead Manager", desc: "Qualifies leads, extracts motivation, discusses price, and sets appointments for walkthroughs.", roleClass: "lead" },
            { role: "acquisition_manager", label: "Acquisition Manager", desc: "Handles offer calls and closings. Graded on motivation restatement, offer setup, and price delivery.", roleClass: "acq" },
            { role: "lead_generator", label: "Lead Generator", desc: "Makes cold calls to generate interest. Sets up warm handoffs to Lead Managers.", roleClass: "gen" },
          ].map(r => (
            <div key={r.role} style={{borderRadius: 10, overflow: 'hidden'}}>
              <div className={`obs-roster-card-header ${r.roleClass}`} style={{padding: 1}}>
                <div style={{background: 'var(--obs-bg-card)', padding: 12, borderRadius: 9}}>
                  <div className={`obs-roster-role-badge ${r.roleClass}`}>
                    {r.label}
                  </div>
                  <p style={{fontSize: 12, color: 'var(--obs-text-tertiary)', marginTop: 8, lineHeight: 1.5}}>{r.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ────────────────────────────────────────
export default function TeamMembers() {
  const [activeTab, setActiveTab] = useState<"team" | "profile">("team");
  const { user } = useAuth();
  const isLeadGenerator = user?.teamRole === 'lead_generator';
  
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page header - lookbook style */}
      <div className="obs-section-header">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter">Team Roster</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--obs-text-tertiary)' }}>
            {isLeadGenerator ? "Your profile and performance" : "Your squad ranked by performance"}
          </p>
        </div>
        <span className="obs-section-badge">{activeTab === "team" ? "Roster" : "Profile"}</span>
      </div>

      {/* Role filter tabs - lookbook style */}
      <div className="obs-role-tabs">
        <button 
          className={`obs-role-tab ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          <Users className="h-4 w-4" />
          {isLeadGenerator ? 'My Profile' : 'Roster'}
        </button>
        <button 
          className={`obs-role-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User className="h-4 w-4" />
          My Profile
        </button>
      </div>
      
      {activeTab === "team" ? <TeamMembersContent /> : <MyProfileContent />}
    </div>
  );
}
