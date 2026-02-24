import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { 
  Users, UserPlus, Trophy, Medal, Flame, Zap, Target, 
  TrendingUp, Camera, Upload, Award, Star, Lock, CheckCircle, User,
  Swords, Shield, Crown
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

const roleGlowColors: Record<string, string> = {
  admin: "from-purple-500 to-purple-700",
  lead_manager: "from-blue-500 to-cyan-500",
  acquisition_manager: "from-emerald-500 to-green-500",
  lead_generator: "from-amber-500 to-orange-500",
};

const roleBadgeColors: Record<string, string> = {
  admin: "bg-purple-500/80 text-white border-purple-400/50",
  lead_manager: "bg-blue-500/80 text-white border-blue-400/50",
  acquisition_manager: "bg-emerald-500/80 text-white border-emerald-400/50",
  lead_generator: "bg-amber-500/80 text-white border-amber-400/50",
};

// ─── RANK GLOW COLORS ───────────────────────────────────
function getRankGlow(rank: number) {
  if (rank === 1) return { border: "border-yellow-400", shadow: "shadow-[0_0_20px_rgba(250,204,21,0.5)]", bg: "from-yellow-400/20 to-yellow-600/10" };
  if (rank === 2) return { border: "border-slate-300", shadow: "shadow-[0_0_15px_rgba(203,213,225,0.4)]", bg: "from-slate-300/15 to-slate-400/5" };
  if (rank === 3) return { border: "border-amber-600", shadow: "shadow-[0_0_15px_rgba(217,119,6,0.4)]", bg: "from-amber-600/15 to-amber-700/5" };
  return { border: "border-slate-700", shadow: "", bg: "from-slate-800/50 to-slate-900/50" };
}

// ─── LEVEL TIER STYLING ─────────────────────────────────
function getLevelStyle(level: number) {
  if (level >= 5) return { color: "text-yellow-400", glow: "drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]", label: "LEGENDARY" };
  if (level >= 4) return { color: "text-purple-400", glow: "drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]", label: "EPIC" };
  if (level >= 3) return { color: "text-blue-400", glow: "drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]", label: "RARE" };
  if (level >= 2) return { color: "text-emerald-400", glow: "drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]", label: "UNCOMMON" };
  return { color: "text-slate-400", glow: "", label: "COMMON" };
}

// ─── STAT BAR COMPONENT ─────────────────────────────────
function StatBar({ label, value, max, color, icon }: { label: string; value: number; max: number; color: string; icon?: React.ReactNode }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-xs opacity-60 w-4">{icon}</span>}
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 w-12 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-slate-800 rounded-sm overflow-hidden border border-slate-700/50 relative">
        <div 
          className={`h-full ${color} transition-all duration-700 ease-out relative`}
          style={{ width: `${pct}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20" />
        </div>
      </div>
      <span className="text-xs font-mono text-slate-300 w-10 text-right tabular-nums">{value}</span>
    </div>
  );
}

// ─── RANK BADGE ─────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="absolute -top-3 -left-3 z-20">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/40 border border-yellow-300/50 rotate-[-5deg]">
        <Crown className="h-5 w-5 text-yellow-900" />
      </div>
    </div>
  );
  if (rank === 2) return (
    <div className="absolute -top-3 -left-3 z-20">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-200 via-slate-300 to-slate-500 flex items-center justify-center shadow-lg shadow-slate-400/30 border border-slate-200/50 rotate-[-5deg]">
        <Medal className="h-5 w-5 text-slate-700" />
      </div>
    </div>
  );
  if (rank === 3) return (
    <div className="absolute -top-3 -left-3 z-20">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 via-amber-600 to-amber-800 flex items-center justify-center shadow-lg shadow-amber-600/30 border border-amber-400/50 rotate-[-5deg]">
        <Medal className="h-5 w-5 text-amber-200" />
      </div>
    </div>
  );
  return null;
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
          <AvatarFallback className="text-4xl"><Camera className="h-12 w-12 text-muted-foreground" /></AvatarFallback>
        </Avatar>
        <Button size="icon" variant="secondary" className="absolute bottom-0 right-0 rounded-full" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" />
        </Button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <p className="text-sm text-muted-foreground">Click to upload a profile picture</p>
    </div>
  );
}

// ─── CHARACTER CARD (THE MAIN EVENT) ────────────────────
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
  
  const rankGlow = getRankGlow(rank);
  const levelStyle = getLevelStyle(level);
  const roleGlow = roleGlowColors[member.teamRole] || "from-slate-500 to-slate-700";
  const roleBadge = roleBadgeColors[member.teamRole] || "bg-slate-500/80 text-white";

  // Max values for stat bars (use reasonable maximums)
  const maxCalls = 200;
  const maxScore = 100;
  const maxAB = Math.max(totalCalls, 50);
  const maxBadges = 20;

  return (
    <div 
      className={`relative group cursor-pointer transition-all duration-300 ${
        isSelected ? "scale-[1.02] z-10" : "hover:scale-[1.01]"
      }`}
      onClick={onSelect}
    >
      {/* Rank badge */}
      <RankBadge rank={rank} />
      
      {/* Card container */}
      <div className={`relative rounded-xl overflow-hidden border-2 transition-all duration-300 ${
        isSelected 
          ? `${rankGlow.border} ${rankGlow.shadow}` 
          : `border-slate-700/60 hover:border-slate-600`
      }`}>
        
        {/* Top gradient header - character portrait area */}
        <div className={`relative bg-gradient-to-br ${roleGlow} p-0.5`}>
          <div className="bg-slate-900/90 backdrop-blur-sm">
            <div className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <div className={`relative shrink-0 ${isCurrentUser ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}>
                      <div className={`rounded-lg overflow-hidden border-2 ${
                        rank === 1 ? "border-yellow-400/70" : rank === 2 ? "border-slate-300/70" : rank === 3 ? "border-amber-500/70" : "border-slate-600"
                      }`}>
                        <Avatar className="h-16 w-16 sm:h-20 sm:w-20 rounded-none">
                          <AvatarImage src={member.user?.profilePicture || undefined} className="object-cover" />
                          <AvatarFallback className="text-xl sm:text-2xl font-black bg-gradient-to-br from-slate-700 to-slate-800 text-white rounded-none" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                            {member.name?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      {isCurrentUser && (
                        <div className="absolute -bottom-1 -right-1 bg-slate-800 rounded-full p-1 border border-slate-600">
                          <Camera className="h-2.5 w-2.5 text-slate-300" />
                        </div>
                      )}
                      {/* Rank number */}
                      <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-slate-300" style={{ fontFamily: "'Orbitron', sans-serif" }}>#{rank}</span>
                      </div>
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
                
                {/* Name & Role */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-white leading-tight truncate tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    {member.name}
                  </h3>
                  <div className={`inline-block text-[10px] sm:text-xs px-2 py-0.5 rounded mt-1 border ${roleBadge}`} style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    {roleLabels[member.teamRole] || member.teamRole}
                  </div>
                  
                  {/* Badges row */}
                  {badges.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {badges.slice(0, 5).map((badge: any, i: number) => (
                        <span key={i} className="text-sm" title={`${badge.name} (${badge.tier})`}>
                          {badge.icon}
                        </span>
                      ))}
                      {badges.length > 5 && (
                        <span className="text-[10px] text-slate-500 self-center">+{badges.length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Level display */}
                <div className="shrink-0 text-right">
                  <div className={`text-2xl sm:text-3xl font-black ${levelStyle.color} ${levelStyle.glow} leading-none`} style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    {level}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-widest mt-0.5" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    LVL
                  </div>
                  <div className={`text-[8px] sm:text-[9px] ${levelStyle.color} uppercase tracking-wider mt-0.5 opacity-70`} style={{ fontFamily: "'Press Start 2P', cursive", fontSize: "7px" }}>
                    {title}
                  </div>
                  {hotStreak > 0 && (
                    <div className="flex items-center justify-end gap-0.5 mt-1">
                      <Flame className="h-3 w-3 text-orange-400" />
                      <span className="text-xs font-bold text-orange-400">{hotStreak}</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* XP Progress bar */}
              <div className="mt-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">{xp.toLocaleString()} XP</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 transition-all duration-1000 relative"
                    style={{ width: `${Math.min((xp % 500) / 5, 100)}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/30" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Stats section - dark panel */}
        <div className="bg-slate-900 p-3 sm:p-4 space-y-1.5">
          <StatBar label="CALLS" value={totalCalls} max={maxCalls} color="bg-gradient-to-r from-cyan-500 to-cyan-400" />
          <StatBar label="SCORE" value={avgScore ? Math.round(avgScore) : 0} max={maxScore} color="bg-gradient-to-r from-emerald-500 to-emerald-400" />
          <StatBar label="A & B" value={abCount} max={maxAB} color="bg-gradient-to-r from-green-500 to-lime-400" />
          <StatBar label="BADGE" value={badges.length} max={maxBadges} color="bg-gradient-to-r from-purple-500 to-pink-400" />
          
          {/* Grade distribution mini bar */}
          {totalCalls > 0 && (
            <div className="pt-1.5 mt-1 border-t border-slate-800">
              <div className="flex h-1.5 rounded-full overflow-hidden">
                {gradeDistribution.A > 0 && <div className="bg-emerald-500" style={{ width: `${(gradeDistribution.A / totalCalls) * 100}%` }} />}
                {gradeDistribution.B > 0 && <div className="bg-teal-500" style={{ width: `${(gradeDistribution.B / totalCalls) * 100}%` }} />}
                {gradeDistribution.C > 0 && <div className="bg-yellow-500" style={{ width: `${(gradeDistribution.C / totalCalls) * 100}%` }} />}
                {gradeDistribution.D > 0 && <div className="bg-orange-500" style={{ width: `${(gradeDistribution.D / totalCalls) * 100}%` }} />}
                {gradeDistribution.F > 0 && <div className="bg-red-500" style={{ width: `${(gradeDistribution.F / totalCalls) * 100}%` }} />}
              </div>
              <div className="flex gap-2 mt-1 justify-center">
                {[
                  { label: "A", count: gradeDistribution.A, color: "bg-emerald-500" },
                  { label: "B", count: gradeDistribution.B, color: "bg-teal-500" },
                  { label: "C", count: gradeDistribution.C, color: "bg-yellow-500" },
                  { label: "D", count: gradeDistribution.D, color: "bg-orange-500" },
                  { label: "F", count: gradeDistribution.F, color: "bg-red-500" },
                ].map(g => (
                  <span key={g.label} className="flex items-center gap-0.5 text-[9px] text-slate-500">
                    <span className={`w-1.5 h-1.5 rounded-full ${g.color}`} />{g.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Selection indicator glow line at bottom */}
        {isSelected && (
          <div className={`h-0.5 bg-gradient-to-r ${roleGlow}`} />
        )}
      </div>
    </div>
  );
}

// ─── SELECTED CHARACTER DETAIL PANEL ────────────────────
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
  const levelStyle = getLevelStyle(level);
  const roleGlow = roleGlowColors[member.teamRole] || "from-slate-500 to-slate-700";

  return (
    <div className="relative rounded-xl overflow-hidden border-2 border-slate-700/60 bg-slate-900">
      {/* Header with gradient */}
      <div className={`bg-gradient-to-r ${roleGlow} p-0.5`}>
        <div className="bg-slate-900/95 backdrop-blur-sm p-4 sm:p-6">
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Large avatar */}
            <div className="relative shrink-0">
              <div className={`rounded-xl overflow-hidden border-3 ${
                rank === 1 ? "border-yellow-400" : rank === 2 ? "border-slate-300" : rank === 3 ? "border-amber-500" : "border-slate-600"
              }`}>
                <Avatar className="h-24 w-24 sm:h-32 sm:w-32 rounded-none">
                  <AvatarImage src={member.user?.profilePicture || undefined} className="object-cover" />
                  <AvatarFallback className="text-4xl sm:text-5xl font-black bg-gradient-to-br from-slate-700 to-slate-800 text-white rounded-none" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    {member.name?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              {rank <= 3 && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                  <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                    rank === 1 ? "bg-yellow-400 text-yellow-900" : rank === 2 ? "bg-slate-300 text-slate-800" : "bg-amber-600 text-amber-100"
                  }`} style={{ fontFamily: "'Press Start 2P', cursive", fontSize: "7px" }}>
                    {rank === 1 ? "1ST" : rank === 2 ? "2ND" : "3RD"}
                  </div>
                </div>
              )}
            </div>
            
            {/* Character info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-3xl font-black text-white tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                {member.name}
              </h2>
              <div className={`inline-block text-xs px-3 py-1 rounded mt-1 border ${roleBadgeColors[member.teamRole] || "bg-slate-500/80 text-white"}`} style={{ fontFamily: "'Orbitron', sans-serif" }}>
                {roleLabels[member.teamRole] || member.teamRole}
              </div>
              
              <div className="flex items-center gap-4 mt-3">
                <div>
                  <span className={`text-3xl sm:text-4xl font-black ${levelStyle.color} ${levelStyle.glow}`} style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    LVL {level}
                  </span>
                </div>
                <div className="text-slate-400">
                  <div className="text-sm font-bold" style={{ fontFamily: "'Orbitron', sans-serif" }}>{title}</div>
                  <div className="text-xs font-mono">{xp.toLocaleString()} XP</div>
                </div>
                {hotStreak > 0 && (
                  <div className="flex items-center gap-1 bg-orange-500/20 px-3 py-1.5 rounded-lg border border-orange-500/30">
                    <Flame className="h-4 w-4 text-orange-400" />
                    <span className="text-sm font-bold text-orange-400" style={{ fontFamily: "'Orbitron', sans-serif" }}>{hotStreak}</span>
                    <span className="text-[10px] text-orange-400/70 uppercase">streak</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Stats grid */}
      <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "CALLS", value: totalCalls, color: "from-cyan-500 to-cyan-600", textColor: "text-cyan-400" },
          { label: "AVG SCORE", value: avgScore ? `${Math.round(avgScore)}%` : "N/A", color: "from-emerald-500 to-emerald-600", textColor: "text-emerald-400" },
          { label: "A & B GRADES", value: gradeDistribution.A + gradeDistribution.B, color: "from-green-500 to-lime-500", textColor: "text-green-400" },
          { label: "BADGES", value: badges.length, color: "from-purple-500 to-pink-500", textColor: "text-purple-400" },
        ].map(stat => (
          <div key={stat.label} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50 text-center">
            <div className={`text-2xl sm:text-3xl font-black ${stat.textColor}`} style={{ fontFamily: "'Orbitron', sans-serif" }}>
              {stat.value}
            </div>
            <div className="text-[9px] text-slate-500 uppercase tracking-widest mt-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      
      {/* Badges showcase */}
      {badges.length > 0 && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="flex items-center gap-2 mb-2">
            <Award className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>Achievements</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge: any, i: number) => (
              <div key={i} className="bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/50 flex items-center gap-1.5" title={`${badge.name} (${badge.tier})`}>
                <span className="text-base">{badge.icon}</span>
                <span className="text-[10px] text-slate-400 font-medium">{badge.name}</span>
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
  bronze: { bg: "bg-amber-900/30", border: "border-amber-700/50", text: "text-amber-400" },
  silver: { bg: "bg-slate-800/50", border: "border-slate-500/50", text: "text-slate-300" },
  gold: { bg: "bg-yellow-900/30", border: "border-yellow-500/50", text: "text-yellow-400" },
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
    <div className={`relative rounded-lg overflow-hidden transition-all border ${
      isEarned ? `${tierStyle.bg} ${tierStyle.border}` : "bg-slate-800/30 border-slate-700/30 border-dashed opacity-60"
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`text-3xl ${!isEarned && "grayscale opacity-50"}`}>{badge.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`font-bold text-sm ${isEarned ? tierStyle.text : "text-slate-500"}`} style={{ fontFamily: "'Orbitron', sans-serif" }}>
                {badge.name}
              </h4>
              {isEarned ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-slate-600" />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{badge.description}</p>
            {nextTargetTier && (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
                  <span>{nextTargetTier.toUpperCase()}</span>
                  <span>{badge.currentProgress} / {nextTarget}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            )}
            {isEarned && (
              <div className="flex gap-1 mt-2">
                {tiers.map(tier => badge.tiers[tier].earned && (
                  <span key={tier} className={`text-[10px] px-2 py-0.5 rounded ${profileTierColors[tier].bg} ${profileTierColors[tier].text} border ${profileTierColors[tier].border}`} style={{ fontFamily: "'Orbitron', sans-serif" }}>
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

// ─── MY PROFILE (DARK THEME) ────────────────────────────
function MyProfileContent() {
  const { data: gamification, isLoading: gamificationLoading } = trpc.gamification.getSummary.useQuery();
  const { data: allBadges, isLoading: badgesLoading } = trpc.gamification.getAllBadges.useQuery();

  const earnedBadges = allBadges?.filter((b: BadgeData) => b.tiers.bronze.earned || b.tiers.silver.earned || b.tiers.gold.earned) || [];
  const inProgressBadges = allBadges?.filter((b: BadgeData) => !b.tiers.bronze.earned && !b.tiers.silver.earned && !b.tiers.gold.earned) || [];

  return (
    <div className="space-y-6">
      {/* XP & Level */}
      <div className="rounded-xl overflow-hidden border-2 border-slate-700/60 bg-slate-900">
        <div className="bg-gradient-to-r from-cyan-500 to-purple-500 p-0.5">
          <div className="bg-slate-900/95 p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <h3 className="text-sm text-slate-400 uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>Level & Experience</h3>
            </div>
            {gamificationLoading ? (
              <Skeleton className="h-24 w-full bg-slate-800" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-black text-white" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      Level {gamification?.xp.level ?? 1}
                    </p>
                    <p className="text-lg text-cyan-400" style={{ fontFamily: "'Orbitron', sans-serif" }}>{gamification?.xp.title ?? "Rookie"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-purple-400" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      {gamification?.xp.totalXp?.toLocaleString() ?? 0} XP
                    </p>
                    <p className="text-sm text-slate-500 font-mono">
                      {((gamification?.xp.nextLevelXp ?? 500) - (gamification?.xp.totalXp ?? 0)).toLocaleString()} XP to next level
                    </p>
                  </div>
                </div>
                <div>
                  <div className="h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                    <div className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 transition-all duration-500 relative" style={{ width: `${gamification?.xp.progress ?? 0}%` }}>
                      <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 text-right font-mono">{gamification?.xp.progress ?? 0}% to Level {(gamification?.xp.level ?? 1) + 1}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Streaks */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl overflow-hidden border-2 border-slate-700/60 bg-slate-900">
          <div className="bg-gradient-to-r from-orange-500 to-red-500 p-0.5">
            <div className="bg-slate-900/95 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Flame className="h-5 w-5 text-orange-400" />
                <h3 className="text-xs text-slate-400 uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>Hot Streak</h3>
              </div>
              <p className="text-[10px] text-slate-500 mb-3">Consecutive C+ or better grades</p>
              {gamificationLoading ? <Skeleton className="h-16 w-full bg-slate-800" /> : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-black text-orange-400" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      {gamification?.streaks.hotStreakCurrent ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">Current</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-orange-600" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      {gamification?.streaks.hotStreakBest ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">Best</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden border-2 border-slate-700/60 bg-slate-900">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-0.5">
            <div className="bg-slate-900/95 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-5 w-5 text-blue-400" />
                <h3 className="text-xs text-slate-400 uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>Consistency</h3>
              </div>
              <p className="text-[10px] text-slate-500 mb-3">Days with at least one graded call</p>
              {gamificationLoading ? <Skeleton className="h-16 w-full bg-slate-800" /> : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-black text-blue-400" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      {gamification?.streaks.consistencyStreakCurrent ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">Current</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-blue-600" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                      {gamification?.streaks.consistencyStreakBest ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">Best</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2 text-slate-300 uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            <Award className="h-5 w-5 text-purple-400" />
            Earned ({earnedBadges.length})
          </h2>
          {badgesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full bg-slate-800 rounded-lg" />)}
            </div>
          ) : earnedBadges.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {earnedBadges.map((badge: BadgeData) => <ProfileBadgeCard key={badge.code} badge={badge} />)}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 flex flex-col items-center justify-center py-8">
              <Award className="h-12 w-12 text-slate-600 mb-2" />
              <p className="text-slate-500 text-sm">No badges earned yet. Keep grinding!</p>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2 text-slate-300 uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            <Zap className="h-5 w-5 text-orange-400" />
            In Progress ({inProgressBadges.length})
          </h2>
          {badgesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full bg-slate-800 rounded-lg" />)}
            </div>
          ) : inProgressBadges.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {inProgressBadges.map((badge: BadgeData) => <ProfileBadgeCard key={badge.code} badge={badge} />)}
            </div>
          ) : earnedBadges.length === allBadges?.length ? (
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 flex flex-col items-center justify-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500/50 mb-2" />
              <p className="text-slate-500 text-sm">All badges earned! You're a legend!</p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 flex flex-col items-center justify-center py-8">
              <Zap className="h-12 w-12 text-orange-500/50 mb-2" />
              <p className="text-slate-500 text-sm">Start making calls to unlock badges!</p>
            </div>
          )}
        </div>
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
    return teamMembers?.slice().sort((a, b) => {
      const aXp = gamificationMap.get(a.id)?.xp || 0;
      const bXp = gamificationMap.get(b.id)?.xp || 0;
      return bXp - aXp;
    }) || [];
  }, [teamMembers, gamificationMap]);

  const selectedMember = sortedMembers.find(m => m.id === selectedMemberId);
  const selectedRank = selectedMember ? sortedMembers.indexOf(selectedMember) + 1 : 0;

  return (
    <div className="space-y-6">
      {(!teamMembers || teamMembers.length === 0) && !isLoading && (
        <div className="flex justify-end">
          <Button onClick={() => { if (!guardDemoAction("Team management")) seedMutation.mutate(); }} disabled={seedMutation.isPending || isDemo}
            className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white border-0 hover:from-cyan-600 hover:to-purple-600">
            <UserPlus className="h-4 w-4 mr-2" /> Initialize Team
          </Button>
        </div>
      )}

      {/* Selected character detail panel */}
      {selectedMember && (
        <CharacterDetailPanel
          member={selectedMember}
          gamificationData={gamificationMap.get(selectedMember.id)}
          scoreData={scoreMap.get(selectedMember.id)}
          rank={selectedRank}
        />
      )}

      {/* Character grid */}
      {isLoading ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="rounded-xl border-2 border-slate-700/60 bg-slate-900 overflow-hidden">
              <div className="p-4"><Skeleton className="h-24 w-full bg-slate-800" /></div>
              <div className="p-4 space-y-2">
                <Skeleton className="h-3 w-full bg-slate-800" />
                <Skeleton className="h-3 w-full bg-slate-800" />
                <Skeleton className="h-3 w-3/4 bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedMembers.length > 0 ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="rounded-xl border-2 border-slate-700/60 bg-slate-900 flex flex-col items-center justify-center py-16">
          <Users className="h-16 w-16 text-slate-600 mb-4" />
          <h3 className="text-lg font-bold text-slate-300" style={{ fontFamily: "'Orbitron', sans-serif" }}>No Players Found</h3>
          <p className="text-slate-500 text-center max-w-md mb-4 text-sm">
            Add your first team members to start tracking call performance and coaching.
          </p>
          <Button onClick={() => window.location.href = "/settings"} className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white border-0">
            <UserPlus className="h-4 w-4 mr-2" /> Go to Settings
          </Button>
        </div>
      )}

      {/* Team Roles Legend - arcade style */}
      <div className="rounded-xl border-2 border-slate-700/60 bg-slate-900 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-xs text-slate-400 uppercase tracking-wider flex items-center gap-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            <Swords className="h-4 w-4" /> Character Classes
          </h3>
        </div>
        <div className="p-4 grid gap-3 sm:grid-cols-3">
          {[
            { role: "lead_manager", label: "Lead Manager", desc: "Qualifies leads, extracts motivation, discusses price, and sets appointments for walkthroughs.", glow: "from-blue-500 to-cyan-500" },
            { role: "acquisition_manager", label: "Acquisition Manager", desc: "Handles offer calls and closings. Graded on motivation restatement, offer setup, and price delivery.", glow: "from-emerald-500 to-green-500" },
            { role: "lead_generator", label: "Lead Generator", desc: "Makes cold calls to generate interest. Sets up warm handoffs to Lead Managers.", glow: "from-amber-500 to-orange-500" },
          ].map(r => (
            <div key={r.role} className="relative rounded-lg overflow-hidden">
              <div className={`bg-gradient-to-r ${r.glow} p-px`}>
                <div className="bg-slate-900/95 p-3 rounded-lg">
                  <div className={`inline-block text-[10px] px-2 py-0.5 rounded border ${roleBadgeColors[r.role]}`} style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    {r.label}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">{r.desc}</p>
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
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page header - arcade style */}
      <div className="relative">
        <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-foreground flex items-center gap-3" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          TEAM ROSTER
        </h1>
        <p className="text-xs text-muted-foreground mt-1 ml-11 sm:ml-13 hidden sm:block font-mono uppercase tracking-wider">
          Select a character to view stats
        </p>
      </div>

      <Tabs defaultValue="team" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-700/60">
          <TabsTrigger value="team" className="flex items-center gap-2 data-[state=active]:bg-slate-800 data-[state=active]:text-white">
            <Users className="h-4 w-4" />
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "11px" }}>ROSTER</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2 data-[state=active]:bg-slate-800 data-[state=active]:text-white">
            <User className="h-4 w-4" />
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "11px" }}>MY PROFILE</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="team" className="mt-6">
          <TeamMembersContent />
        </TabsContent>
        
        <TabsContent value="profile" className="mt-6">
          <MyProfileContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
