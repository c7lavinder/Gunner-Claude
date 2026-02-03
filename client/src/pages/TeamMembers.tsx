import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Users, UserPlus, Trophy, Medal, Flame, Zap, Target, 
  TrendingUp, Camera, Upload, Award, Star
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// Tier badge colors
const tierColors: Record<string, string> = {
  bronze: "bg-amber-700 text-amber-100",
  silver: "bg-gray-400 text-gray-900",
  gold: "bg-yellow-500 text-yellow-900",
};

const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  lead_manager: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  acquisition_manager: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  lead_manager: "Lead Manager",
  acquisition_manager: "Acquisition Manager",
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
      // Extract base64 data without the data URL prefix
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
      {/* Header with gradient background */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="relative">
            {rank <= 3 && <RankBadge rank={rank} />}
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <div className={`cursor-pointer ${isCurrentUser ? 'hover:opacity-80' : ''}`}>
                  <Avatar className="h-20 w-20 border-4 border-white shadow-lg">
                    <AvatarImage src={member.user?.profilePicture || undefined} />
                    <AvatarFallback className="text-2xl font-bold bg-white text-orange-700">
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
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-bold">{member.name}</h3>
              {hotStreak > 0 && (
                <span className="text-sm bg-white/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Flame className="h-3 w-3" /> {hotStreak}
                </span>
              )}
            </div>
            <Badge className="bg-white/20 text-white border-0 mt-1">
              {roleLabels[member.teamRole] || member.teamRole}
            </Badge>
            <BadgeDisplay badges={badges} />
          </div>
          
          <div className="text-right">
            <p className="text-3xl font-bold">Lvl {level}</p>
            <p className="text-sm opacity-90">{title}</p>
            <p className="text-xs opacity-75">{xp.toLocaleString()} XP</p>
          </div>
        </div>
      </div>
      
      {/* Stats section */}
      <CardContent className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{totalCalls}</p>
            <p className="text-xs text-muted-foreground">Total Calls</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">
              {avgScore ? `${Math.round(avgScore)}%` : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">Avg Score</p>
          </div>
          <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
            <p className="text-2xl font-bold text-emerald-600">{gradeDistribution.A + gradeDistribution.B}</p>
            <p className="text-xs text-muted-foreground">A & B Grades</p>
          </div>
          <div className="text-center p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">{badges.length}</p>
            <p className="text-xs text-muted-foreground">Badges</p>
          </div>
        </div>
        
        {/* Grade distribution bar */}
        {totalCalls > 0 && (
          <div className="mt-4">
            <div className="flex h-3 rounded-full overflow-hidden">
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
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Grade Distribution</span>
              <div className="flex gap-2">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>A</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500"></span>B</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span>C</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span>D</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>F</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeamMembers() {
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

  // Create maps for quick lookup
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
  
  // Sort team members by XP for ranking
  const sortedMembers = teamMembers?.slice().sort((a, b) => {
    const aXp = gamificationMap.get(a.id)?.xp || 0;
    const bXp = gamificationMap.get(b.id)?.xp || 0;
    return bXp - aXp;
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" /> Team
          </h1>
          <p className="text-muted-foreground mt-1">
            Meet your team and track their achievements
          </p>
        </div>
        {(!teamMembers || teamMembers.length === 0) && (
          <Button 
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Initialize Team
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedMembers.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 mb-2">
                Lead Manager
              </Badge>
              <p className="text-sm text-muted-foreground">
                Handles qualification/diagnosis calls. Graded on Script Mastery, Disqualification Mastery, 
                and Good Appointment Mastery criteria.
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
