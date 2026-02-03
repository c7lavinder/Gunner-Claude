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
  RefreshCw
} from "lucide-react";
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
    // TODO: Implement invite functionality
    toast.success(`Invitation sent to ${inviteEmail}`);
    setInviteEmail("");
  };

  const handleManageBilling = () => {
    toast.info("Redirecting to Stripe billing portal...");
    // TODO: Create Stripe billing portal session
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

  const getPlanLimits = (plan: string | null) => {
    switch (plan) {
      case "starter": return { users: 3, calls: 100 };
      case "growth": return { users: 10, calls: 500 };
      case "scale": return { users: "Unlimited", calls: "Unlimited" };
      case "trial": return { users: 3, calls: 50 };
      default: return { users: 0, calls: 0 };
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
              <div className="flex gap-4">
                <Input
                  placeholder="email@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Select defaultValue="member">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleInviteTeamMember}>
                  <Plus className="h-4 w-4 mr-2" />
                  Invite
                </Button>
              </div>
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
                          <Badge variant="outline" className="capitalize">
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-700">Active</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
                  <div className="flex gap-4">
                    <Button variant="outline" onClick={handleManageBilling}>
                      Manage Billing
                    </Button>
                    <Button variant="outline">View Invoices</Button>
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
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Team Members</span>
                    <span className="font-medium">
                      {(teamMembers || []).length} / {getPlanLimits(settings?.subscriptionTier || null).users}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Calls Graded This Month</span>
                    <span className="font-medium">
                      {settings?.callCount || 0} / {getPlanLimits(settings?.subscriptionTier || null).calls}
                    </span>
                  </div>
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
