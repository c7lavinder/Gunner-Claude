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
  Sparkles
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function TenantSettings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("general");
  const [companyName, setCompanyName] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [crmType, setCrmType] = useState<string>("none");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [inviteTeamRole, setInviteTeamRole] = useState<'admin' | 'acquisition_manager' | 'lead_manager'>('lead_manager');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'growth' | 'scale'>('growth');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

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
    { enabled: !!user?.tenantId && user?.role === 'admin' }
  );

  // Fetch subscription status
  const { data: subscriptionStatus, refetch: refetchSubscription } = trpc.tenant.getSubscriptionStatus.useQuery(
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

  // Upgrade plan mutation
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

  // Initialize form values when settings load
  useEffect(() => {
    if (settings) {
      setCompanyName(settings.name || "");
      setCustomDomain(settings.domain || "");
      setCrmType(settings.crmType || "none");
    }
  }, [settings]);

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

  const getPlanPrice = (plan: string | null) => {
    switch (plan) {
      case "starter": return "$99/month";
      case "growth": return "$249/month";
      case "scale": return "$499/month";
      case "trial": return "Free trial";
      default: return "N/A";
    }
  };

  const getPlanLimits = (plan: string | null): { users: number, calls: number, usersDisplay: string, callsDisplay: string } => {
    switch (plan) {
      case "starter": return { users: 3, calls: 100, usersDisplay: "3", callsDisplay: "100" };
      case "growth": return { users: 10, calls: 500, usersDisplay: "10", callsDisplay: "500" };
      case "scale": return { users: 999, calls: 999999, usersDisplay: "Unlimited", callsDisplay: "Unlimited" };
      case "trial": return { users: 3, calls: 50, usersDisplay: "3", callsDisplay: "50" };
      default: return { users: 0, calls: 0, usersDisplay: "0", callsDisplay: "0" };
    }
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
          <h1 className="text-2xl font-bold">Company Settings</h1>
          <p className="text-muted-foreground">Manage your organization's settings and team</p>
        </div>
        <Button variant="outline" onClick={() => { refetchSettings(); refetchTeam(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Billing</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">CRM</span>
          </TabsTrigger>
          <TabsTrigger value="rubrics" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Rubrics</span>
          </TabsTrigger>
        </TabsList>

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
                      <Input value={`gunner.app/${settings?.slug || ''}`} disabled />
                      <Button variant="outline" size="icon">
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

          <Card>
            <CardHeader>
              <CardTitle>Custom Domain</CardTitle>
              <CardDescription>Use your own domain for Gunner (Scale plan only)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="customDomain">Custom Domain</Label>
                    <Input
                      id="customDomain"
                      placeholder="coaching.yourcompany.com"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      disabled={settings?.subscriptionTier !== "scale"}
                    />
                  </div>
                  {settings?.subscriptionTier !== "scale" && (
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Scale plan to use a custom domain
                    </p>
                  )}
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
                <Select value={inviteTeamRole} onValueChange={(v) => setInviteTeamRole(v as 'admin' | 'acquisition_manager' | 'lead_manager')}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Team Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="acquisition_manager">Acquisition Manager</SelectItem>
                    <SelectItem value="lead_manager">Lead Manager</SelectItem>
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
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : (teamMembers || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No team members found
                      </TableCell>
                    </TableRow>
                  ) : (
                    (teamMembers || []).map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.email}</TableCell>
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
                            <Button variant="ghost" size="icon" title="Edit role">
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
          {user?.role === 'admin' && (pendingInvitations || []).length > 0 && (
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
                    {(settings?.subscriptionTier === 'trial' || settings?.subscriptionTier === 'starter' || settings?.subscriptionTier === 'growth') && (
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
                            {/* Starter Plan */}
                            <div 
                              className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                                selectedPlan === 'starter' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-muted-foreground/50'
                              } ${settings?.subscriptionTier === 'starter' ? 'opacity-50' : ''}`}
                              onClick={() => settings?.subscriptionTier !== 'starter' && setSelectedPlan('starter')}
                            >
                              {settings?.subscriptionTier === 'starter' && (
                                <Badge className="absolute -top-2 -right-2 bg-green-500">Current</Badge>
                              )}
                              <h3 className="font-semibold text-lg">Starter</h3>
                              <div className="text-2xl font-bold mt-2">
                                ${billingPeriod === 'monthly' ? '99' : '990'}
                                <span className="text-sm font-normal text-muted-foreground">/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                              </div>
                              <ul className="mt-4 space-y-2 text-sm">
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Up to 3 team members</li>
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> AI call grading</li>
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 1 CRM integration</li>
                              </ul>
                            </div>

                            {/* Growth Plan */}
                            <div 
                              className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                                selectedPlan === 'growth' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-muted-foreground/50'
                              } ${settings?.subscriptionTier === 'growth' ? 'opacity-50' : ''}`}
                              onClick={() => settings?.subscriptionTier !== 'growth' && setSelectedPlan('growth')}
                            >
                              <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                                <Sparkles className="h-3 w-3 mr-1" /> Popular
                              </Badge>
                              {settings?.subscriptionTier === 'growth' && (
                                <Badge className="absolute -top-2 -right-2 bg-green-500">Current</Badge>
                              )}
                              <h3 className="font-semibold text-lg">Growth</h3>
                              <div className="text-2xl font-bold mt-2">
                                ${billingPeriod === 'monthly' ? '249' : '2,490'}
                                <span className="text-sm font-normal text-muted-foreground">/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                              </div>
                              <ul className="mt-4 space-y-2 text-sm">
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Up to 10 team members</li>
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Advanced analytics</li>
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 2 CRM integrations</li>
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Custom rubrics</li>
                              </ul>
                            </div>

                            {/* Scale Plan */}
                            <div 
                              className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                                selectedPlan === 'scale' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-muted-foreground/50'
                              } ${(settings?.subscriptionTier as string) === 'scale' ? 'opacity-50' : ''}`}
                              onClick={() => (settings?.subscriptionTier as string) !== 'scale' && setSelectedPlan('scale')}
                            >
                              {(settings?.subscriptionTier as string) === 'scale' && (
                                <Badge className="absolute -top-2 -right-2 bg-green-500">Current</Badge>
                              )}
                              <h3 className="font-semibold text-lg">Scale</h3>
                              <div className="text-2xl font-bold mt-2">
                                ${billingPeriod === 'monthly' ? '499' : '4,990'}
                                <span className="text-sm font-normal text-muted-foreground">/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                              </div>
                              <ul className="mt-4 space-y-2 text-sm">
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited team members</li>
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 5 CRM integrations</li>
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> API access</li>
                                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Custom branding</li>
                              </ul>
                            </div>
                          </div>

                          {/* Checkout Button */}
                          <div className="flex justify-end mt-6">
                            <Button 
                              onClick={() => upgradePlanMutation.mutate({ planCode: selectedPlan, billingPeriod })}
                              disabled={upgradePlanMutation.isPending || selectedPlan === settings?.subscriptionTier}
                            >
                              {upgradePlanMutation.isPending ? 'Processing...' : `Continue to Checkout`}
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
          <Card>
            <CardHeader>
              <CardTitle>CRM Integration</CardTitle>
              <CardDescription>Connect your CRM to sync contacts and call data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Select CRM</Label>
                    <Select value={crmType} onValueChange={setCrmType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a CRM" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="ghl">GoHighLevel</SelectItem>
                        <SelectItem value="hubspot">HubSpot</SelectItem>
                        <SelectItem value="salesforce">Salesforce</SelectItem>
                        <SelectItem value="close">Close.io</SelectItem>
                        <SelectItem value="pipedrive">Pipedrive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {crmType !== 'none' && (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        {crmType === 'ghl' && "Connect your GoHighLevel account to sync contacts and call recordings."}
                        {crmType === 'hubspot' && "Connect your HubSpot account to sync contacts and call data."}
                        {crmType === 'salesforce' && "Connect your Salesforce account to sync leads and call activities."}
                        {crmType === 'close' && "Connect your Close.io account to sync leads and call recordings."}
                        {crmType === 'pipedrive' && "Connect your Pipedrive account to sync deals and call activities."}
                      </p>
                      <Button className="mt-4" variant="outline">
                        Connect {crmType.toUpperCase()}
                      </Button>
                    </div>
                  )}
                  <Button 
                    onClick={handleSaveCrm}
                    disabled={updateSettingsMutation.isPending}
                  >
                    {updateSettingsMutation.isPending ? "Saving..." : "Save CRM Settings"}
                  </Button>
                </>
              )}
            </CardContent>
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
      </Tabs>
    </div>
  );
}
