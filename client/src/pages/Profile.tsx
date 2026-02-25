import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Award, Trophy, Flame, Target, Zap, Lock, CheckCircle, Camera, Loader2, KeyRound, User, Mail, Eye, EyeOff, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { BADGE_ICON_URLS } from "../../../shared/badgeIcons";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";


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
    <div className={`obs-panel relative overflow-hidden transition-all ${
      isEarned 
        ? `${tierStyle.bg} ${tierStyle.border} border-2` 
        : "bg-muted/30 border-dashed opacity-70"
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`${!isEarned && "grayscale opacity-50"}`}>
            {BADGE_ICON_URLS[badge.code] ? (
              <img src={BADGE_ICON_URLS[badge.code]} alt={badge.name} className="rounded-full object-cover" style={{width: 40, height: 40}} />
            ) : <span className="text-3xl">{badge.icon}</span>}
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
      </div>
    </div>
  );
}

function AccountSettings() {
  const { user, refresh } = useAuth();
  const { data: accountInfo, isLoading: accountLoading } = trpc.auth.getAccountInfo.useQuery();
  const changePasswordMutation = trpc.auth.changePassword.useMutation();
  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  useEffect(() => {
    if (accountInfo) {
      setEditName(accountInfo.name || '');
      setEditEmail(accountInfo.email || '');
    }
  }, [accountInfo]);
  
  const isGoogleUser = accountInfo?.loginMethod === 'google';
  
  const handleUpdateProfile = async () => {
    try {
      const updates: { name?: string; email?: string } = {};
      if (editName !== accountInfo?.name) updates.name = editName;
      if (editEmail !== accountInfo?.email) updates.email = editEmail;
      
      if (Object.keys(updates).length === 0) {
        setIsEditingProfile(false);
        return;
      }
      
      await updateProfileMutation.mutateAsync(updates);
      toast.success('Profile updated successfully');
      setIsEditingProfile(false);
      refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    }
  };
  
  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
      });
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
    }
  };
  
  if (accountLoading) {
    return (
      <div className="obs-panel">
        <div className="p-6">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <div className="obs-panel">
        <div style={{marginBottom: 16}}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="obs-section-title flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </h3>
              <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Update your name and email address</p>
            </div>
            {!isEditingProfile && (
              <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)}>
                Edit
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              {isEditingProfile ? (
                <Input
                  id="name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your name"
                />
              ) : (
                <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">{accountInfo?.name || '—'}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              {isEditingProfile ? (
                <Input
                  id="email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm py-2 px-3 bg-muted/50 rounded-md flex-1">{accountInfo?.email || '—'}</p>
                  {accountInfo?.emailVerified && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Verified
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <Mail className="h-3 w-3 inline mr-1" />
            Sign-in method: {isGoogleUser ? 'Google' : 'Email & Password'}
          </div>
          {isEditingProfile && (
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleUpdateProfile}
                disabled={updateProfileMutation.isPending}
                size="sm"
              >
                {updateProfileMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditingProfile(false);
                  setEditName(accountInfo?.name || '');
                  setEditEmail(accountInfo?.email || '');
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Change Password - only for email/password users */}
      {!isGoogleUser && (
        <div className="obs-panel">
          <div style={{marginBottom: 16}}>
            <h3 className="obs-section-title flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Change Password
            </h3>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Update your password to keep your account secure</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </div>
            </div>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}
            <Button
              onClick={handleChangePassword}
              disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              size="sm"
            >
              {changePasswordMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Changing...</>
              ) : 'Change Password'}
            </Button>
          </div>
        </div>
      )}
      
      {/* Google users see a note */}
      {isGoogleUser && (
        <div className="obs-panel bg-muted/30">
          <div className="flex items-center gap-3 py-4">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Password managed by Google</p>
              <p className="text-xs text-muted-foreground">You signed in with Google. To change your password, visit your Google account settings.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const { data: gamification, isLoading: gamificationLoading } = trpc.gamification.getSummary.useQuery();
  const { data: allBadges, isLoading: badgesLoading } = trpc.gamification.getAllBadges.useQuery();
  const uploadMutation = trpc.auth.updateProfilePicture.useMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'achievements' | 'account'>('achievements');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        await uploadMutation.mutateAsync({
          imageBase64: base64,
          mimeType: file.type,
        });
        toast.success('Profile picture updated!');
        refresh(); // Refresh user data to show new picture
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('Failed to upload profile picture');
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Separate earned and in-progress badges
  const earnedBadges = allBadges?.filter((b: BadgeData) => 
    b.tiers.bronze.earned || b.tiers.silver.earned || b.tiers.gold.earned
  ) || [];
  const inProgressBadges = allBadges?.filter((b: BadgeData) => 
    !b.tiers.bronze.earned && !b.tiers.silver.earned && !b.tiers.gold.earned
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tighter">My Profile</h1>
          <p className="text-muted-foreground mt-1">
            {activeTab === 'achievements' ? 'Track your progress, achievements, and badges' : 'Manage your account settings and security'}
          </p>
        </div>
        
        {/* Profile Picture Upload */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative group">
            <Avatar className="h-24 w-24 border-2">
              {user?.profilePicture && (
                <AvatarImage src={user.profilePicture} alt={user?.name || 'Profile'} />
              )}
              <AvatarFallback className="text-2xl font-medium bg-primary/10">
                {user?.name?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <Camera className="h-6 w-6 text-white" />
              )}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
            ) : (
              <><Camera className="h-4 w-4 mr-2" /> Change Photo</>
            )}
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="obs-role-tabs">
        <button
          onClick={() => setActiveTab('achievements')}
          className={`obs-role-tab ${activeTab === 'achievements' ? 'active' : ''}`}
        >
          <Trophy className="h-4 w-4 mr-2" />
          Achievements
        </button>
        <button
          onClick={() => setActiveTab('account')}
          className={`obs-role-tab ${activeTab === 'account' ? 'active' : ''}`}
        >
          <Settings className="h-4 w-4 mr-2" />
          Account Settings
        </button>
      </div>

      {activeTab === 'account' ? (
        <AccountSettings />
      ) : (
      <>
      {/* XP & Level Card */}
      <div className="obs-panel bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200">
        <div style={{marginBottom: 16}}>
          <h3 className="obs-section-title flex items-center gap-2 text-orange-800">
            <Trophy className="h-5 w-5" />
            Level & Experience
          </h3>
        </div>
        <div>
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
        </div>
      </div>

      {/* Streaks */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="obs-panel bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
          <div className="pb-2" style={{marginBottom: 16}}>
            <h3 className="obs-section-title flex items-center gap-2 text-red-800 text-lg">
              <Flame className="h-5 w-5" />
              Hot Streak
            </h3>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Consecutive C+ or better grades</p>
          </div>
          <div>
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
          </div>
        </div>

        <div className="obs-panel bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <div className="pb-2" style={{marginBottom: 16}}>
            <h3 className="obs-section-title flex items-center gap-2 text-blue-800 text-lg">
              <Target className="h-5 w-5" />
              Consistency Streak
            </h3>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Days with at least one graded call</p>
          </div>
          <div>
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
          </div>
        </div>
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
                <div className="obs-panel" key={i}>
                  <div className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : earnedBadges.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {earnedBadges.map((badge: BadgeData) => (
                <BadgeCard key={badge.code} badge={badge} />
              ))}
            </div>
          ) : (
            <div className="obs-panel bg-muted/30">
              <div className="flex flex-col items-center justify-center py-8">
                <Award className="h-12 w-12 text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No badges earned yet. Keep grinding!</p>
              </div>
            </div>
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
                <div className="obs-panel" key={i}>
                  <div className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : inProgressBadges.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {inProgressBadges.map((badge: BadgeData) => (
                <BadgeCard key={badge.code} badge={badge} />
              ))}
            </div>
          ) : earnedBadges.length === allBadges?.length ? (
            <div className="obs-panel bg-muted/30">
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500/50 mb-2" />
                <p className="text-muted-foreground">All badges earned! You're a legend!</p>
              </div>
            </div>
          ) : (
            <div className="obs-panel bg-muted/30">
              <div className="flex flex-col items-center justify-center py-8">
                <Zap className="h-12 w-12 text-orange-500/50 mb-2" />
                <p className="text-muted-foreground">Start making calls to unlock badges!</p>
              </div>
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
