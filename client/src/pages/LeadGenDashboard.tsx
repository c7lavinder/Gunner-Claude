import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  Calendar,
  TrendingUp,
  Award,
  Target,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Upload
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function GradeBadge({ grade }: { grade: string }) {
  const gradeClass = `grade-${grade.toLowerCase()}`;
  return <span className={`grade-badge ${gradeClass}`}>{grade}</span>;
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  trend 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  description?: string;
  trend?: string;
}) {
  return (
    <div className="obs-panel">
      <div className="flex flex-row items-center justify-between space-y-0 pb-2" style={{marginBottom: 16}}>
        <h3 className="obs-section-title text-sm font-medium">{title}</h3>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {trend}
          </p>
        )}
      </div>
    </div>
  );
}

export default function LeadGenDashboard() {
  const { user } = useAuth();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Fetch only this user's calls
  const { data: calls, isLoading: callsLoading, refetch } = trpc.calls.withGrades.useQuery({ limit: 100 });
  const { data: gamificationData } = trpc.gamification.getSummary.useQuery();
  const { data: badgesData } = trpc.gamification.getSummary.useQuery();
  const badges = badgesData?.badges || [];
  
  const uploadMutation = trpc.calls.uploadManual.useMutation({
    onSuccess: () => {
      toast.success("Call uploaded successfully! It will be graded shortly.");
      setUploadDialogOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  // Filter to only show this user's calls (for now show all until we have proper team member linking)
  const myCalls = calls?.items || [];
  const myGradedCalls = myCalls.filter((c: any) => c.status === "completed" && c.classification === "conversation");
  
  // Calculate stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const callsToday = myGradedCalls.filter(c => {
    const callDate = new Date(c.createdAt);
    return callDate >= today;
  }).length;

  const avgScore = myGradedCalls.length > 0
    ? Math.round(
        myGradedCalls.reduce((sum, c) => {
          const score = (c as any).grade?.overallScore ? parseFloat((c as any).grade.overallScore) : 0;
          return sum + score;
        }, 0) / myGradedCalls.length
      )
    : 0;

  // Count interests generated (calls where seller expressed interest - outcome is follow_up or better)
  const interestsGenerated = myGradedCalls.filter(c => {
    const outcome = (c as any).callOutcome;
    return outcome === 'follow_up' || outcome === 'appointment_set';
  }).length;

  const recentCalls = myGradedCalls.slice(0, 5);

  const handleFileUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get('audioFile') as File;
    const contactName = formData.get('contactName') as string;
    const contactPhone = formData.get('contactPhone') as string;

    if (!file || !contactName || !contactPhone) {
      toast.error("Please fill in all fields");
      return;
    }

    setUploading(true);
    
    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      // Extract audio type and data from base64
      const [header, audioData] = base64.split(',');
      const audioType = header.match(/:(.*?);/)?.[1] || 'audio/mpeg';
      const fileName = file.name;
      
      await uploadMutation.mutateAsync({
        audioData,
        audioType,
        fileName,
        contactName,
        contactPhone,
      });
      setUploading(false);
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  if (callsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.name || 'Lead Generator'}!
          </p>
        </div>
        {(user?.role === 'admin' || user?.role === 'super_admin') && (
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Call
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleFileUpload}>
              <DialogHeader>
                <DialogTitle>Upload Call Recording</DialogTitle>
                <DialogDescription>
                  Upload an audio file of your call. Supported formats: MP3, WAV, M4A
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="audioFile">Audio File</Label>
                  <Input
                    id="audioFile"
                    name="audioFile"
                    type="file"
                    accept="audio/*"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    name="contactName"
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    name="contactPhone"
                    placeholder="555-1234"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setUploadDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Calls Today"
          value={callsToday}
          icon={Phone}
          description="Graded calls made today"
        />
        <StatCard
          title="Total Calls"
          value={myGradedCalls.length}
          icon={Target}
          description="All time graded calls"
        />
        <StatCard
          title="Interests Generated"
          value={interestsGenerated}
          icon={Target}
          description="Sellers who expressed interest"
        />
        <StatCard
          title="Average Score"
          value={`${avgScore}%`}
          icon={TrendingUp}
          description="Across all calls"
        />
      </div>

      {/* XP and Badges */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="obs-panel">
          <div style={{marginBottom: 16}}>
            <h3 className="obs-section-title flex items-center gap-2">
              <Award className="h-5 w-5" />
              Your Progress
            </h3>
          </div>
          <div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Level {gamificationData?.xp?.level || 1}</span>
                  <span className="text-sm text-muted-foreground">
                    {gamificationData?.xp?.progress || 0}% to next level
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${gamificationData?.xp?.progress || 0}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold">{gamificationData?.xp?.totalXp || 0} XP</p>
                <p className="text-sm text-muted-foreground">Total experience earned</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{gamificationData?.xp?.title || 'Rookie'}</p>
                <p className="text-sm text-muted-foreground">Current title</p>
              </div>
            </div>
          </div>
        </div>

        <div className="obs-panel">
          <div style={{marginBottom: 16}}>
            <h3 className="obs-section-title flex items-center gap-2">
              <Award className="h-5 w-5" />
              Recent Badges
            </h3>
          </div>
          <div>
            {badges && badges.length > 0 ? (
              <div className="space-y-2">
                {badges.slice(0, 5).map((badge: any) => (
                  <div key={badge.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <div className="text-2xl">{badge.icon}</div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{badge.name}</p>
                      <p className="text-xs text-muted-foreground">{badge.description}</p>
                    </div>
                    <Badge variant="secondary">{badge.tier}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No badges earned yet. Keep making calls!</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Calls */}
      <div className="obs-panel">
        <div style={{marginBottom: 16}}>
          <div className="flex items-center justify-between">
            <h3 className="obs-section-title">Recent Calls</h3>
            <Link href="/calls">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>
          <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>Your most recent graded calls</p>
        </div>
        <div>
          {recentCalls.length > 0 ? (
            <div className="space-y-3">
              {recentCalls.map((call: any) => {
                const timeAgo = formatDistanceToNow(new Date(call.createdAt), { addSuffix: true });
                return (
                  <Link key={call.id} href={`/calls/${call.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="flex-1">
                        <p className="font-semibold">{call.contactName || call.contactPhone}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {timeAgo}
                          {call.duration && (
                            <>
                              <span>•</span>
                              <span>{Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, "0")}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {(call as any).grade?.overallGrade && <GradeBadge grade={(call as any).grade.overallGrade} />}
                        {(call as any).grade?.overallScore && (
                          <span className="text-sm font-medium">{Math.round(parseFloat((call as any).grade.overallScore))}%</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No calls yet. Upload your first call to get started!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
