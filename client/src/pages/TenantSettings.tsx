import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Building2, 
  CreditCard, 
  Users, 
  Link2, 
  FileText, 
  Plus,
  Edit,
  ExternalLink,
  RefreshCw,
  Trash2,
  UserMinus,
  Clock,
  X,
  AlertCircle,
  ArrowUp,
  Check,
  Sparkles,
  UserCog,
  Shield,
  Unlink,
  Zap,
  Eye,
  LogOut,
  Award,
  Cloud,
  Loader2,
  Phone,
  Home,
  TestTube,
  Webhook,
  Copy
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatRelativeTime } from "@/lib/timeUtils";

export default function TenantSettings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("general");
  const [companyName, setCompanyName] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [crmType, setCrmType] = useState<string>("none");
  // CRM integration state
  const [ghlApiKey, setGhlApiKey] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [bdApiKey, setBdApiKey] = useState("");
  const [blApiKey, setBlApiKey] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [inviteTeamRole, setInviteTeamRole] = useState<'admin' | 'acquisition_manager' | 'lead_manager' | 'lead_generator'>('lead_manager');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'growth' | 'scale'>('growth');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [editingMember, setEditingMember] = useState<{ id: number; name: string; teamRole: string | null; role: string } | null>(null);
  // Advanced config state
  const [industry, setIndustry] = useState("");
  const [engineWebhookUrl, setEngineWebhookUrl] = useState("");
  const [activeStages, setActiveStages] = useState("");
  const [followUpStages, setFollowUpStages] = useState("");
  const [deadStages, setDeadStages] = useState("");

  // Fetch tenant settings
  const { data: settings, isLoading: settingsLoading, refetch: refetchSettings } = trpc.tenant.getSettings.useQuery(
    undefined,
    { enabled: !!user?.tenantId }
  );

  // Fetch team members
  const { data: teamMembers, isLoading: teamLoading, refetch: refetchTeam } = trpc.tenant.getUsers.useQuery(
    undefined,
    { enabled: !!user?.tenantId }
  );

  // Fetch pending invitations
  const { data: pendingInvitations, isLoading: invitationsLoading, refetch: refetchInvitations } = trpc.tenant.getPendingInvitations.useQuery(
    undefined,
    { enabled: !!user?.tenantId && (user?.role === 'admin' || user?.role === 'super_admin') }
  );

  // Fetch subscription status
  const { data: subscriptionStatus, refetch: refetchSubscription } = trpc.tenant.getSubscriptionStatus.useQuery(
    undefined,
    { enabled: !!user?.tenantId }
  );

  // Fetch subscription plans from database
  const { data: dbPlans } = trpc.tenant.getPlans.useQuery();

  // Fetch CRM integration status
  const { data: crmIntegrations, refetch: refetchCrmIntegrations } = trpc.tenant.getCrmIntegrations.useQuery(
    undefined,
    { enabled: !!user?.tenantId }
  );

  // Update settings mutation
  const updateSettingsMutation = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully");
      refetchSettings();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save settings");
    },
  });

  // Invite user mutation
  const inviteUserMutation = trpc.tenant.inviteUser.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || "User invited successfully");
        setInviteEmail("");
        refetchTeam();
      } else {
        toast.error(data.error || "Failed to invite user");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to invite user");
    },
  });

  // Remove user mutation
  const removeUserMutation = trpc.tenant.removeUser.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || "User removed successfully");
        refetchTeam();
      } else {
        toast.error(data.error || "Failed to remove user");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove user");
    },
  });

  // Update user role mutation
  const updateUserRoleMutation = trpc.tenant.updateUserRole.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || "User role updated");
        refetchTeam();
      } else {
        toast.error(data.error || "Failed to update role");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  // Revoke invitation mutation
  const revokeInvitationMutation = trpc.tenant.revokeInvitation.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || "Invitation revoked");
        refetchInvitations();
      } else {
        toast.error(data.error || "Failed to revoke invitation");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to revoke invitation");
    },
  });

  // Billing portal mutation
  const billingPortalMutation = trpc.tenant.getBillingPortal.useMutation({
    onSuccess: (data) => {
      if (data.success && data.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error(data.error || "Failed to open billing portal");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to open billing portal");
    },
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = trpc.tenant.cancelSubscription.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || "Subscription canceled");
        refetchSubscription();
        refetchSettings();
      } else {
        toast.error(data.error || "Failed to cancel subscription");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel subscription");
    },
  });

  // Upgrade plan mutation (for trial users - creates new checkout)
  const upgradePlanMutation = trpc.tenant.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Redirecting to checkout...");
        window.open(data.url, '_blank');
        setShowUpgradeModal(false);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create checkout session");
    },
  });

  // Change subscription mutation (for existing subscribers - updates plan directly)
  const changeSubscriptionMutation = trpc.tenant.changeSubscription.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || "Plan changed successfully!");
        setShowUpgradeModal(false);
        refetchSettings();
        refetchSubscription();
      } else {
        toast.error(data.error || "Failed to change plan");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to change subscription");
    },
  });

  // Reactivate subscription mutation
  const reactivateSubscriptionMutation = trpc.tenant.reactivateSubscription.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || "Subscription reactivated");
        refetchSubscription();
        refetchSettings();
      } else {
        toast.error(data.error || "Failed to reactivate subscription");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reactivate subscription");
    },
  });

  // Team Management queries
  const { data: ghlTeamMembers, isLoading: ghlTeamLoading } = trpc.team.list.useQuery();
  const { data: allUsers, isLoading: allUsersLoading, refetch: refetchAllUsers } = trpc.team.allUsers.useQuery();
  const { data: teamAssignments, isLoading: assignmentsLoading, refetch: refetchAssignments } = trpc.team.getAssignments.useQuery();

  // Team Management mutations
  const updateTeamRoleMutation = trpc.team.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated successfully");
      refetchAllUsers();
    },
    onError: (error) => toast.error("Failed to update role: " + error.message),
  });

  const linkUserMutation = trpc.team.linkUser.useMutation({
    onSuccess: () => {
      toast.success("User linked to team member");
      refetchAllUsers();
      refetchTeam();
    },
    onError: (error) => toast.error("Failed to link user: " + error.message),
  });

  const assignManagerMutation = trpc.team.assignToManager.useMutation({
    onSuccess: () => {
      toast.success("Team assignment updated");
      refetchAssignments();
    },
    onError: (error) => toast.error("Failed to assign: " + error.message),
  });

  const removeAssignmentMutation = trpc.team.removeAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment removed");
      refetchAssignments();
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
    },
    onError: (error) => toast.error("Failed to award XP: " + error.message),
  });

  const batchEvaluateBadgesMutation = trpc.gamification.batchEvaluateBadges.useMutation({
    onSuccess: (data) => {
      if (data.badgesAwarded === 0) {
        toast.info("No new badges to award - all badges already evaluated!");
      } else {
        toast.success(`Awarded ${data.badgesAwarded} badges across ${data.processed} calls!`);
        data.memberSummary.forEach(m => {
          toast.info(`${m.name}: ${m.badgesEarned.join(", ")}`);
        });
      }
    },
    onError: (error) => toast.error("Failed to evaluate badges: " + error.message),
  });

  // Team Management helper data
  const acquisitionManagers = allUsers?.filter(u => u.teamRole === 'acquisition_manager') || [];
  const leadManagers = ghlTeamMembers?.filter(tm => {
    const linkedUser = allUsers?.find(u => u.teamMemberId === tm.id);
    return linkedUser?.teamRole === 'lead_manager';
  }) || [];
  const leadGenerators = ghlTeamMembers?.filter(tm => {
    const linkedUser = allUsers?.find(u => u.teamMemberId === tm.id);
    return linkedUser?.teamRole === 'lead_generator';
  }) || [];

  // Initialize form values when settings load
  useEffect(() => {
    if (settings) {
      setCompanyName(settings.name || "");
      setCustomDomain(settings.domain || "");
      setCrmType(settings.crmType || "none");
    }
  }, [settings]);

  // Initialize advanced config from CRM integrations
  useEffect(() => {
    if (crmIntegrations) {
      setIndustry(crmIntegrations.industry || "");
      setEngineWebhookUrl(crmIntegrations.engineWebhookUrl || "");
      const sc = crmIntegrations.stageClassification;
      if (sc) {
        setActiveStages((sc.activeStages || []).join(", "));
        setFollowUpStages((sc.followUpStages || []).join(", "));
        setDeadStages((sc.deadStages || []).join(", "));
      }
    }
  }, [crmIntegrations]);

  const handleSaveGeneral = () => {
    updateSettingsMutation.mutate({
      name: companyName,
      domain: customDomain || undefined,
    });
  };

  const handleSaveCrm = () => {
    updateSettingsMutation.mutate({
      crmType: crmType as 'ghl' | 'hubspot' | 'salesforce' | 'close' | 'pipedrive' | 'none',
    });
  };

  // CRM integration mutations
  const testGhlMutation = trpc.tenant.testGhlConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message || "GHL connected!");
      } else {
        toast.error(result.error || "Connection failed");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const testBdMutation = trpc.tenant.testBatchDialerConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message || "BatchDialer connected!");
      } else {
        toast.error(result.error || "Connection failed");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const testBlMutation = trpc.tenant.testBatchLeadsConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message || "BatchLeads connected!");
      } else {
        toast.error(result.error || "Connection failed");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const saveCrmIntegrationMutation = trpc.tenant.saveCrmIntegration.useMutation({
    onSuccess: () => {
      toast.success("Integration saved!");
      refetchSettings();
      refetchCrmIntegrations();
    },
    onError: (error) => toast.error(error.message || "Failed to save"),
  });

  const syncBdMutation = trpc.calls.syncBatchDialer.useMutation({
    onSuccess: (stats) => {
      if (stats.imported === 0 && stats.skipped === 0 && stats.errors === 0) {
        toast.info("No new calls found from BatchDialer");
      } else {
        toast.success(`BatchDialer sync: ${stats.imported} imported, ${stats.skipped} skipped`);
      }
    },
    onError: (error) => toast.error(`Sync failed: ${error.message}`),
  });

  // Advanced config mutation
  const updateAdvancedConfigMutation = trpc.tenant.updateAdvancedConfig.useMutation({
    onSuccess: () => {
      toast.success("Advanced configuration saved");
      refetchCrmIntegrations();
    },
    onError: (error) => toast.error(error.message || "Failed to save configuration"),
  });

  const handleSaveAdvancedConfig = () => {
    const parseCommaSeparated = (val: string) => val.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    updateAdvancedConfigMutation.mutate({
      industry: industry || undefined,
      engineWebhookUrl: engineWebhookUrl || undefined,
      stageClassification: {
        activeStages: parseCommaSeparated(activeStages),
        followUpStages: parseCommaSeparated(followUpStages),
        deadStages: parseCommaSeparated(deadStages),
      },
    });
  };

  const syncBlMutation = trpc.tenant.syncBatchLeads.useMutation({
    onSuccess: (stats) => {
      if (stats.enriched === 0 && stats.skipped === 0 && stats.errors === 0) {
        toast.info("No calls to enrich from BatchLeads");
      } else {
        toast.success(`BatchLeads: ${stats.enriched} calls enriched, ${stats.skipped} skipped`);
      }
    },
    onError: (error) => toast.error(`Sync failed: ${error.message}`),
  });

  const handleInviteTeamMember = () => {
    if (!inviteEmail) {
      toast.error("Please enter an email address");
      return;
    }
    inviteUserMutation.mutate({
      email: inviteEmail,
      role: inviteRole,
      teamRole: inviteTeamRole,
    });
  };

  const handleRevokeInvitation = (invitationId: number, email: string) => {
    if (confirm(`Are you sure you want to revoke the invitation for ${email}?`)) {
      revokeInvitationMutation.mutate({ invitationId });
    }
  };

  const handleRemoveUser = (userId: number, userName: string) => {
    if (confirm(`Are you sure you want to remove ${userName} from the organization?`)) {
      removeUserMutation.mutate({ userId });
    }
  };

  const handleManageBilling = () => {
    billingPortalMutation.mutate();
  };

  const handleCancelSubscription = () => {
    if (confirm("Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period.")) {
      cancelSubscriptionMutation.mutate();
    }
  };

  const handleReactivateSubscription = () => {
    reactivateSubscriptionMutation.mutate();
  };

  const getPlanPrice = (planCode: string | null) => {
    if (planCode === 'trial') return 'Free trial';
    const plan = dbPlans?.find((p: any) => p.code === planCode);
    if (plan) {
      const price = Math.round((plan.priceMonthly || 0) / 100);
      return `$${price}/month`;
    }
    return 'N/A';
  };

  const getPlanLimits = (planCode: string | null): { users: number, calls: number, usersDisplay: string, callsDisplay: string } => {
    if (planCode === 'trial') return { users: 3, calls: 50, usersDisplay: '3', callsDisplay: '50' };
    const plan = dbPlans?.find((p: any) => p.code === planCode);
    if (plan) {
      const maxUsers = plan.maxUsers || 0;
      const maxCalls = plan.maxCallsPerMonth || 0;
      return {
        users: maxUsers,
        calls: maxCalls,
        usersDisplay: maxUsers >= 999 ? 'Unlimited' : String(maxUsers),
        callsDisplay: maxCalls < 0 || maxCalls >= 999999 ? 'Unlimited' : String(maxCalls)
      };
    }
    return { users: 0, calls: 0, usersDisplay: '0', callsDisplay: '0' };
  };

  if (!user?.tenantId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Organization</CardTitle>
            <CardDescription>
              You're not associated with any organization yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = "/onboarding"}>
              Create Organization
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Company Settings</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">Manage your organization's settings and team</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchSettings(); refetchTeam(); }}>
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline ml-2">Refresh</span>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Mobile: Horizontal scroll tabs with text labels */}
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-full sm:max-w-4xl sm:grid sm:grid-cols-7">
            <TabsTrigger value="general" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm">
              <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>General</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Team</span>
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm">
              <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Roles</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm">
              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Billing</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm">
              <Link2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>CRM</span>
            </TabsTrigger>
            <TabsTrigger value="rubrics" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm">
              <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Rubrics</span>
            </TabsTrigger>
            {(user?.role === 'admin' || user?.role === 'super_admin') && (
              <TabsTrigger value="impersonate" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm">
                <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>View As</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>Basic information about your organization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Your Gunner URL</Label>
                    <div className="flex items-center gap-2">
                      <Input value={window.location.origin} disabled />
                      <Button variant="outline" size="icon" onClick={() => window.open(window.location.origin, '_blank')}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Button 
                    onClick={handleSaveGeneral}
                    disabled={updateSettingsMutation.isPending}
                  >
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>


        </TabsContent>

        {/* Team Management */}
        <TabsContent value="team" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invite Team Members</CardTitle>
              <CardDescription>Add new members to your organization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Input
                  placeholder="email@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 min-w-[200px]"
                />
                <Select value={inviteTeamRole} onValueChange={(v) => setInviteTeamRole(v as 'admin' | 'acquisition_manager' | 'lead_manager' | 'lead_generator')}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Team Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="acquisition_manager">Acquisition Manager</SelectItem>
                    <SelectItem value="lead_manager">Lead Manager</SelectItem>
                    <SelectItem value="lead_generator">Lead Generator</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'user')}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Access" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleInviteTeamMember} disabled={inviteUserMutation.isPending}>
                  <Plus className="h-4 w-4 mr-2" />
                  {inviteUserMutation.isPending ? "Inviting..." : "Invite"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Enter the email of the person you want to invite. They'll be added when they sign in.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage your team's access and roles</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : (teamMembers || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No team members found
                      </TableCell>
                    </TableRow>
                  ) : (
                    (teamMembers || []).map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          {member.lcPhone ? (
                            <span className="text-sm text-emerald-600 font-medium">
                              {member.lcPhone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="capitalize w-fit">
                              {member.role}
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize">
                              {member.teamRole?.replace('_', ' ')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-700">Active</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Edit role"
                              onClick={() => setEditingMember({ 
                                id: member.id, 
                                name: member.name || '', 
                                teamRole: member.teamRole || null,
                                role: member.role || 'user'
                              })}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {member.id !== user?.id && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRemoveUser(member.id, member.name || 'this user')}
                                disabled={removeUserMutation.isPending}
                                title="Remove from organization"
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pending Invitations */}
          {(user?.role === 'admin' || user?.role === 'super_admin') && (pendingInvitations || []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Pending Invitations
                </CardTitle>
                <CardDescription>Users who haven't signed in yet</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Invited</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pendingInvitations || []).map((invitation: any) => (
                      <TableRow key={invitation.id}>
                        <TableCell className="font-medium">{invitation.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="capitalize w-fit">
                              {invitation.role}
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize">
                              {invitation.teamRole?.replace('_', ' ')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(invitation.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {invitation.expiresAt ? new Date(invitation.expiresAt).toLocaleDateString() : 'Never'}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRevokeInvitation(invitation.id, invitation.email)}
                            disabled={revokeInvitationMutation.isPending}
                            title="Revoke invitation"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Roles & Assignments */}
        <TabsContent value="roles" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Roles & Assignments</h2>
              <p className="text-sm text-muted-foreground">Manage user roles and team assignments</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => batchAwardXpMutation.mutate()}
                disabled={batchAwardXpMutation.isPending}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
              >
                <Zap className="h-4 w-4 mr-2" />
                {batchAwardXpMutation.isPending ? "Awarding XP..." : "Award XP for All Calls"}
              </Button>
              <Button 
                onClick={() => batchEvaluateBadgesMutation.mutate()}
                disabled={batchEvaluateBadgesMutation.isPending}
                variant="outline"
                className="border-purple-300 text-purple-600 hover:bg-purple-50"
              >
                <Award className="h-4 w-4 mr-2" />
                {batchEvaluateBadgesMutation.isPending ? "Evaluating..." : "Evaluate Badges"}
              </Button>
            </div>
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
              {allUsersLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : allUsers && allUsers.length > 0 ? (
                <div className="space-y-3">
                  {allUsers.map((u) => {
                    const linkedMember = ghlTeamMembers?.find(tm => tm.id === u.teamMemberId);
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
                                {ghlTeamMembers?.filter(tm => !allUsers.some(usr => usr.teamMemberId === tm.id)).map((tm) => (
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
                              onClick={() => toast.info("To unlink, please contact admin")}
                            >
                              <Unlink className="h-4 w-4 mr-1" />
                              Unlink
                            </Button>
                          )}
                          
                          {/* Role Selection - Single consolidated dropdown */}
                          <Select
                            value={u.teamRole || 'lead_manager'}
                            onValueChange={(value) => updateTeamRoleMutation.mutate({ 
                              userId: u.id, 
                              teamRole: value as 'admin' | 'acquisition_manager' | 'lead_manager' | 'lead_generator'
                            })}
                            disabled={u.id === user?.id}
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
                          
                          <Badge className={{
                            admin: "bg-purple-100 text-purple-700",
                            acquisition_manager: "bg-blue-100 text-blue-700",
                            lead_manager: "bg-green-100 text-green-700",
                            lead_generator: "bg-orange-100 text-orange-700",
                          }[u.teamRole || 'lead_manager']}>
                            {{
                              admin: "Admin",
                              acquisition_manager: "Acquisition Manager",
                              lead_manager: "Lead Manager",
                              lead_generator: "Lead Generator",
                            }[u.teamRole || 'lead_manager']}
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
                  <CardDescription>Assign Lead Managers to Acquisition Managers, and Lead Generators to Lead Managers</CardDescription>
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
                    const amTeamMember = ghlTeamMembers?.find(tm => tm.id === am.teamMemberId);
                    const assignedLeadManagers = teamAssignments?.filter(a => a.acquisitionManagerId === am.teamMemberId) || [];
                    
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
                            const lm = ghlTeamMembers?.find(tm => tm.id === assignment.leadManagerId);
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
                            const availableLeadManagers = ghlTeamMembers?.filter(tm => {
                              const linkedUser = allUsers?.find(u => u.teamMemberId === tm.id);
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
              
              {/* Lead Generator to Lead Manager Assignments */}
              <div className="mt-8 pt-6 border-t">
                <h4 className="text-sm font-medium mb-4">Lead Generator Assignments</h4>
                {leadManagers.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 px-3 border rounded-md border-dashed">
                    No Lead Managers available - assign the Lead Manager role to users first
                  </div>
                ) : (
                  <div className="space-y-4">
                    {leadManagers.map((lm) => {
                      const lmUser = allUsers?.find(u => u.teamMemberId === lm.id);
                      // For now, Lead Generators are assigned to Lead Managers via the same team_assignments table
                      // We'll use leadManagerId to store Lead Generator ID and acquisitionManagerId to store Lead Manager ID
                      const assignedLeadGens = teamAssignments?.filter(a => a.acquisitionManagerId === lm.id) || [];
                      
                      return (
                        <div key={lm.id} className="p-4 rounded-lg border bg-card">
                          <div className="flex items-center gap-2 mb-4">
                            <Badge className="bg-green-100 text-green-700">Lead Manager</Badge>
                            <span className="font-medium">{lm.name}</span>
                          </div>
                          
                          <div className="ml-4 space-y-2">
                            <div className="text-sm text-muted-foreground mb-2">Lead Generators:</div>
                            
                            {/* Current assignments */}
                            {assignedLeadGens.map((assignment) => {
                              const lg = ghlTeamMembers?.find(tm => tm.id === assignment.leadManagerId);
                              const lgUser = allUsers?.find(u => u.teamMemberId === assignment.leadManagerId);
                              // Only show if this is actually a lead generator
                              if (lgUser?.teamRole !== 'lead_generator') return null;
                              return (
                                <div key={assignment.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                                  <span>{lg?.name || 'Unknown'}</span>
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
                            
                            {/* Add new Lead Generator assignment */}
                            {(() => {
                              const availableLeadGens = leadGenerators.filter(lg => {
                                const notAssigned = !assignedLeadGens.some(a => a.leadManagerId === lg.id);
                                return notAssigned;
                              });
                              
                              if (availableLeadGens.length === 0) {
                                return (
                                  <div className="text-sm text-muted-foreground py-2 px-3 border rounded-md border-dashed">
                                    {leadGenerators.length === 0 
                                      ? "No Lead Generators available - assign the Lead Generator role to users first"
                                      : "All Lead Generators have been assigned"}
                                  </div>
                                );
                              }
                              
                              return (
                                <Select
                                  key={`lm-${lm.id}-${assignedLeadGens.length}`}
                                  value=""
                                  onValueChange={(value) => {
                                    if (lm.id && value) {
                                      assignManagerMutation.mutate({
                                        leadManagerId: parseInt(value),
                                        acquisitionManagerId: lm.id,
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="+ Add Lead Generator" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableLeadGens.map((lg) => (
                                      <SelectItem key={lg.id} value={lg.id.toString()}>
                                        {lg.name}
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
              </div>
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
              {ghlTeamLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : ghlTeamMembers && ghlTeamMembers.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ghlTeamMembers.map((tm) => {
                    const linkedUser = allUsers?.find(u => u.teamMemberId === tm.id);
                    return (
                      <div key={tm.id} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                          {tm.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{tm.name}</div>
                          {linkedUser ? (
                            <Badge variant="outline" className="text-xs">
                              {{
                                admin: "Admin",
                                acquisition_manager: "Acquisition Manager",
                                lead_manager: "Lead Manager",
                                lead_generator: "Lead Generator",
                              }[linkedUser.teamRole || 'lead_manager']}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not linked</span>
                          )}
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
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your subscription details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <div className="font-medium text-lg capitalize">{settings?.subscriptionTier || 'trial'} Plan</div>
                      <div className="text-sm text-muted-foreground">
                        {getPlanPrice(settings?.subscriptionTier || null)}
                      </div>
                    </div>
                    <Badge className={
                      settings?.subscriptionStatus === 'active' 
                        ? "bg-green-100 text-green-700" 
                        : settings?.subscriptionTier === 'trial'
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }>
                      {settings?.subscriptionStatus === 'active' ? 'Active' : 
                       settings?.subscriptionTier === 'trial' ? 'Trial' : 
                       settings?.subscriptionStatus || 'Unknown'}
                    </Badge>
                  </div>
                  {settings?.subscriptionTier === 'trial' && settings?.trialEndsAt && (
                    <p className="text-sm text-amber-600">
                      Trial ends on {new Date(settings.trialEndsAt).toLocaleDateString()}
                    </p>
                  )}
                  {subscriptionStatus?.cancelAtPeriodEnd && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Subscription canceling</p>
                        <p className="text-xs text-amber-600">
                          Your subscription will end on {subscriptionStatus.currentPeriodEnd ? new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString() : 'the end of the billing period'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4">
                    {settings?.stripeCustomerId && (
                      <Button variant="outline" onClick={handleManageBilling} disabled={billingPortalMutation.isPending}>
                        {billingPortalMutation.isPending ? "Opening..." : "Manage Billing"}
                      </Button>
                    )}
                    {(settings?.subscriptionTier === 'trial' || settings?.subscriptionTier === 'starter' || settings?.subscriptionTier === 'growth' || (settings?.subscriptionTier as string) === 'scale') && (
                      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
                        <DialogTrigger asChild>
                          <Button>
                            <ArrowUp className="h-4 w-4 mr-2" />
                            {settings?.subscriptionTier === 'trial' ? 'Upgrade Plan' : 'Change Plan'}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>Choose Your Plan</DialogTitle>
                            <DialogDescription>
                              Select a plan that fits your team's needs
                            </DialogDescription>
                          </DialogHeader>
                          
                          {/* Billing Period Toggle */}
                          <div className="flex justify-center gap-4 mb-6">
                            <Button 
                              variant={billingPeriod === 'monthly' ? 'default' : 'outline'}
                              onClick={() => setBillingPeriod('monthly')}
                              size="sm"
                            >
                              Monthly
                            </Button>
                            <Button 
                              variant={billingPeriod === 'yearly' ? 'default' : 'outline'}
                              onClick={() => setBillingPeriod('yearly')}
                              size="sm"
                            >
                              Yearly (2 months free)
                            </Button>
                          </div>

                          {/* Plan Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {dbPlans?.filter((p: any) => p.isActive === 'true' || p.isActive === true)
                              .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
                              .map((plan: any) => {
                                const monthlyPrice = Math.round((plan.priceMonthly || 0) / 100);
                                const yearlyPrice = Math.round((plan.priceYearly || 0) / 100);
                                const isCurrentPlan = settings?.subscriptionTier === plan.code;
                                const isPopular = plan.isPopular === 'true' || plan.isPopular === true;
                                const maxUsers = plan.maxUsers || 0;
                                const maxCalls = plan.maxCallsPerMonth || 0;
                                // Parse features - may be JSON string or already an array
                                let features: string[] = [];
                                if (typeof plan.features === 'string') {
                                  try {
                                    features = JSON.parse(plan.features);
                                  } catch {
                                    features = [];
                                  }
                                } else if (Array.isArray(plan.features)) {
                                  features = plan.features;
                                }
                                
                                // Feature label mapping
                                 const featureLabels: Record<string, string> = {
                                   call_grading: 'AI Call Grading',
                                   advanced_analytics: 'Advanced Analytics',
                                   basic_analytics: 'Basic Analytics',
                                   team_dashboard: 'Team Dashboard',
                                   custom_rubrics: 'Custom Rubrics',
                                   training_materials: 'Training Materials',
                                   api_access: 'API Access',
                                   priority_support: 'Priority Support',
                                   custom_branding: 'Custom Branding',
                                   crm_integration: 'CRM Integration',
                                   multiple_crm_integrations: 'Multiple CRM Integrations',
                                   unlimited_users: 'Unlimited Users',
                                   call_recording_storage: 'Call Recording Storage',
                                   call_recording: 'Call Recording Storage',
                                   coaching_insights: 'Coaching Insights',
                                   team_leaderboards: 'Team Leaderboards',
                                   leaderboards: 'Team Leaderboards',
                                   export_reports: 'Export Reports',
                                   white_label: 'White Label'
                                 };
                                
                                return (
                                  <div 
                                    key={plan.code}
                                    className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                                      selectedPlan === plan.code ? 'border-primary ring-2 ring-primary/20' : 'hover:border-muted-foreground/50'
                                    } ${isCurrentPlan ? 'opacity-50' : ''}`}
                                    onClick={() => !isCurrentPlan && setSelectedPlan(plan.code)}
                                  >
                                    {isPopular && (
                                      <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                                        <Sparkles className="h-3 w-3 mr-1" /> Popular
                                      </Badge>
                                    )}
                                    {isCurrentPlan && (
                                      <Badge className="absolute -top-2 -right-2 bg-green-500">Current</Badge>
                                    )}
                                    <h3 className="font-semibold text-lg">{plan.name}</h3>
                                    <div className="text-2xl font-bold mt-2">
                                      ${billingPeriod === 'monthly' ? monthlyPrice.toLocaleString() : yearlyPrice.toLocaleString()}
                                      <span className="text-sm font-normal text-muted-foreground">/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {maxUsers >= 999 ? 'Unlimited' : `Up to ${maxUsers}`} team members
                                    </p>
                                    <ul className="mt-4 space-y-2 text-sm max-h-32 overflow-y-auto">
                                      {features.slice(0, 4).map((feature: string) => (
                                        <li key={feature} className="flex items-center gap-2">
                                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" /> 
                                          {featureLabels[feature] || feature}
                                        </li>
                                      ))}
                                      {features.length > 4 && (
                                        <li className="text-muted-foreground text-xs">+{features.length - 4} more features</li>
                                      )}
                                    </ul>
                                  </div>
                                );
                              })}
                          </div>

                          {/* Checkout/Change Plan Button */}
                          <div className="flex flex-col items-end gap-2 mt-6">
                            {settings?.subscriptionStatus === 'active' && settings?.stripeSubscriptionId && (
                              <p className="text-xs text-muted-foreground">
                                Your billing will be prorated automatically
                              </p>
                            )}
                            <Button 
                              onClick={() => {
                                // If user has active subscription, change it directly
                                // Otherwise, go through checkout for new subscription
                                if (settings?.subscriptionStatus === 'active' && settings?.stripeSubscriptionId) {
                                  changeSubscriptionMutation.mutate({ planCode: selectedPlan, billingPeriod });
                                } else {
                                  upgradePlanMutation.mutate({ planCode: selectedPlan, billingPeriod });
                                }
                              }}
                              disabled={
                                upgradePlanMutation.isPending || 
                                changeSubscriptionMutation.isPending || 
                                selectedPlan === settings?.subscriptionTier
                              }
                            >
                              {(upgradePlanMutation.isPending || changeSubscriptionMutation.isPending) 
                                ? 'Processing...' 
                                : settings?.subscriptionStatus === 'active' && settings?.stripeSubscriptionId
                                  ? 'Change Plan'
                                  : 'Continue to Checkout'
                              }
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    {settings?.subscriptionStatus === 'active' && !subscriptionStatus?.cancelAtPeriodEnd && (
                      <Button 
                        variant="outline" 
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={handleCancelSubscription}
                        disabled={cancelSubscriptionMutation.isPending}
                      >
                        {cancelSubscriptionMutation.isPending ? "Canceling..." : "Cancel Subscription"}
                      </Button>
                    )}
                    {subscriptionStatus?.cancelAtPeriodEnd && (
                      <Button 
                        onClick={handleReactivateSubscription}
                        disabled={reactivateSubscriptionMutation.isPending}
                      >
                        {reactivateSubscriptionMutation.isPending ? "Reactivating..." : "Reactivate Subscription"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>Your current usage this billing period</CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Team Members Usage */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Team Members</span>
                      <span className="text-sm text-muted-foreground">
                        {(teamMembers || []).length} / {getPlanLimits(settings?.subscriptionTier || null).usersDisplay}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          ((teamMembers || []).length / getPlanLimits(settings?.subscriptionTier || null).users) >= 1 
                            ? 'bg-red-500' 
                            : ((teamMembers || []).length / getPlanLimits(settings?.subscriptionTier || null).users) >= 0.8 
                              ? 'bg-amber-500' 
                              : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, ((teamMembers || []).length / getPlanLimits(settings?.subscriptionTier || null).users) * 100)}%` }}
                      />
                    </div>
                    {((teamMembers || []).length / getPlanLimits(settings?.subscriptionTier || null).users) >= 0.8 && (
                      <div className={`flex items-center gap-2 text-sm ${
                        ((teamMembers || []).length / getPlanLimits(settings?.subscriptionTier || null).users) >= 1 
                          ? 'text-red-600' 
                          : 'text-amber-600'
                      }`}>
                        <AlertCircle className="h-4 w-4" />
                        {((teamMembers || []).length / getPlanLimits(settings?.subscriptionTier || null).users) >= 1 
                          ? 'Team member limit reached. Upgrade to add more.' 
                          : 'Approaching team member limit.'}
                      </div>
                    )}
                  </div>

                  {/* Calls Graded Usage */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Calls Graded This Month</span>
                      <span className="text-sm text-muted-foreground">
                        {settings?.callCount || 0} / {getPlanLimits(settings?.subscriptionTier || null).callsDisplay}
                      </span>
                    </div>
                    {getPlanLimits(settings?.subscriptionTier || null).calls !== 999999 && (
                      <>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              ((settings?.callCount || 0) / getPlanLimits(settings?.subscriptionTier || null).calls) >= 1 
                                ? 'bg-red-500' 
                                : ((settings?.callCount || 0) / getPlanLimits(settings?.subscriptionTier || null).calls) >= 0.8 
                                  ? 'bg-amber-500' 
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(100, ((settings?.callCount || 0) / getPlanLimits(settings?.subscriptionTier || null).calls) * 100)}%` }}
                          />
                        </div>
                        {((settings?.callCount || 0) / getPlanLimits(settings?.subscriptionTier || null).calls) >= 0.8 && (
                          <div className={`flex items-center gap-2 text-sm ${
                            ((settings?.callCount || 0) / getPlanLimits(settings?.subscriptionTier || null).calls) >= 1 
                              ? 'text-red-600' 
                              : 'text-amber-600'
                          }`}>
                            <AlertCircle className="h-4 w-4" />
                            {((settings?.callCount || 0) / getPlanLimits(settings?.subscriptionTier || null).calls) >= 1 
                              ? 'Call grading limit reached. Upgrade for more.' 
                              : 'Approaching call grading limit.'}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Upgrade prompt when at limit */}
                  {(((teamMembers || []).length >= getPlanLimits(settings?.subscriptionTier || null).users) ||
                    ((settings?.callCount || 0) >= getPlanLimits(settings?.subscriptionTier || null).calls && getPlanLimits(settings?.subscriptionTier || null).calls !== 999999)) && 
                    settings?.subscriptionTier !== 'scale' && (
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Need more capacity?</p>
                          <p className="text-sm text-muted-foreground">Upgrade your plan to unlock higher limits.</p>
                        </div>
                        <Button size="sm" onClick={() => setShowUpgradeModal(true)}>
                          <ArrowUp className="h-4 w-4 mr-1" /> Upgrade
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CRM Integrations */}
        <TabsContent value="integrations" className="space-y-6">
          {/* GoHighLevel Integration Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Link2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">GoHighLevel</CardTitle>
                    <CardDescription>Sync contacts, call recordings, and pipeline data</CardDescription>
                    {crmIntegrations?.ghl?.lastSynced && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last synced: {formatRelativeTime(crmIntegrations.ghl.lastSynced)}
                      </p>
                    )}
                  </div>
                </div>
                {crmIntegrations?.ghl?.connected ? (
                  <Badge className="bg-green-100 text-green-700 border-green-300 gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                    Not Connected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ghlApiKey">API Key</Label>
                      <Input
                        id="ghlApiKey"
                        type="password"
                        placeholder={crmIntegrations?.ghl?.hasApiKey ? "••••••••••••" : "Enter GHL Private Integration token"}
                        value={ghlApiKey}
                        onChange={(e) => setGhlApiKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ghlLocationId">Location ID</Label>
                      <Input
                        id="ghlLocationId"
                        placeholder={crmIntegrations?.ghl?.hasLocationId ? (crmIntegrations.ghl.locationId || "••••••••") : "Enter GHL Location ID"}
                        value={ghlLocationId}
                        onChange={(e) => setGhlLocationId(e.target.value)}
                      />
                    </div>
                  </div>
                  {crmIntegrations?.ghl?.connected && crmIntegrations.ghl.dispoPipelineName && (
                    <div className="p-3 bg-muted/50 rounded-lg text-sm">
                      <p className="text-muted-foreground">Pipeline: <span className="font-medium text-foreground">{crmIntegrations.ghl.dispoPipelineName}</span></p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!ghlApiKey && !crmIntegrations?.ghl?.hasApiKey) {
                          toast.error("Enter an API key first");
                          return;
                        }
                        testGhlMutation.mutate({
                          apiKey: ghlApiKey || "existing",
                          locationId: ghlLocationId || crmIntegrations?.ghl?.locationId || "",
                        });
                      }}
                      disabled={testGhlMutation.isPending}
                    >
                      {testGhlMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Testing...</> : <><TestTube className="h-4 w-4 mr-1" />Test Connection</>}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        saveCrmIntegrationMutation.mutate({
                          integration: 'ghl',
                          enabled: true,
                          config: {
                            apiKey: ghlApiKey || undefined,
                            locationId: ghlLocationId || undefined,
                          },
                        });
                      }}
                      disabled={saveCrmIntegrationMutation.isPending}
                    >
                      {saveCrmIntegrationMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    {crmIntegrations?.ghl?.connected && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          saveCrmIntegrationMutation.mutate({
                            integration: 'ghl',
                            enabled: false,
                            config: {},
                          });
                        }}
                      >
                        <Unlink className="h-4 w-4 mr-1" /> Disconnect
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Calls sync automatically every 30 minutes. Find your API key in GHL → Settings → Integrations → Private Integrations.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* BatchDialer Integration Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">BatchDialer</CardTitle>
                    <CardDescription>Sync cold calling campaigns and call recordings</CardDescription>
                    {crmIntegrations?.batchDialer?.lastSynced && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last synced: {formatRelativeTime(crmIntegrations.batchDialer.lastSynced)}
                      </p>
                    )}
                  </div>
                </div>
                {crmIntegrations?.batchDialer?.connected ? (
                  <Badge className="bg-green-100 text-green-700 border-green-300 gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                    Not Connected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="bdApiKey">API Key</Label>
                    <Input
                      id="bdApiKey"
                      type="password"
                      placeholder={crmIntegrations?.batchDialer?.hasApiKey ? "••••••••••••" : "Enter your BatchDialer API key"}
                      value={bdApiKey}
                      onChange={(e) => setBdApiKey(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!bdApiKey && !crmIntegrations?.batchDialer?.hasApiKey) {
                          toast.error("Enter an API key first");
                          return;
                        }
                        testBdMutation.mutate({ apiKey: bdApiKey || "existing" });
                      }}
                      disabled={testBdMutation.isPending}
                    >
                      {testBdMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Testing...</> : <><TestTube className="h-4 w-4 mr-1" />Test Connection</>}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        saveCrmIntegrationMutation.mutate({
                          integration: 'batchdialer',
                          enabled: true,
                          config: { apiKey: bdApiKey || undefined },
                        });
                      }}
                      disabled={saveCrmIntegrationMutation.isPending}
                    >
                      {saveCrmIntegrationMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    {crmIntegrations?.batchDialer?.connected && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => syncBdMutation.mutate()}
                          disabled={syncBdMutation.isPending}
                        >
                          {syncBdMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Syncing...</> : <><Cloud className="h-4 w-4 mr-1" />Sync Now</>}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            saveCrmIntegrationMutation.mutate({
                              integration: 'batchdialer',
                              enabled: false,
                              config: {},
                            });
                          }}
                        >
                          <Unlink className="h-4 w-4 mr-1" /> Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Calls sync automatically every 30 minutes. Find your API key in BatchDialer → Settings → API.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* BatchLeads Integration Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Home className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">BatchLeads</CardTitle>
                    <CardDescription>Enrich calls with property data, owner info, and estimated values</CardDescription>
                    {crmIntegrations?.batchLeads?.lastSynced && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last synced: {formatRelativeTime(crmIntegrations.batchLeads.lastSynced)}
                      </p>
                    )}
                  </div>
                </div>
                {crmIntegrations?.batchLeads?.connected ? (
                  <Badge className="bg-green-100 text-green-700 border-green-300 gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                    Not Connected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="blApiKey">API Key</Label>
                    <Input
                      id="blApiKey"
                      type="password"
                      placeholder={crmIntegrations?.batchLeads?.hasApiKey ? "••••••••••••" : "Enter your BatchLeads API key"}
                      value={blApiKey}
                      onChange={(e) => setBlApiKey(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!blApiKey && !crmIntegrations?.batchLeads?.hasApiKey) {
                          toast.error("Enter an API key first");
                          return;
                        }
                        testBlMutation.mutate({ apiKey: blApiKey || "existing" });
                      }}
                      disabled={testBlMutation.isPending}
                    >
                      {testBlMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Testing...</> : <><TestTube className="h-4 w-4 mr-1" />Test Connection</>}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        saveCrmIntegrationMutation.mutate({
                          integration: 'batchleads',
                          enabled: true,
                          config: { apiKey: blApiKey || undefined },
                        });
                      }}
                      disabled={saveCrmIntegrationMutation.isPending}
                    >
                      {saveCrmIntegrationMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    {crmIntegrations?.batchLeads?.connected && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => syncBlMutation.mutate()}
                          disabled={syncBlMutation.isPending}
                        >
                          {syncBlMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enriching...</> : <><Cloud className="h-4 w-4 mr-1" />Enrich Now</>}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            saveCrmIntegrationMutation.mutate({
                              integration: 'batchleads',
                              enabled: false,
                              config: {},
                            });
                          }}
                        >
                          <Unlink className="h-4 w-4 mr-1" /> Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatically enriches calls with property value, equity, owner info, and more. Runs every 60 minutes. Find your API key at app.batchleads.io → Settings → API.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Advanced Configuration Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Advanced Configuration</CardTitle>
                  <CardDescription>Pipeline stages, industry, and webhook settings</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Industry */}
              <div className="space-y-2">
                <Label htmlFor="industry">Industry / Business Type</Label>
                <Input
                  id="industry"
                  placeholder="e.g. real estate wholesaling/investing"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Used to customize AI grading prompts and call classification. Default: real estate wholesaling/investing</p>
              </div>

              {/* Pipeline Stage Classification */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold">Pipeline Stage Classification</Label>
                  <p className="text-xs text-muted-foreground mt-1">Classify your CRM pipeline stages for opportunity detection. Enter stage names separated by commas (case-insensitive).</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="activeStages" className="text-sm flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                      Active Deal Stages
                    </Label>
                    <Input
                      id="activeStages"
                      placeholder="e.g. warm leads, pending apt, made offer, counter offer"
                      value={activeStages}
                      onChange={(e) => setActiveStages(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="followUpStages" className="text-sm flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" />
                      Follow-Up Stages
                    </Label>
                    <Input
                      id="followUpStages"
                      placeholder="e.g. follow up, callback, nurture"
                      value={followUpStages}
                      onChange={(e) => setFollowUpStages(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deadStages" className="text-sm flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                      Dead / Closed Stages
                    </Label>
                    <Input
                      id="deadStages"
                      placeholder="e.g. dead, not interested, do not contact, wrong number"
                      value={deadStages}
                      onChange={(e) => setDeadStages(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* GHL Inbound Webhook URL */}
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
                <Label className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <Webhook className="h-4 w-4" />
                  GHL Webhook URL
                </Label>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Add this URL to your GHL workflow to send call data to Gunner automatically.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white dark:bg-black/30 border border-amber-200 dark:border-amber-700 rounded px-3 py-2 font-mono break-all">
                    {`${window.location.origin}/api/webhook/ghl`}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/webhook/ghl`);
                      toast.success("Webhook URL copied!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-500">GHL Workflow: Trigger on "Call Status Changed" → "Completed" → Webhook POST to this URL</p>
              </div>

              {/* External Webhook URL */}
              <div className="space-y-2">
                <Label htmlFor="engineWebhookUrl">External Webhook URL (Optional)</Label>
                <Input
                  id="engineWebhookUrl"
                  placeholder="https://your-automation-server.com/webhook"
                  value={engineWebhookUrl}
                  onChange={(e) => setEngineWebhookUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Graded call data will be sent to this URL via POST. Leave blank to disable.</p>
              </div>

              <Button
                onClick={handleSaveAdvancedConfig}
                disabled={updateAdvancedConfigMutation.isPending}
              >
                {updateAdvancedConfigMutation.isPending ? "Saving..." : "Save Advanced Config"}
              </Button>
            </CardContent>
          </Card>

          {/* Other CRMs - Coming Soon */}
          <Card className="opacity-60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">More Integrations Coming Soon</CardTitle>
                  <CardDescription>HubSpot, Salesforce, Close.io, Pipedrive</CardDescription>
                </div>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
            </CardHeader>
          </Card>
        </TabsContent>

        {/* Grading Rubrics */}
        <TabsContent value="rubrics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Grading Rubrics</CardTitle>
              <CardDescription>Customize how calls are evaluated</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Grading rubrics are managed in the Training section. Visit the Training page to create and edit rubrics.
              </p>
              <Button variant="outline" onClick={() => window.location.href = "/training"}>
                Go to Training
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* View As / Impersonation (Admin Only) */}
        {(user?.role === 'admin' || user?.role === 'super_admin') && (
          <TabsContent value="impersonate" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  View As Team Member
                </CardTitle>
                <CardDescription>
                  View the app as any team member to see what they see. This is useful for troubleshooting and understanding their experience.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {teamLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : teamMembers && teamMembers.length > 0 ? (
                  <div className="space-y-2">
                    {teamMembers
                      .filter((member: any) => member.id !== user?.id) // Don't show current user
                      .map((member: any) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {member.name?.charAt(0)?.toUpperCase() || member.email?.charAt(0)?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{member.name || 'Unnamed User'}</p>
                              <p className="text-sm text-muted-foreground">{member.email}</p>
                            </div>
                            <Badge variant="outline" className="ml-2">
                              {member.teamRole?.replace(/_/g, ' ') || member.role || 'user'}
                            </Badge>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Store impersonation in localStorage and reload
                              localStorage.setItem('impersonateUserId', member.id.toString());
                              localStorage.setItem('impersonateUserName', member.name || member.email || 'User');
                              toast.success(`Viewing as ${member.name || member.email}`);
                              window.location.href = '/dashboard';
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View As
                          </Button>
                        </div>
                      ))}
                    {teamMembers.filter((m: any) => m.id !== user?.id).length === 0 && (
                      <p className="text-muted-foreground text-center py-8">
                        No other team members to view as. Invite team members first.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No team members found. Invite team members to use this feature.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">About View As</p>
                    <p className="text-sm text-amber-700 mt-1">
                      When viewing as another user, you'll see the app exactly as they see it, including their calls, stats, and permissions. 
                      A banner will appear at the top of the screen to remind you that you're viewing as someone else. 
                      Click "Stop Viewing" in the banner to return to your own view.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Member Dialog */}
      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>Update role for {editingMember?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Team Role</Label>
              <Select 
                value={editingMember?.teamRole || ''} 
                onValueChange={(value) => setEditingMember(prev => prev ? { ...prev, teamRole: value } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="acquisition_manager">Acquisition Manager</SelectItem>
                  <SelectItem value="lead_manager">Lead Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>System Access</Label>
              <Select 
                value={editingMember?.role || 'user'} 
                onValueChange={(value) => setEditingMember(prev => prev ? { ...prev, role: value } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select access level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Admins can manage team members, view all calls, and access settings.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
              <Button 
                onClick={() => {
                  if (editingMember) {
                    updateUserRoleMutation.mutate({ 
                      userId: editingMember.id, 
                      role: editingMember.role as 'admin' | 'user',
                      teamRole: editingMember.teamRole as 'admin' | 'acquisition_manager' | 'lead_manager' 
                    });
                    setEditingMember(null);
                  }
                }}
                disabled={updateUserRoleMutation.isPending}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
