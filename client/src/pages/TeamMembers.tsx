import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, UserPlus, Phone, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function TeamMemberCard({ member, stats }: { member: any; stats?: any }) {
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

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg font-bold bg-primary/10">
              {member.name?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold">{member.name}</h3>
            <Badge className={`${roleColors[member.teamRole] || roleColors.lead_manager} mt-1`}>
              {roleLabels[member.teamRole] || member.teamRole}
            </Badge>
          </div>

          <div className="text-right">
            {stats ? (
              <>
                <p className="text-2xl font-bold">
                  {stats.averageScore ? `${Math.round(stats.averageScore)}%` : "N/A"}
                </p>
                <p className="text-sm text-muted-foreground">{stats.totalCalls} calls</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>
        </div>

        {stats && stats.totalCalls > 0 && (
          <div className="mt-4 grid grid-cols-5 gap-2 text-center">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950 rounded">
              <p className="text-lg font-bold text-emerald-600">{stats.gradeDistribution.A}</p>
              <p className="text-xs text-muted-foreground">A</p>
            </div>
            <div className="p-2 bg-teal-50 dark:bg-teal-950 rounded">
              <p className="text-lg font-bold text-teal-600">{stats.gradeDistribution.B}</p>
              <p className="text-xs text-muted-foreground">B</p>
            </div>
            <div className="p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
              <p className="text-lg font-bold text-yellow-600">{stats.gradeDistribution.C}</p>
              <p className="text-xs text-muted-foreground">C</p>
            </div>
            <div className="p-2 bg-orange-50 dark:bg-orange-950 rounded">
              <p className="text-lg font-bold text-orange-600">{stats.gradeDistribution.D}</p>
              <p className="text-xs text-muted-foreground">D</p>
            </div>
            <div className="p-2 bg-red-50 dark:bg-red-950 rounded">
              <p className="text-lg font-bold text-red-600">{stats.gradeDistribution.F}</p>
              <p className="text-xs text-muted-foreground">F</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeamMembers() {
  const { data: teamMembers, isLoading: membersLoading, refetch } = trpc.team.list.useQuery();
  const { data: leaderboard, isLoading: leaderboardLoading } = trpc.leaderboard.get.useQuery();
  
  const seedMutation = trpc.team.seed.useMutation({
    onSuccess: () => {
      toast.success("Team members seeded successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to seed team: ${error.message}`);
    },
  });

  const isLoading = membersLoading || leaderboardLoading;

  // Create a map of team member stats from leaderboard
  const statsMap = new Map();
  if (leaderboard) {
    leaderboard.forEach((entry) => {
      statsMap.set(entry.teamMember.id, {
        totalCalls: entry.totalCalls,
        averageScore: entry.averageScore,
        gradeDistribution: entry.gradeDistribution,
      });
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team and view individual performance
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : teamMembers && teamMembers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <TeamMemberCard 
              key={member.id} 
              member={member} 
              stats={statsMap.get(member.id)}
            />
          ))}
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
          <CardTitle className="text-sm">Team Roles</CardTitle>
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
