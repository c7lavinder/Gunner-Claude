import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  CheckCircle
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

  // Fetch real data from backend
  const { data: tenants, isLoading: tenantsLoading, refetch: refetchTenants } = trpc.tenant.list.useQuery();
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = trpc.tenant.getMetrics.useQuery();
  const { data: recentActivity, isLoading: activityLoading, refetch: refetchActivity } = trpc.tenant.getRecentActivity.useQuery();
  const { data: lowUsageTenants, isLoading: lowUsageLoading, refetch: refetchLowUsage } = trpc.tenant.getLowUsageTenants.useQuery();
  const { data: impersonationStatus } = trpc.tenant.getImpersonationStatus.useQuery();

  // Mutations
  const startImpersonation = trpc.tenant.startImpersonation.useMutation({
    onSuccess: () => {
      toast.success("Now viewing as tenant");
      refetchAuth();
      setLocation("/");
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
            <Button onClick={() => setLocation("/")}>Back to Dashboard</Button>
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
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
