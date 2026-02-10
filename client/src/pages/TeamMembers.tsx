import { useState, useRef } from "react";
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
  TrendingUp, Camera, Upload, Award, Star, Lock, CheckCircle, User
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// Tier badge colors for team display
const tierColors: Record<string, string> = {
  bronze: "bg-amber-700 text-amber-100",
  silver: "bg-gray-400 text-gray-900",
  gold: "bg-yellow-500 text-yellow-900",
};

// Tier badge colors for profile display
const profileTierColors: Record<string, { bg: string; border: string; text: string }> = {
  bronze: { bg: "bg-amber-100", border: "border-amber-700", text: "text-amber-800" },
  silver: { bg: "bg-gray-100", border: "border-gray-400", text: "text-gray-700" },
  gold: { bg: "bg-yellow-100", border: "border-yellow-500", text: "text-yellow-800" },
};

const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  lead_manager: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  acquisition_manager: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  lead_generator: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  lead_manager: "Lead Manager",
  acquisition_manager: "Acquisition Manager",
  lead_generator: "Lead Generator",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg z-10">
        <Trophy className="h-4 w-4 text-white" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-lg z-10">
        <Medal className="h-4 w-4 text-white" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center shadow-lg z-10">
        <Medal className="h-4 w-4 text-white" />
      </div>
    );
  }
  return null;
}

function BadgeDisplay({ badges }: { badges: Array<{ code: string; name: string; icon: string; tier: string }> }) {
  if (!badges || badges.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {badges.slice(0, 6).map((badge, i) => (
        <span 
          key={i} 
          className={`text-sm px-1.5 py-0.5 rounded ${tierColors[badge.tier] || "bg-gray-200"}`}
          title={`${badge.name} (${badge.tier})`}
        >
          {badge.icon}
        </span>
      ))}
      {badges.length > 6 && (
        <span className="text-xs text-muted-foreground self-center">+{badges.length - 6}</span>
      )}
    </div>
  );
}

function ProfilePictureUpload({ currentPicture, onUpload }: { currentPicture?: string | null; onUpload: (base64: string, mimeType: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }
    
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
          <AvatarFallback className="text-4xl">
            <Camera className="h-12 w-12 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        <Button 
          size="icon" 
          variant="secondary" 
          className="absolute bottom-0 right-0 rounded-full"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <p className="text-sm text-muted-foreground">Click to upload a profile picture</p>
    </div>
  );
}

