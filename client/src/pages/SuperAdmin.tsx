import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Building2, 
  DollarSign, 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  Search,
  Eye,
  ArrowLeft,
  RefreshCw,
  Activity,
  UserPlus,
  CreditCard,
  XCircle,
  Clock,
  Mail,
  LogOut,
  CheckCircle,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Star,
  Check,
  Loader2
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function SuperAdmin() {
  const [, setLocation] = useLocation();
  const { user, refresh: refetchAuth } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [sendingOutreach, setSendingOutreach] = useState<number | null>(null);
  const [outreachSent, setOutreachSent] = useState<Set<number>>(new Set());
  
  // Plans management state
  const [editingPlan, setEditingPlan] = useState<number | null>(null);
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);
  const [planFormData, setPlanFormData] = useState({
    name: "",
    code: "",
    description: "",
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 14,
    maxUsers: 3,
    maxCallsPerMonth: 500,
    maxCrmIntegrations: 1,
    features: [] as string[],
    isPopular: false,
    isActive: true,
    sortOrder: 0,
    stripePriceIdMonthly: "",
    stripePriceIdYearly: "",
  });
  const [newFeature, setNewFeature] = useState("");

  // Fetch real data from backend
  const { data: tenants, isLoading: tenantsLoading, refetch: refetchTenants } = trpc.tenant.list.useQuery();
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = trpc.tenant.getMetrics.useQuery();
  const { data: recentActivity, isLoading: activityLoading, refetch: refetchActivity } = trpc.tenant.getRecentActivity.useQuery();
  const { data: lowUsageTenants, isLoading: lowUsageLoading, refetch: refetchLowUsage } = trpc.tenant.getLowUsageTenants.useQuery();
  const { data: impersonationStatus } = trpc.tenant.getImpersonationStatus.useQuery();
  const { data: outreachHistory, isLoading: outreachLoading, refetch: refetchOutreach } = trpc.tenant.getOutreachHistory.useQuery({});
  
  // Plans queries
  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = trpc.admin.getPlans.useQuery();

  // Mutations
  const startImpersonation = trpc.tenant.startImpersonation.useMutation({
    onSuccess: () => {
      toast.success("Now viewing as tenant");
      refetchAuth();
      setLocation("/dashboard");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to start impersonation");
    }
  });

  const stopImpersonation = trpc.tenant.stopImpersonation.useMutation({
    onSuccess: () => {
      toast.success("Returned to super admin view");
      refetchAuth();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to stop impersonation");
    }
  });

  const sendOutreachEmail = trpc.tenant.sendChurnOutreach.useMutation({
    onSuccess: (_: unknown, variables: { tenantId: number }) => {
      toast.success("Re-engagement email sent successfully");
      setOutreachSent(prev => new Set(prev).add(variables.tenantId));
      setSendingOutreach(null);
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to send outreach email");
      setSendingOutreach(null);
    }
  });

  // Plans mutations
  const createPlan = trpc.admin.createPlan.useMutation({
    onSuccess: () => {
      toast.success("Plan created successfully");
      refetchPlans();
      setShowNewPlanForm(false);
      resetPlanForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create plan");
    }
  });

  const updatePlan = trpc.admin.updatePlan.useMutation({
    onSuccess: () => {
      toast.success("Plan updated successfully");
      refetchPlans();
      setEditingPlan(null);
      resetPlanForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update plan");
    }
  });

  const deletePlan = trpc.admin.deletePlan.useMutation({
    onSuccess: () => {
      toast.success("Plan deleted successfully");
      refetchPlans();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete plan");
    }
  });

  const seedDefaultPlans = trpc.admin.seedDefaultPlans.useMutation({
    onSuccess: () => {
      toast.success("Default plans seeded successfully");
      refetchPlans();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to seed default plans");
    }
  });

  // Email sequence mutation
  const triggerEmailSequence = trpc.tenant.triggerEmailSequence.useMutation({
    onSuccess: (data) => {
      toast.success(`Email sequence processed: ${data.usersProcessed} users, ${data.emailsSent} emails sent`);
      if (data.details.length > 0) {
        console.log('Email sequence details:', data.details);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to trigger email sequence");
    }
  });

  const resetPlanForm = () => {
    setPlanFormData({
      name: "",
      code: "",
      description: "",
      priceMonthly: 0,
      priceYearly: 0,
      trialDays: 14,
      maxUsers: 3,
      maxCallsPerMonth: 500,
      maxCrmIntegrations: 1,
      features: [],
      isPopular: false,
      isActive: true,
      sortOrder: 0,
      stripePriceIdMonthly: "",
      stripePriceIdYearly: "",
    });
    setNewFeature("");
  };

  const handleEditPlan = (plan: NonNullable<typeof plans>[0]) => {
    setEditingPlan(plan.id);
    setPlanFormData({
      name: plan.name,
      code: plan.code,
      description: plan.description || "",
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly || 0,
      trialDays: plan.trialDays || 14,
      maxUsers: plan.maxUsers,
      maxCallsPerMonth: plan.maxCallsPerMonth || 500,
      maxCrmIntegrations: plan.maxCrmIntegrations || 1,
      features: plan.features || [],
      isPopular: plan.isPopular === "true",
      isActive: plan.isActive === "true",
      sortOrder: plan.sortOrder || 0,
      stripePriceIdMonthly: plan.stripePriceIdMonthly || "",
      stripePriceIdYearly: plan.stripePriceIdYearly || "",
    });
  };

  const handleSavePlan = () => {
    if (editingPlan) {
      updatePlan.mutate({ id: editingPlan, ...planFormData });
    } else {
      createPlan.mutate(planFormData);
    }
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setPlanFormData(prev => ({
        ...prev,
        features: [...prev.features, newFeature.trim()]
      }));
      setNewFeature("");
    }
  };

  const removeFeature = (index: number) => {
    setPlanFormData(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  // Check if user is super admin or platform owner
  const isPlatformOwner = user?.openId === "U3JEthPNs4UbYRrgRBbShj"; // Corey's openId
  const isSuperAdmin = user?.role === "super_admin" || isPlatformOwner;
  
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the Platform Admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/dashboard")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredTenants = (tenants || []).filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-700">Active</Badge>;
      case "trial":
        return <Badge className="bg-blue-100 text-blue-700">Trial</Badge>;
      case "past_due":
        return <Badge className="bg-red-100 text-red-700">Past Due</Badge>;
      case "canceled":
        return <Badge className="bg-gray-100 text-gray-700">Canceled</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  const getPlanBadge = (plan: string | null) => {
    switch (plan) {
      case "trial":
        return <Badge className="bg-blue-100 text-blue-700">Trial</Badge>;
      case "starter":
        return <Badge variant="outline">Starter</Badge>;
      case "growth":
        return <Badge className="bg-purple-100 text-purple-700">Growth</Badge>;
      case "scale":
        return <Badge className="bg-amber-100 text-amber-700">Scale</Badge>;
      default:
        return <Badge variant="outline">{plan || "None"}</Badge>;
    }
  };

  const handleRefresh = () => {
    refetchTenants();
    refetchMetrics();
    refetchActivity();
    refetchLowUsage();
    refetchOutreach();
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'trial_start':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'upgrade':
        return <CreditCard className="h-4 w-4 text-green-500" />;
      case 'cancel':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <UserPlus className="h-4 w-4 text-purple-500" />;
    }
  };

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  };

  const handleImpersonate = (tenantId: number) => {
    startImpersonation.mutate({ tenantId });
  };

  const handleStopImpersonation = () => {
    stopImpersonation.mutate();
  };

  const handleSendOutreach = (tenantId: number) => {
    setSendingOutreach(tenantId);
    sendOutreachEmail.mutate({ tenantId });
  };

  return (
    <div className="space-y-6">
      {/* Impersonation Banner */}
      {impersonationStatus?.isImpersonating && (
        <div className="bg-amber-100 border border-amber-300 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">
                Viewing as: {impersonationStatus.impersonatedTenantName}
              </p>
              <p className="text-sm text-amber-700">
                You are currently impersonating this tenant. All actions will be performed as this tenant.
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="border-amber-600 text-amber-700 hover:bg-amber-200"
            onClick={handleStopImpersonation}
            disabled={stopImpersonation.isPending}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Exit Impersonation
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Platform Admin Dashboard</h1>
            <p className="text-muted-foreground">Platform-wide metrics and tenant management</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="churn-risk">Churn Risk</TabsTrigger>
          <TabsTrigger value="outreach-history">Outreach History</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Monthly Recurring Revenue</CardDescription>
                {metricsLoading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <DollarSign className="h-6 w-6 text-green-500" />
                    ${(metrics?.totalMrr || 0).toLocaleString()}
                  </CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Annual Recurring Revenue</CardDescription>
                {metricsLoading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-blue-500" />
                    ${(metrics?.totalArr || 0).toLocaleString()}
                  </CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Tenants</CardDescription>
                {metricsLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Building2 className="h-6 w-6 text-purple-500" />
                    {metrics?.totalTenants || 0}
                  </CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Users</CardDescription>
                {metricsLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Users className="h-6 w-6 text-amber-500" />
                    {metrics?.totalUsers || 0}
                  </CardTitle>
                )}
              </CardHeader>
            </Card>
          </div>

          {/* Tenant Breakdown */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Tenant Status</CardTitle>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Active</span>
                      <Badge className="bg-green-100 text-green-700">{metrics?.activeTenants || 0}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Trial</span>
                      <Badge className="bg-blue-100 text-blue-700">{metrics?.trialTenants || 0}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Churned</span>
                      <Badge className="bg-gray-100 text-gray-700">{metrics?.churnedTenants || 0}</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Platform Usage</CardTitle>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Total Calls Graded</span>
                      <span className="font-bold">{(metrics?.totalCalls || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Avg Calls per Tenant</span>
                      <span className="font-bold">{metrics?.avgCallsPerTenant || 0}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tenants" className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Tenants Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-8" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredTenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No tenants found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTenants.map((tenant) => {
                    const planPrices: Record<string, number> = {
                      starter: 99,
                      growth: 249,
                      scale: 499,
                    };
                    const mrr = tenant.subscriptionStatus === 'active' 
                      ? planPrices[tenant.subscriptionTier || 'starter'] || 0 
                      : 0;
                    
                    return (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{tenant.name}</div>
                            <div className="text-sm text-muted-foreground">{tenant.slug}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getPlanBadge(tenant.subscriptionTier)}</TableCell>
                        <TableCell>{getStatusBadge(tenant.subscriptionStatus)}</TableCell>
                        <TableCell>{tenant.userCount}</TableCell>
                        <TableCell>{(tenant.callCount || 0).toLocaleString()}</TableCell>
                        <TableCell>${mrr}</TableCell>
                        <TableCell>{new Date(tenant.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleImpersonate(tenant.id)}
                            disabled={startImpersonation.isPending}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View as Tenant
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Plan</CardTitle>
            </CardHeader>
            <CardContent>
              {tenantsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {['starter', 'growth', 'scale'].map((plan) => {
                    const planPrices: Record<string, number> = {
                      starter: 99,
                      growth: 249,
                      scale: 499,
                    };
                    const tenantsOnPlan = (tenants || []).filter(
                      t => t.subscriptionTier === plan && t.subscriptionStatus === 'active'
                    );
                    const revenue = tenantsOnPlan.length * planPrices[plan];
                    
                    return (
                      <div key={plan} className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {getPlanBadge(plan)}
                          <span className="text-muted-foreground">({tenantsOnPlan.length} tenants)</span>
                        </div>
                        <span className="font-bold">${revenue}/mo</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest signups, upgrades, and cancellations</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-3/4 mb-2" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (recentActivity || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No recent activity
                </div>
              ) : (
                <div className="space-y-4">
                  {(recentActivity || []).map((activity) => (
                    <div key={activity.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{activity.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatTimeAgo(activity.timestamp)}
                        </p>
                      </div>
                      {activity.plan && activity.plan !== 'trial' && (
                        <Badge variant="outline" className="capitalize">{activity.plan}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="churn-risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-500 rotate-180" />
                Low Usage Tenants (Churn Risk)
              </CardTitle>
              <CardDescription>
                Tenants with no call activity in the last 7+ days. Send re-engagement emails to bring them back.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lowUsageLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !lowUsageTenants || lowUsageTenants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No low-usage tenants detected</p>
                  <p className="text-sm">All active tenants have recent activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lowUsageTenants.map((tenant) => (
                    <div
                      key={tenant.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          tenant.daysSinceLastCall >= 14 ? 'bg-red-100' : 'bg-amber-100'
                        }`}>
                          <Clock className={`h-5 w-5 ${
                            tenant.daysSinceLastCall >= 14 ? 'text-red-600' : 'text-amber-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium">{tenant.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {tenant.userCount} users · {tenant.totalCalls} total calls
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={`font-medium ${
                            tenant.daysSinceLastCall >= 14 ? 'text-red-600' : 'text-amber-600'
                          }`}>
                            {tenant.daysSinceLastCall} days inactive
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last activity: {new Date(tenant.lastActivityDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="outline" className={`${
                          tenant.subscriptionTier === 'trial' ? 'border-blue-200 text-blue-700' : ''
                        }`}>
                          {tenant.subscriptionTier}
                        </Badge>
                        {outreachSent.has(tenant.id) ? (
                          <Button variant="outline" size="sm" disabled className="text-green-600">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Sent
                          </Button>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleSendOutreach(tenant.id)}
                            disabled={sendingOutreach === tenant.id}
                          >
                            {sendingOutreach === tenant.id ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Mail className="h-4 w-4 mr-1" />
                                Send Outreach
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Churn Risk Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>7-13 Days Inactive</CardDescription>
                <CardTitle className="text-2xl text-amber-600">
                  {lowUsageTenants?.filter(t => t.daysSinceLastCall >= 7 && t.daysSinceLastCall < 14).length || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Moderate risk - consider outreach</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>14-30 Days Inactive</CardDescription>
                <CardTitle className="text-2xl text-orange-600">
                  {lowUsageTenants?.filter(t => t.daysSinceLastCall >= 14 && t.daysSinceLastCall < 30).length || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">High risk - urgent outreach needed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>30+ Days Inactive</CardDescription>
                <CardTitle className="text-2xl text-red-600">
                  {lowUsageTenants?.filter(t => t.daysSinceLastCall >= 30).length || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Critical - likely to churn</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="outreach-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Outreach History
              </CardTitle>
              <CardDescription>
                Track all re-engagement emails sent to tenants at risk of churning
              </CardDescription>
            </CardHeader>
            <CardContent>
              {outreachLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !outreachHistory || outreachHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No outreach emails sent yet</p>
                  <p className="text-sm">Send re-engagement emails from the Churn Risk tab</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Days Inactive</TableHead>
                      <TableHead>Sent By</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Reactivated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outreachHistory.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.tenantName || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            record.templateType === '30_day' ? 'bg-red-100 text-red-700' :
                            record.templateType === '14_day' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          }>
                            {record.templateType === '7_day' ? '7-Day Gentle' :
                             record.templateType === '14_day' ? '14-Day Urgent' :
                             record.templateType === '30_day' ? '30-Day Win-back' :
                             record.templateType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{record.recipientName || 'Unknown'}</p>
                            <p className="text-sm text-muted-foreground">{record.recipientEmail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono">{record.daysInactive} days</span>
                        </TableCell>
                        <TableCell>
                          {record.sentByName || 'System'}
                        </TableCell>
                        <TableCell>
                          {formatTimeAgo(record.createdAt)}
                        </TableCell>
                        <TableCell>
                          {record.tenantReactivated === 'true' ? (
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plans Management Tab */}
        <TabsContent value="plans" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Subscription Plans
                  </CardTitle>
                  <CardDescription>
                    Manage pricing plans, trial periods, and features
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {(!plans || plans.length === 0) && (
                    <Button
                      variant="outline"
                      onClick={() => seedDefaultPlans.mutate()}
                      disabled={seedDefaultPlans.isPending}
                    >
                      {seedDefaultPlans.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Seed Default Plans
                    </Button>
                  )}
                  <Button onClick={() => { resetPlanForm(); setShowNewPlanForm(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Plan
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {plansLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : !plans || plans.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No plans configured</p>
                  <p className="text-sm">Click "Seed Default Plans" to create starter, growth, and scale plans</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`border rounded-lg p-4 ${plan.isActive === "false" ? "opacity-50 bg-gray-50" : ""} ${plan.isPopular === "true" ? "border-primary ring-1 ring-primary" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">{plan.name}</h3>
                            {plan.isPopular === "true" && (
                              <Badge className="bg-primary text-primary-foreground">
                                <Star className="h-3 w-3 mr-1" />
                                Popular
                              </Badge>
                            )}
                            {plan.isActive === "false" && (
                              <Badge variant="outline" className="text-gray-500">Inactive</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Monthly Price</p>
                              <p className="font-semibold">${(plan.priceMonthly / 100).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Yearly Price</p>
                              <p className="font-semibold">${((plan.priceYearly || 0) / 100).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Trial Days</p>
                              <p className="font-semibold">{plan.trialDays || 14} days</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Max Users</p>
                              <p className="font-semibold">{plan.maxUsers >= 999 ? "Unlimited" : plan.maxUsers}</p>
                            </div>
                          </div>
                          
                          {plan.features && plan.features.length > 0 && (
                            <div className="mt-4">
                              <p className="text-xs text-muted-foreground mb-2">Features</p>
                              <div className="flex flex-wrap gap-1">
                                {plan.features.map((feature: string, idx: number) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    <Check className="h-3 w-3 mr-1" />
                                    {feature}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditPlan(plan)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete the ${plan.name} plan?`)) {
                                deletePlan.mutate({ id: plan.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plan Edit/Create Form */}
          {(showNewPlanForm || editingPlan) && (
            <Card>
              <CardHeader>
                <CardTitle>{editingPlan ? "Edit Plan" : "Create New Plan"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Plan Name</label>
                    <Input
                      value={planFormData.name}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Starter"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Plan Code</label>
                    <Input
                      value={planFormData.code}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, code: e.target.value.toLowerCase() }))}
                      placeholder="e.g., starter"
                      disabled={!!editingPlan}
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    value={planFormData.description}
                    onChange={(e) => setPlanFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of the plan"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium">Monthly Price ($)</label>
                    <Input
                      type="number"
                      value={planFormData.priceMonthly / 100}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, priceMonthly: Math.round(parseFloat(e.target.value) * 100) }))}
                      placeholder="99.00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Yearly Price ($)</label>
                    <Input
                      type="number"
                      value={planFormData.priceYearly / 100}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, priceYearly: Math.round(parseFloat(e.target.value) * 100) }))}
                      placeholder="990.00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Trial Days</label>
                    <Input
                      type="number"
                      value={planFormData.trialDays}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, trialDays: parseInt(e.target.value) || 0 }))}
                      placeholder="14"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Max Users</label>
                    <Input
                      type="number"
                      value={planFormData.maxUsers}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, maxUsers: parseInt(e.target.value) || 1 }))}
                      placeholder="3"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Max Graded Calls/Month (-1 for unlimited)</label>
                    <Input
                      type="number"
                      value={planFormData.maxCallsPerMonth}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, maxCallsPerMonth: parseInt(e.target.value) }))}
                      placeholder="500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Sort Order</label>
                    <Input
                      type="number"
                      value={planFormData.sortOrder}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Stripe Monthly Price ID</label>
                    <Input
                      value={planFormData.stripePriceIdMonthly}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, stripePriceIdMonthly: e.target.value }))}
                      placeholder="price_xxxxx"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From Stripe Dashboard → Products</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Stripe Yearly Price ID</label>
                    <Input
                      value={planFormData.stripePriceIdYearly}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, stripePriceIdYearly: e.target.value }))}
                      placeholder="price_xxxxx"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Optional - for annual billing</p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Features</label>
                  <p className="text-xs text-muted-foreground mt-1">Select the features included in this plan. Hover over each feature for details.</p>
                  <TooltipProvider>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      {[
                        { id: 'call_grading', label: 'AI Call Grading', description: 'Automatically analyze and score sales calls using AI. Provides instant feedback on pitch quality, objection handling, and closing techniques.' },
                        { id: 'advanced_analytics', label: 'Advanced Analytics', description: 'Deep dive into call performance metrics, trends over time, and team comparisons. Includes conversion rate tracking and revenue attribution.' },
                        { id: 'team_dashboard', label: 'Team Dashboard', description: 'Centralized view of all team members\' performance. Track individual progress, identify top performers, and spot coaching opportunities.' },
                        { id: 'custom_rubrics', label: 'Custom Rubrics', description: 'Create your own scoring criteria tailored to your sales process. Define what matters most for your team\'s success.' },
                        { id: 'training_materials', label: 'Training Materials', description: 'Access to curated sales training content, best practice guides, and example calls from top performers.' },
                        { id: 'api_access', label: 'API Access', description: 'Programmatic access to call data and analytics. Build custom integrations or export data to your own systems.' },
                        { id: 'priority_support', label: 'Priority Support', description: 'Skip the queue with dedicated support channels. Get faster response times and access to senior support specialists.' },
                        { id: 'custom_branding', label: 'Custom Branding', description: 'White-label the platform with your company logo, colors, and domain. Perfect for agencies and enterprises.' },
                        { id: 'crm_integration', label: 'CRM Integration', description: 'Connect with GoHighLevel to automatically sync contacts, calls, and deal data. Streamline your workflow.' },
                        { id: 'multi_crm', label: 'Multiple CRM Integrations', description: 'Connect multiple CRM instances or different CRM platforms. Ideal for agencies managing multiple client accounts.' },
                        { id: 'unlimited_users', label: 'Unlimited Users', description: 'No cap on team size. Add as many sales reps, managers, and admins as you need without per-seat charges.' },
                        { id: 'call_recording', label: 'Call Recording Storage', description: 'Store and access call recordings for review and training. Includes searchable transcripts and highlight clips.' },
                        { id: 'coaching_insights', label: 'Coaching Insights', description: 'AI-powered recommendations for improving each rep\'s performance. Personalized coaching tips based on call analysis.' },
                        { id: 'leaderboards', label: 'Team Leaderboards', description: 'Gamify performance with competitive rankings. Track daily, weekly, and monthly leaders across key metrics.' },
                        { id: 'export_reports', label: 'Export Reports', description: 'Download detailed reports in PDF or CSV format. Share insights with stakeholders or archive for compliance.' },
                        { id: 'white_label', label: 'White Label', description: 'Fully rebrand the entire platform as your own. Remove all Gunner branding for a seamless client experience.' },
                      ].map((feature) => (
                        <Tooltip key={feature.id}>
                          <TooltipTrigger asChild>
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors">
                              <input
                                type="checkbox"
                                checked={planFormData.features.includes(feature.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPlanFormData(prev => ({ ...prev, features: [...prev.features, feature.id] }));
                                  } else {
                                    setPlanFormData(prev => ({ ...prev, features: prev.features.filter(f => f !== feature.id) }));
                                  }
                                }}
                                className="rounded"
                              />
                              <span className="text-sm">{feature.label}</span>
                            </label>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-sm">{feature.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </TooltipProvider>
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={planFormData.isPopular}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, isPopular: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Mark as Popular</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={planFormData.isActive}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Active</span>
                  </label>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleSavePlan}
                    disabled={createPlan.isPending || updatePlan.isPending}
                  >
                    {(createPlan.isPending || updatePlan.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingPlan ? "Update Plan" : "Create Plan"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowNewPlanForm(false);
                      setEditingPlan(null);
                      resetPlanForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Attention Required
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tenantsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Past Due Tenants */}
                  {(tenants || []).filter(t => t.subscriptionStatus === 'past_due').map((tenant) => (
                    <div key={tenant.id} className="flex items-center justify-between p-4 border rounded-lg bg-red-50">
                      <div>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-sm text-red-600">Payment past due</div>
                      </div>
                      <Button size="sm" variant="outline">Contact</Button>
                    </div>
                  ))}
                  
                  {/* Trial Expiring Soon */}
                  {(tenants || []).filter(t => {
                    if (t.subscriptionTier !== 'trial' || !t.trialEndsAt) return false;
                    const daysLeft = Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return daysLeft <= 3 && daysLeft > 0;
                  }).map((tenant) => (
                    <div key={tenant.id} className="flex items-center justify-between p-4 border rounded-lg bg-amber-50">
                      <div>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-sm text-amber-600">Trial expiring soon</div>
                      </div>
                      <Button size="sm" variant="outline">Reach Out</Button>
                    </div>
                  ))}

                  {/* No alerts */}
                  {(tenants || []).filter(t => t.subscriptionStatus === 'past_due').length === 0 &&
                   (tenants || []).filter(t => {
                    if (t.subscriptionTier !== 'trial' || !t.trialEndsAt) return false;
                    const daysLeft = Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return daysLeft <= 3 && daysLeft > 0;
                   }).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No alerts at this time
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emails" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Sequence Management
                  </CardTitle>
                  <CardDescription>
                    Manage automated email sequences for trial conversion and engagement
                  </CardDescription>
                </div>
                <Button
                  onClick={() => triggerEmailSequence.mutate()}
                  disabled={triggerEmailSequence.isPending}
                >
                  {triggerEmailSequence.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Run Email Sequence Now
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Email Sequence Info */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="bg-muted/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Time-Based Emails</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span>Day 0</span>
                        <span className="text-muted-foreground">Welcome Email</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Day 1</span>
                        <span className="text-muted-foreground">Check-in</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Day 2</span>
                        <span className="text-muted-foreground">Trial Ending (trial users)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Day 3</span>
                        <span className="text-muted-foreground">Final Reminder (trial users)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Day 4</span>
                        <span className="text-muted-foreground">Paid Welcome (converted)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Day 7</span>
                        <span className="text-muted-foreground">Week 1 Recap</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Day 10</span>
                        <span className="text-muted-foreground">Feature Spotlight</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Day 14</span>
                        <span className="text-muted-foreground">Two-Week Check-in</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Trigger-Based Emails</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span>No Calls 48h</span>
                        <span className="text-muted-foreground">Re-engagement prompt</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Power User</span>
                        <span className="text-muted-foreground">10+ calls in first week</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Payment Failed</span>
                        <span className="text-muted-foreground">Dunning sequence</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800">Automated Daily Processing</p>
                      <p className="text-sm text-amber-700 mt-1">
                        The email sequence runs automatically every day at 9 AM CST. Use the "Run Email Sequence Now" 
                        button to manually trigger processing for testing or to catch up after maintenance.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
