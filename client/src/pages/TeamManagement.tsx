import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Shield, UserCog, Link2, Unlink, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect } from "wouter";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  acquisition_manager: "Acquisition Manager",
  lead_manager: "Lead Manager",
  lead_generator: "Lead Generator",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  acquisition_manager: "bg-blue-100 text-blue-700",
  lead_manager: "bg-green-100 text-green-700",
  lead_generator: "bg-orange-100 text-orange-700",
};

export default function TeamManagement() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  // Only admin can access this page
  if (user && user.teamRole !== 'admin' && user.isTenantAdmin !== 'true') {
    return <Redirect to="/" />;
  }

  const { data: teamMembers, isLoading: membersLoading } = trpc.team.list.useQuery();
  const { data: users, isLoading: usersLoading } = trpc.team.allUsers.useQuery();
  const { data: assignments, isLoading: assignmentsLoading } = trpc.team.getAssignments.useQuery();

  const updateRoleMutation = trpc.team.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated successfully");
      utils.team.allUsers.invalidate();
    },
    onError: (error) => toast.error("Failed to update role: " + error.message),
  });

  const linkUserMutation = trpc.team.linkUser.useMutation({
    onSuccess: () => {
      toast.success("User linked to team member");
      utils.team.allUsers.invalidate();
      utils.team.list.invalidate();
    },
    onError: (error) => toast.error("Failed to link user: " + error.message),
  });

  // For now, unlinking is done by linking to null - we'll use a simple approach
  const handleUnlink = (userId: number, teamMemberId: number | null) => {
    // For simplicity, we'll just show a toast - full unlink would need a backend endpoint
    toast.info("To unlink, please contact admin");
  };

  const assignManagerMutation = trpc.team.assignToManager.useMutation({
    onSuccess: () => {
      toast.success("Team assignment updated");
      utils.team.getAssignments.invalidate();
    },
    onError: (error) => toast.error("Failed to assign: " + error.message),
  });

  const removeAssignmentMutation = trpc.team.removeAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment removed");
      utils.team.getAssignments.invalidate();
    },
    onError: (error) => toast.error("Failed to remove assignment: " + error.message),
  });

  const batchAwardXpMutation = trpc.gamification.batchAwardXp.useMutation({
    onSuccess: (data) => {
      if (data.processed === 0) {
        toast.info("No new calls to process - all XP already awarded!");
      } else {
        toast.success(`Awarded ${data.totalXpAwarded.toLocaleString()} XP across ${data.processed} calls!`);
        data.memberSummary.forEach(m => {
          toast.info(`${m.name}: +${m.xpAwarded} XP (Level ${m.newLevel} - ${m.newTitle})`);
        });
      }
      utils.gamification.getLeaderboard.invalidate();
      utils.gamification.getSummary.invalidate();
    },
    onError: (error) => toast.error("Failed to award XP: " + error.message),
  });

  const isLoading = membersLoading || usersLoading || assignmentsLoading;

  // Get acquisition managers for assignment dropdown
  const acquisitionManagers = users?.filter(u => u.teamRole === 'acquisition_manager') || [];
  
  // Get lead managers for assignment
  const leadManagers = teamMembers?.filter(tm => {
    const linkedUser = users?.find(u => u.teamMemberId === tm.id);
    return linkedUser?.teamRole === 'lead_manager';
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team Management</h1>
          <p className="text-muted-foreground">Manage user roles and team assignments</p>
        </div>
        <Button 
          onClick={() => batchAwardXpMutation.mutate()}
          disabled={batchAwardXpMutation.isPending}
          className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
        >
          <Zap className="h-4 w-4 mr-2" />
          {batchAwardXpMutation.isPending ? "Awarding XP..." : "Award XP for All Calls"}
        </Button>
      </div>

      {/* Users & Roles Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Users & Roles</CardTitle>
              <CardDescription>Assign roles to users who have logged in</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : users && users.length > 0 ? (
            <div className="space-y-3">
              {users.map((u) => {
                const linkedMember = teamMembers?.find(tm => tm.id === u.teamMemberId);
                return (
                  <div key={u.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <UserCog className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">{u.name || u.email}</div>
                        <div className="text-sm text-muted-foreground">{u.email}</div>
                        {linkedMember && (
                          <div className="text-xs text-blue-600 mt-1">
                            Linked to: {linkedMember.name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Link to Team Member */}
                      {!u.teamMemberId ? (
                        <Select
                          onValueChange={(value) => linkUserMutation.mutate({ userId: u.id, teamMemberId: parseInt(value) })}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Link to team member" />
                          </SelectTrigger>
                          <SelectContent>
                            {teamMembers?.filter(tm => !users.some(usr => usr.teamMemberId === tm.id)).map((tm) => (
                              <SelectItem key={tm.id} value={tm.id.toString()}>
                                {tm.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnlink(u.id, u.teamMemberId)}
                          disabled={false}
                        >
                          <Unlink className="h-4 w-4 mr-1" />
                          Unlink
                        </Button>
                      )}
                      
                      {/* Role Selection */}
                      <Select
                        value={u.teamRole || 'lead_manager'}
                        onValueChange={(value) => updateRoleMutation.mutate({ 
                          userId: u.id, 
                          teamRole: value as 'admin' | 'acquisition_manager' | 'lead_manager'
                        })}
                        disabled={u.id === user?.id} // Can't change own role
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="acquisition_manager">Acquisition Manager</SelectItem>
                          <SelectItem value="lead_manager">Lead Manager</SelectItem>
                          <SelectItem value="lead_generator">Lead Generator</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Badge className={ROLE_COLORS[u.teamRole || 'lead_manager']}>
                        {ROLE_LABELS[u.teamRole || 'lead_manager']}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No users have logged in yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Assignments Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Team Assignments</CardTitle>
              <CardDescription>Assign Lead Managers to Acquisition Managers</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {acquisitionManagers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No Acquisition Managers assigned yet</p>
              <p className="text-sm">Assign the Acquisition Manager role to a user first</p>
            </div>
          ) : (
            <div className="space-y-6">
              {acquisitionManagers.map((am) => {
                const amTeamMember = teamMembers?.find(tm => tm.id === am.teamMemberId);
                const assignedLeadManagers = assignments?.filter(a => a.acquisitionManagerId === am.teamMemberId) || [];
                
                return (
                  <div key={am.id} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-center gap-2 mb-4">
                      <Badge className="bg-blue-100 text-blue-700">Acquisition Manager</Badge>
                      <span className="font-medium">{amTeamMember?.name || am.name || am.email}</span>
                    </div>
                    
                    <div className="ml-4 space-y-2">
                      <div className="text-sm text-muted-foreground mb-2">Lead Managers:</div>
                      
                      {/* Current assignments */}
                      {assignedLeadManagers.map((assignment) => {
                        const lm = teamMembers?.find(tm => tm.id === assignment.leadManagerId);
                        return (
                          <div key={assignment.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                            <span>{lm?.name || 'Unknown'}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAssignmentMutation.mutate({ leadManagerId: assignment.leadManagerId })}
                              disabled={removeAssignmentMutation.isPending}
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                      
                      {/* Add new assignment */}
                      {(() => {
                        const availableLeadManagers = teamMembers?.filter(tm => {
                          // Only show team members who are lead managers and not already assigned
                          const linkedUser = users?.find(u => u.teamMemberId === tm.id);
                          const isLeadManager = linkedUser?.teamRole === 'lead_manager';
                          const notAssigned = !assignedLeadManagers.some(a => a.leadManagerId === tm.id);
                          return isLeadManager && notAssigned;
                        }) || [];
                        
                        if (availableLeadManagers.length === 0) {
                          return (
                            <div className="text-sm text-muted-foreground py-2 px-3 border rounded-md border-dashed">
                              {leadManagers.length === 0 
                                ? "No Lead Managers available - assign the Lead Manager role to users first"
                                : "All Lead Managers have been assigned"}
                            </div>
                          );
                        }
                        
                        return (
                          <Select
                            key={`am-${am.teamMemberId}-${assignedLeadManagers.length}`}
                            value=""
                            onValueChange={(value) => {
                              if (am.teamMemberId && value) {
                                assignManagerMutation.mutate({
                                  leadManagerId: parseInt(value),
                                  acquisitionManagerId: am.teamMemberId,
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="+ Add Lead Manager" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableLeadManagers.map((tm) => (
                                <SelectItem key={tm.id} value={tm.id.toString()}>
                                  {tm.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Members from GHL */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 text-green-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Team Members (from GHL)</CardTitle>
              <CardDescription>Team members synced from GoHighLevel</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : teamMembers && teamMembers.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {teamMembers.map((tm) => {
                const linkedUser = users?.find(u => u.teamMemberId === tm.id);
                return (
                  <div key={tm.id} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                      {tm.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{tm.name}</div>
                      <Badge variant="outline" className="text-xs">
                        {linkedUser ? ROLE_LABELS[linkedUser.teamRole || 'lead_manager'] : ROLE_LABELS[tm.teamRole] || tm.teamRole}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No team members synced from GHL</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