function TeamMemberShowcase({ 
  member, 
  gamificationData, 
  scoreData, 
  rank,
  isCurrentUser,
  onUploadPicture
}: { 
  member: any; 
  gamificationData?: any;
  scoreData?: any;
  rank: number;
  isCurrentUser: boolean;
  onUploadPicture?: (base64: string, mimeType: string) => void;
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
  
  return (
    <Card className={`overflow-hidden ${rank <= 3 ? "ring-2" : ""} ${
      rank === 1 ? "ring-yellow-400" : 
      rank === 2 ? "ring-gray-400" : 
      rank === 3 ? "ring-amber-600" : ""
    }`}>
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-3 sm:p-6 text-white">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="relative shrink-0">
            {rank <= 3 && <RankBadge rank={rank} />}
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <div className={`cursor-pointer ${isCurrentUser ? 'hover:opacity-80' : ''}`}>
                  <Avatar className="h-14 w-14 sm:h-20 sm:w-20 border-2 sm:border-4 border-white shadow-lg">
                    <AvatarImage src={member.user?.profilePicture || undefined} />
                    <AvatarFallback className="text-xl sm:text-2xl font-bold bg-white text-orange-700">
                      {member.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {isCurrentUser && (
                    <div className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow">
                      <Camera className="h-3 w-3 text-orange-700" />
                    </div>
                  )}
                </div>
              </DialogTrigger>
              {isCurrentUser && onUploadPicture && (
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Profile Picture</DialogTitle>
                    <DialogDescription>
                      Upload a new profile picture. Images should be less than 5MB.
                    </DialogDescription>
                  </DialogHeader>
                  <ProfilePictureUpload 
                    currentPicture={member.user?.profilePicture}
                    onUpload={(base64, mimeType) => {
                      onUploadPicture(base64, mimeType);
                      setUploadDialogOpen(false);
                    }}
                  />
                </DialogContent>
              )}
            </Dialog>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
         <h3 className="text-lg sm:text-2xl font-bold">{member.name}</h3>           {hotStreak > 0 && (
                <span className="text-xs sm:text-sm bg-white/20 px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Flame className="h-3 w-3" /> {hotStreak}
                </span>
              )}
            </div>
            <Badge className="bg-white/20 text-white border-0 mt-1 text-xs">
              {roleLabels[member.teamRole] || member.teamRole}
            </Badge>
            <div className="hidden sm:block">
              <BadgeDisplay badges={badges} />
            </div>
          </div>
          
          <div className="text-right shrink-0">
            <p className="text-xl sm:text-3xl font-bold">Lvl {level}</p>
            <p className="text-xs sm:text-sm opacity-90 hidden sm:block">{title}</p>
            <p className="text-[10px] sm:text-xs opacity-75">{xp.toLocaleString()} XP</p>
          </div>
        </div>
      </div>
      
      <CardContent className="p-3 sm:p-6">
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          <div className="text-center p-2 sm:p-3 bg-muted/50 rounded-lg">
            <p className="text-lg sm:text-2xl font-bold">{totalCalls}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Calls</p>
          </div>
          <div className="text-center p-2 sm:p-3 bg-muted/50 rounded-lg">
            <p className="text-lg sm:text-2xl font-bold">
              {avgScore ? `${Math.round(avgScore)}%` : "N/A"}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Score</p>
          </div>
          <div className="text-center p-2 sm:p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
            <p className="text-lg sm:text-2xl font-bold text-emerald-600">{gradeDistribution.A + gradeDistribution.B}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">A&B</p>
          </div>
          <div className="text-center p-2 sm:p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
            <p className="text-lg sm:text-2xl font-bold text-orange-600">{badges.length}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Badges</p>
          </div>
        </div>
        
        {totalCalls > 0 && (
          <div className="mt-3 sm:mt-4">
            <div className="flex h-2 sm:h-3 rounded-full overflow-hidden">
              {gradeDistribution.A > 0 && (
                <div 
                  className="bg-emerald-500" 
                  style={{ width: `${(gradeDistribution.A / totalCalls) * 100}%` }}
                  title={`A: ${gradeDistribution.A}`}
                />
              )}
              {gradeDistribution.B > 0 && (
                <div 
                  className="bg-teal-500" 
                  style={{ width: `${(gradeDistribution.B / totalCalls) * 100}%` }}
                  title={`B: ${gradeDistribution.B}`}
                />
              )}
              {gradeDistribution.C > 0 && (
                <div 
                  className="bg-yellow-500" 
                  style={{ width: `${(gradeDistribution.C / totalCalls) * 100}%` }}
                  title={`C: ${gradeDistribution.C}`}
                />
              )}
              {gradeDistribution.D > 0 && (
                <div 
                  className="bg-orange-500" 
                  style={{ width: `${(gradeDistribution.D / totalCalls) * 100}%` }}
                  title={`D: ${gradeDistribution.D}`}
                />
              )}
              {gradeDistribution.F > 0 && (
                <div 
                  className="bg-red-500" 
                  style={{ width: `${(gradeDistribution.F / totalCalls) * 100}%` }}
                  title={`F: ${gradeDistribution.F}`}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[10px] sm:text-xs text-muted-foreground">
              <span className="hidden sm:inline">Grade Distribution</span>
              <div className="flex gap-1 sm:gap-2">
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500"></span>A</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-teal-500"></span>B</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-yellow-500"></span>C</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-orange-500"></span>D</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-500"></span>F</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Profile Badge Card Component
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

function ProfileBadgeCard({ badge }: { badge: BadgeData }) {
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
  const tierStyle = highestEarnedTier ? profileTierColors[highestEarnedTier] : profileTierColors.bronze;
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
            
            {nextTargetTier && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress to {nextTargetTier}</span>
                  <span>{badge.currentProgress} / {nextTarget}</span>
                </div>
                <Progress value={progressPercent} className="h-1.5" />
              </div>
            )}
            
            {isEarned && (
              <div className="flex gap-1 mt-2">
                {tiers.map(tier => (
                  badge.tiers[tier].earned && (
                    <span 
                      key={tier}
                      className={`text-xs px-2 py-0.5 rounded-full ${profileTierColors[tier].bg} ${profileTierColors[tier].text} border ${profileTierColors[tier].border}`}
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

// My Profile Tab Content
function MyProfileContent() {
  const { data: gamification, isLoading: gamificationLoading } = trpc.gamification.getSummary.useQuery();
  const { data: allBadges, isLoading: badgesLoading } = trpc.gamification.getAllBadges.useQuery();

  const earnedBadges = allBadges?.filter((b: BadgeData) => 
    b.tiers.bronze.earned || b.tiers.silver.earned || b.tiers.gold.earned
  ) || [];
  const inProgressBadges = allBadges?.filter((b: BadgeData) => 
    !b.tiers.bronze.earned && !b.tiers.silver.earned && !b.tiers.gold.earned
  ) || [];

  return (
    <div className="space-y-6">
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
                <ProfileBadgeCard key={badge.code} badge={badge} />
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
                <ProfileBadgeCard key={badge.code} badge={badge} />
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

// Team Members Tab Content
function TeamMembersContent() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  const { data: teamMembers, isLoading: membersLoading, refetch } = trpc.team.list.useQuery();
  const { data: scoreLeaderboard, isLoading: scoreLoading } = trpc.leaderboard.get.useQuery();
  const { data: gamificationLeaderboard, isLoading: gamificationLoading } = trpc.gamification.getLeaderboard.useQuery();
  
  const uploadPictureMutation = trpc.auth.updateProfilePicture.useMutation({
    onSuccess: () => {
      toast.success("Profile picture updated!");
      utils.team.list.invalidate();
      utils.auth.me.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to upload: ${error.message}`);
    },
  });
  
  const seedMutation = trpc.team.seed.useMutation({
    onSuccess: () => {
      toast.success("Team members seeded successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to seed team: ${error.message}`);
    },
  });

  const isLoading = membersLoading || scoreLoading || gamificationLoading;

  const scoreMap = new Map();
  if (scoreLeaderboard) {
    scoreLeaderboard.forEach((entry) => {
      scoreMap.set(entry.teamMember.id, {
        totalCalls: entry.totalCalls,
        averageScore: entry.averageScore,
        gradeDistribution: entry.gradeDistribution,
      });
    });
  }
  
  const gamificationMap = new Map();
  if (gamificationLeaderboard) {
    gamificationLeaderboard.forEach((entry: any) => {
      gamificationMap.set(entry.teamMemberId, {
        xp: entry.totalXp,
        level: entry.level,
        title: entry.title,
        hotStreak: entry.hotStreak,
        badges: entry.topBadges,
      });
    });
  }
  
  const sortedMembers = teamMembers?.slice().sort((a, b) => {
    const aXp = gamificationMap.get(a.id)?.xp || 0;
    const bXp = gamificationMap.get(b.id)?.xp || 0;
    return bXp - aXp;
  }) || [];

  return (
    <div className="space-y-6">
      {(!teamMembers || teamMembers.length === 0) && (
        <div className="flex justify-end">
          <Button 
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Initialize Team
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedMembers.length > 0 ? (
        <div className="grid gap-3 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {sortedMembers.map((member, index) => {
            const isCurrentUser = member.userId === user?.id;
            return (
              <TeamMemberShowcase
                key={member.id}
                member={member}
                gamificationData={gamificationMap.get(member.id)}
                scoreData={scoreMap.get(member.id)}
                rank={index + 1}
                isCurrentUser={isCurrentUser}
                onUploadPicture={isCurrentUser ? (base64, mimeType) => {
                  uploadPictureMutation.mutate({ imageBase64: base64, mimeType });
                } : undefined}
              />
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No team members</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Click the button below to initialize your team with Chris, Daniel, and Kyle.
            </p>
            <Button 
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Initialize Team
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Team Roles Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" /> Team Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 mb-2">
                Lead Manager
              </Badge>
              <p className="text-sm text-muted-foreground">
                Qualifies leads, extracts motivation, discusses price, and sets appointments for walkthroughs. 
                Graded on Introduction & Rapport, Motivation Extraction, Price Discussion, and Call Outcome.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 mb-2">
                Acquisition Manager
              </Badge>
              <p className="text-sm text-muted-foreground">
                Handles offer calls and closings. Graded on Offer Call criteria including 
                motivation restatement, offer setup, and price delivery.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 mb-2">
                Lead Generator
              </Badge>
              <p className="text-sm text-muted-foreground">
                Makes cold calls to generate interest in selling — does NOT set appointments. Sets up warm handoffs to Lead Managers. 
                Graded on Introduction & Permission, Interest Discovery, Building Rapport, Objection Handling, and Warm Transfer / Handoff Setup.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TeamMembers() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 sm:h-8 sm:w-8" /> Team
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">
          Meet your team and track achievements
        </p>
      </div>

      <Tabs defaultValue="team" className="w-full mt-10">
        <TabsList>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            My Profile
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
