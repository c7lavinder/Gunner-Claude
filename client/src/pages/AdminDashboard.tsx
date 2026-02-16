import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Building2, 
  Users, 
  Phone, 
  TrendingUp, 
  Search,
  RefreshCw,
  Eye,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Trash2,
  Activity,
  Zap,
  UserCheck,
  LogOut,
  CreditCard,
  Edit,
  Plus,
  DollarSign,
  Star,
} from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface SubscriptionPlan {
  id: number;
  name: string;
  code: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  trialDays: number;
  maxUsers: number;
  maxCallsPerMonth: number;
  maxCrmIntegrations: number | null;
  features: string[];
  isPopular: string | null;
  isActive: string | null;
  sortOrder: number | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
}

export default function AdminDashboard() {
  const { user, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState("overview");
  const [mainTab, setMainTab] = useState("tenants");
  
  // Plan editing state
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);

  // Fetch admin stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.admin.getStats.useQuery();
  
  // Fetch all tenants
  const { data: tenants, isLoading: tenantsLoading, refetch: refetchTenants } = trpc.admin.getTenants.useQuery({
    search: searchTerm || undefined,
  });

  // Fetch tenant details
  const { data: tenantDetails, isLoading: detailsLoading } = trpc.admin.getTenantDetails.useQuery(
    { tenantId: selectedTenant! },
    { enabled: !!selectedTenant }
  );

  // Usage analytics query
  const { data: usageAnalytics, refetch: refetchUsage } = trpc.admin.getUsageAnalytics.useQuery();

  // Plans query
  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = trpc.admin.getPlans.useQuery();

  // Update tenant mutation
  const updateTenant = trpc.admin.updateTenant.useMutation({
    onSuccess: () => {
      toast.success("Tenant updated successfully");
      refetchTenants();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  // Delete tenant mutation
  const deleteTenant = trpc.admin.deleteTenant.useMutation({
    onSuccess: (data) => {
      toast.success(`Tenant "${data.deletedTenant}" deleted successfully`);
      setSelectedTenant(null);
      refetchTenants();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  // Start impersonation mutation
  const startImpersonation = trpc.admin.startImpersonation.useMutation({
    onSuccess: (data) => {
      // Store impersonation data in localStorage
      localStorage.setItem('gunner_impersonation', JSON.stringify(data.impersonation));
      toast.success(`Now viewing as ${data.impersonation.targetTenantName}`);
      // Refresh auth and redirect to dashboard
      refresh();
      setLocation('/dashboard');
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  // Update plan mutation
  const updatePlan = trpc.admin.updatePlan.useMutation({
    onSuccess: () => {
      toast.success("Plan updated successfully");
      refetchPlans();
      setPlanDialogOpen(false);
      setEditingPlan(null);
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  // Seed default plans mutation
  const seedDefaultPlans = trpc.admin.seedDefaultPlans.useMutation({
    onSuccess: () => {
      toast.success("Default plans seeded successfully");
      refetchPlans();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  // Stop impersonation mutation - clears session cookie on backend
  const stopImpersonationMutation = trpc.admin.stopImpersonation.useMutation({
    onSuccess: () => {
      localStorage.removeItem('gunner_impersonation');
      toast.success('Impersonation ended');
      window.location.reload();
    },
    onError: () => {
      // Even if backend fails, clear localStorage and reload
      localStorage.removeItem('gunner_impersonation');
      window.location.reload();
    },
  });
  // Handle stop impersonation
  const handleStopImpersonation = () => {
    stopImpersonationMutation.mutate();
  };

  // Check if currently impersonating
  const impersonationData = (() => {
    try {
      const data = localStorage.getItem('gunner_impersonation');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  })();

  // Check if user is super admin
  if (user?.role !== "super_admin") {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You don't have permission to access the admin dashboard.
              This area is restricted to platform administrators.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      active: { variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
      trial: { variant: "secondary", icon: <Clock className="h-3 w-3" /> },
      past_due: { variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
      canceled: { variant: "outline", icon: <XCircle className="h-3 w-3" /> },
      paused: { variant: "outline", icon: <Clock className="h-3 w-3" /> },
    };
    const config = variants[status] || variants.active;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {status}
      </Badge>
    );
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      trial: "bg-gray-100 text-gray-800",
      starter: "bg-blue-100 text-blue-800",
      growth: "bg-green-100 text-green-800",
      scale: "bg-purple-100 text-purple-800",
    };
    return (
      <Badge className={colors[tier] || colors.trial}>
        {tier}
      </Badge>
    );
  };

  const handleSavePlan = () => {
    if (!editingPlan) return;
    
    updatePlan.mutate({
      id: editingPlan.id,
      name: editingPlan.name,
      description: editingPlan.description || undefined,
      priceMonthly: editingPlan.priceMonthly,
      priceYearly: editingPlan.priceYearly || undefined,
      trialDays: editingPlan.trialDays,
      maxUsers: editingPlan.maxUsers,
      maxCallsPerMonth: editingPlan.maxCallsPerMonth,
      maxCrmIntegrations: editingPlan.maxCrmIntegrations || undefined,
      features: editingPlan.features,
      isPopular: editingPlan.isPopular === "true",
      isActive: editingPlan.isActive === "true",
      sortOrder: editingPlan.sortOrder || undefined,
      stripePriceIdMonthly: editingPlan.stripePriceIdMonthly || undefined,
      stripePriceIdYearly: editingPlan.stripePriceIdYearly || undefined,
    });
  };

  return (
    <div className="container py-8 space-y-8">
      {/* Impersonation Banner */}
      {impersonationData && (
        <div className="bg-amber-100 border border-amber-300 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">
                Currently viewing as: {impersonationData.targetTenantName}
              </p>
              <p className="text-sm text-amber-600">
                User: {impersonationData.targetUserName} ({impersonationData.targetUserEmail})
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleStopImpersonation}
            className="border-amber-300 text-amber-800 hover:bg-amber-200"
          >
            <LogOut className="h-4 w-4 mr-2" />
            End Impersonation
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage tenants and monitor platform health</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => {
            refetchStats();
            refetchTenants();
            refetchPlans();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTenants || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeTenants || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              Across all tenants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCalls || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.gradedCalls || 0} graded
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Revenue (MRR)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${((stats?.monthlyRevenue || 0) / 100).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Monthly recurring
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="tenants" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Usage
          </TabsTrigger>
        </TabsList>

        {/* Tenants Tab */}
        <TabsContent value="tenants">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tenants</CardTitle>
                  <CardDescription>Manage all platform tenants</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tenants..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                  <Button onClick={() => setLocation("/admin/tenant-setup")}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Tenant Setup
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tenantsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants?.map((tenant: any) => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{tenant.name}</div>
                            <div className="text-sm text-muted-foreground">{tenant.slug}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(tenant.subscriptionStatus || "active")}</TableCell>
                        <TableCell>{getTierBadge(tenant.subscriptionTier || "trial")}</TableCell>
                        <TableCell>{tenant.userCount}</TableCell>
                        <TableCell>{tenant.callCount}</TableCell>
                        <TableCell>
                          {tenant.createdAt ? formatDistanceToNow(new Date(tenant.createdAt), { addSuffix: true }) : "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startImpersonation.mutate({ tenantId: tenant.id })}
                              disabled={startImpersonation.isPending}
                              title="View as this tenant"
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                            <Dialog open={dialogOpen && selectedTenant === tenant.id} onOpenChange={(open) => {
                              setDialogOpen(open);
                              if (!open) setSelectedTenant(null);
                            }}>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTenant(tenant.id);
                                    setDefaultTab("overview");
                                    setDialogOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>{tenantDetails?.name || tenant.name}</DialogTitle>
                                  <DialogDescription>
                                    Tenant details and management
                                  </DialogDescription>
                                </DialogHeader>
                                <Tabs value={defaultTab} onValueChange={setDefaultTab}>
                                  <TabsList>
                                    <TabsTrigger value="overview">Overview</TabsTrigger>
                                    <TabsTrigger value="users">Users</TabsTrigger>
                                    <TabsTrigger value="settings">Settings</TabsTrigger>
                                  </TabsList>
                                  <TabsContent value="overview" className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-medium">Company Name</label>
                                        <p className="text-sm text-muted-foreground">{tenantDetails?.name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Slug</label>
                                        <p className="text-sm text-muted-foreground">{tenantDetails?.slug}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">CRM Type</label>
                                        <p className="text-sm text-muted-foreground">{tenantDetails?.crmType || "None"}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">CRM Connected</label>
                                        <p className="text-sm text-muted-foreground">{tenantDetails?.crmConnected === "true" ? "Yes" : "No"}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Onboarding</label>
                                        <p className="text-sm text-muted-foreground">
                                          {tenantDetails?.onboardingCompleted === "true" ? "Completed" : `Step ${tenantDetails?.onboardingStep}`}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Trial Ends</label>
                                        <p className="text-sm text-muted-foreground">
                                          {tenantDetails?.trialEndsAt 
                                            ? formatDistanceToNow(new Date(tenantDetails.trialEndsAt), { addSuffix: true })
                                            : "N/A"}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                                      <Card>
                                        <CardContent className="pt-4">
                                          <div className="text-2xl font-bold">{tenantDetails?.stats?.userCount || 0}</div>
                                          <p className="text-xs text-muted-foreground">Users</p>
                                        </CardContent>
                                      </Card>
                                      <Card>
                                        <CardContent className="pt-4">
                                          <div className="text-2xl font-bold">{tenantDetails?.stats?.callCount || 0}</div>
                                          <p className="text-xs text-muted-foreground">Total Calls</p>
                                        </CardContent>
                                      </Card>
                                      <Card>
                                        <CardContent className="pt-4">
                                          <div className="text-2xl font-bold">{tenantDetails?.stats?.gradedCallCount || 0}</div>
                                          <p className="text-xs text-muted-foreground">Graded Calls</p>
                                        </CardContent>
                                      </Card>
                                    </div>
                                  </TabsContent>
                                  <TabsContent value="users">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Name</TableHead>
                                          <TableHead>Email</TableHead>
                                          <TableHead>Role</TableHead>
                                          <TableHead>Last Active</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {tenantDetails?.users?.map((u: any) => (
                                          <TableRow key={u.id}>
                                            <TableCell>{u.name}</TableCell>
                                            <TableCell>{u.email}</TableCell>
                                            <TableCell>
                                              <Badge variant="outline">{u.teamRole}</Badge>
                                            </TableCell>
                                            <TableCell>
                                              {u.lastSignedIn 
                                                ? formatDistanceToNow(new Date(u.lastSignedIn), { addSuffix: true })
                                                : "Never"}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </TabsContent>
                                  <TabsContent value="settings" className="space-y-4">
                                    <div className="space-y-4">
                                      <div>
                                        <label className="text-sm font-medium">Subscription Tier</label>
                                        <Select
                                          value={tenantDetails?.subscriptionTier || "trial"}
                                          onValueChange={(value) => {
                                            updateTenant.mutate({
                                              tenantId: tenant.id,
                                              subscriptionTier: value as any,
                                            });
                                          }}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="trial">Trial</SelectItem>
                                            <SelectItem value="starter">Starter</SelectItem>
                                            <SelectItem value="growth">Growth</SelectItem>
                                            <SelectItem value="scale">Scale</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Subscription Status</label>
                                        <Select
                                          value={tenantDetails?.subscriptionStatus || "active"}
                                          onValueChange={(value) => {
                                            updateTenant.mutate({
                                              tenantId: tenant.id,
                                              subscriptionStatus: value as any,
                                            });
                                          }}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="past_due">Past Due</SelectItem>
                                            <SelectItem value="canceled">Canceled</SelectItem>
                                            <SelectItem value="paused">Paused</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Max Users</label>
                                        <Input
                                          type="number"
                                          value={tenantDetails?.maxUsers || 3}
                                          onChange={(e) => {
                                            updateTenant.mutate({
                                              tenantId: tenant.id,
                                              maxUsers: parseInt(e.target.value),
                                            });
                                          }}
                                          className="mt-1"
                                        />
                                      </div>
                                      
                                      {/* Danger Zone */}
                                      <div className="pt-6 border-t border-destructive/20">
                                        <h4 className="text-sm font-medium text-destructive mb-2">Danger Zone</h4>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" className="w-full">
                                              <Trash2 className="h-4 w-4 mr-2" />
                                              Delete Tenant
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                This will permanently delete <strong>{tenant.name}</strong> and all associated data including:
                                                <ul className="list-disc list-inside mt-2 space-y-1">
                                                  <li>All users ({tenant.userCount} users)</li>
                                                  <li>All calls and grades ({tenant.callCount} calls)</li>
                                                  <li>All training materials and settings</li>
                                                </ul>
                                                <p className="mt-2 text-destructive font-medium">This action cannot be undone.</p>
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => deleteTenant.mutate({ tenantId: tenant.id })}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                              >
                                                {deleteTenant.isPending ? "Deleting..." : "Delete Tenant"}
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    </div>
                                  </TabsContent>
                                </Tabs>
                              </DialogContent>
                            </Dialog>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setSelectedTenant(tenant.id);
                                setDefaultTab("settings");
                                setDialogOpen(true);
                              }}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Subscription Plans
                  </CardTitle>
                  <CardDescription>Manage pricing, features, and Stripe integration</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => seedDefaultPlans.mutate()}
                    disabled={seedDefaultPlans.isPending}
                  >
                    {seedDefaultPlans.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Seed Default Plans
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => refetchPlans()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {plansLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !plans || plans.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No plans configured yet. Click "Seed Default Plans" to create the default subscription tiers.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Monthly</TableHead>
                      <TableHead>Yearly</TableHead>
                      <TableHead>Trial</TableHead>
                      <TableHead>Limits</TableHead>
                      <TableHead>Stripe IDs</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((plan: SubscriptionPlan) => (
                      <TableRow key={plan.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{plan.name}</div>
                            {plan.isPopular === "true" && (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Star className="h-3 w-3" />
                                Popular
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{plan.code}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">${(plan.priceMonthly / 100).toFixed(0)}/mo</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">${((plan.priceYearly || 0) / 100).toFixed(0)}/yr</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{plan.trialDays} days</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{plan.maxUsers === 999 ? "Unlimited" : plan.maxUsers} users</div>
                            <div className="text-muted-foreground">
                              {plan.maxCallsPerMonth === -1 ? "Unlimited" : plan.maxCallsPerMonth} calls/mo
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {plan.stripePriceIdMonthly ? (
                              <Badge variant="default" className="mb-1">Monthly ✓</Badge>
                            ) : (
                              <Badge variant="outline" className="mb-1">Monthly ✗</Badge>
                            )}
                            <br />
                            {plan.stripePriceIdYearly ? (
                              <Badge variant="default">Yearly ✓</Badge>
                            ) : (
                              <Badge variant="outline">Yearly ✗</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {plan.isActive === "true" ? (
                            <Badge variant="default" className="flex items-center gap-1 w-fit">
                              <CheckCircle className="h-3 w-3" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="flex items-center gap-1 w-fit">
                              <XCircle className="h-3 w-3" />
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPlan(plan);
                              setPlanDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Plan Edit Dialog */}
          <Dialog open={planDialogOpen} onOpenChange={(open) => {
            setPlanDialogOpen(open);
            if (!open) setEditingPlan(null);
          }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Plan: {editingPlan?.name}</DialogTitle>
                <DialogDescription>
                  Update pricing, limits, and Stripe integration
                </DialogDescription>
              </DialogHeader>
              
              {editingPlan && (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h3 className="font-medium">Basic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Plan Name</Label>
                        <Input
                          id="name"
                          value={editingPlan.name}
                          onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="code">Plan Code</Label>
                        <Input
                          id="code"
                          value={editingPlan.code}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={editingPlan.description || ""}
                        onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Pricing
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="priceMonthly">Monthly Price (cents)</Label>
                        <Input
                          id="priceMonthly"
                          type="number"
                          value={editingPlan.priceMonthly}
                          onChange={(e) => setEditingPlan({ ...editingPlan, priceMonthly: parseInt(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-muted-foreground">
                          ${(editingPlan.priceMonthly / 100).toFixed(2)}/month
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceYearly">Yearly Price (cents)</Label>
                        <Input
                          id="priceYearly"
                          type="number"
                          value={editingPlan.priceYearly || 0}
                          onChange={(e) => setEditingPlan({ ...editingPlan, priceYearly: parseInt(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-muted-foreground">
                          ${((editingPlan.priceYearly || 0) / 100).toFixed(2)}/year
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="trialDays">Trial Days</Label>
                        <Input
                          id="trialDays"
                          type="number"
                          value={editingPlan.trialDays}
                          onChange={(e) => setEditingPlan({ ...editingPlan, trialDays: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Limits */}
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Limits
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="maxUsers">Max Users</Label>
                        <Input
                          id="maxUsers"
                          type="number"
                          value={editingPlan.maxUsers}
                          onChange={(e) => setEditingPlan({ ...editingPlan, maxUsers: parseInt(e.target.value) || 1 })}
                        />
                        <p className="text-xs text-muted-foreground">Use 999 for unlimited</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxCallsPerMonth">Max Graded Calls/Month</Label>
                        <Input
                          id="maxCallsPerMonth"
                          type="number"
                          value={editingPlan.maxCallsPerMonth}
                          onChange={(e) => setEditingPlan({ ...editingPlan, maxCallsPerMonth: parseInt(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-muted-foreground">Use -1 for unlimited</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxCrmIntegrations">Max CRM Integrations</Label>
                        <Input
                          id="maxCrmIntegrations"
                          type="number"
                          value={editingPlan.maxCrmIntegrations || 1}
                          onChange={(e) => setEditingPlan({ ...editingPlan, maxCrmIntegrations: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stripe Integration */}
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Stripe Integration
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="stripePriceIdMonthly">Monthly Stripe Price ID</Label>
                        <Input
                          id="stripePriceIdMonthly"
                          value={editingPlan.stripePriceIdMonthly || ""}
                          onChange={(e) => setEditingPlan({ ...editingPlan, stripePriceIdMonthly: e.target.value })}
                          placeholder="price_..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="stripePriceIdYearly">Yearly Stripe Price ID</Label>
                        <Input
                          id="stripePriceIdYearly"
                          value={editingPlan.stripePriceIdYearly || ""}
                          onChange={(e) => setEditingPlan({ ...editingPlan, stripePriceIdYearly: e.target.value })}
                          placeholder="price_..."
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get these IDs from your Stripe Dashboard → Products → Prices
                    </p>
                  </div>

                  {/* Features */}
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-medium">Features</h3>
                    <p className="text-sm text-muted-foreground">Select the features included in this plan</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'call_grading', label: 'AI Call Grading' },
                        { id: 'advanced_analytics', label: 'Advanced Analytics' },
                        { id: 'team_dashboard', label: 'Team Dashboard' },
                        { id: 'custom_rubrics', label: 'Custom Rubrics' },
                        { id: 'training_materials', label: 'Training Materials' },
                        { id: 'api_access', label: 'API Access' },
                        { id: 'priority_support', label: 'Priority Support' },
                        { id: 'custom_branding', label: 'Custom Branding' },
                        { id: 'crm_integration', label: 'CRM Integration' },
                        { id: 'multi_crm', label: 'Multiple CRM Integrations' },
                        { id: 'unlimited_users', label: 'Unlimited Users' },
                        { id: 'call_recording', label: 'Call Recording Storage' },
                        { id: 'coaching_insights', label: 'Coaching Insights' },
                        { id: 'leaderboards', label: 'Team Leaderboards' },
                        { id: 'export_reports', label: 'Export Reports' },
                        { id: 'white_label', label: 'White Label' },
                      ].map((feature) => (
                        <div key={feature.id} className="flex items-center gap-2">
                          <Checkbox
                            id={feature.id}
                            checked={editingPlan.features.includes(feature.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setEditingPlan({ ...editingPlan, features: [...editingPlan.features, feature.id] });
                              } else {
                                setEditingPlan({ ...editingPlan, features: editingPlan.features.filter(f => f !== feature.id) });
                              }
                            }}
                          />
                          <Label htmlFor={feature.id} className="text-sm font-normal cursor-pointer">{feature.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-medium">Status</h3>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="isActive"
                          checked={editingPlan.isActive === "true"}
                          onCheckedChange={(checked) => setEditingPlan({ ...editingPlan, isActive: checked ? "true" : "false" })}
                        />
                        <Label htmlFor="isActive">Active</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="isPopular"
                          checked={editingPlan.isPopular === "true"}
                          onCheckedChange={(checked) => setEditingPlan({ ...editingPlan, isPopular: checked ? "true" : "false" })}
                        />
                        <Label htmlFor="isPopular">Popular (highlighted)</Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSavePlan} disabled={updatePlan.isPending}>
                  {updatePlan.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    API Usage Analytics
                  </CardTitle>
                  <CardDescription>Track API usage per tenant (since server start)</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchUsage()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!usageAnalytics || usageAnalytics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No usage data yet. Usage tracking starts when tenants make API calls.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>AI Chat</TableHead>
                      <TableHead>Content Gen</TableHead>
                      <TableHead>Total Requests</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageAnalytics.map((item: { tenantId: number; tenantName: string; usage: Record<string, number>; totalRequests: number }) => (
                      <TableRow key={item.tenantId}>
                        <TableCell>
                          <div className="font-medium">{item.tenantName}</div>
                          <div className="text-xs text-muted-foreground">ID: {item.tenantId}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.usage.ai_chat || 0}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.usage.content_generation || 0}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.totalRequests}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
