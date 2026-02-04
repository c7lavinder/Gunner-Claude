import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null);

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

  return (
    <div className="container py-8 space-y-8">
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

      {/* Tenants Table */}
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
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedTenant(tenant.id)}
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
                            <Tabs defaultValue="overview">
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
                        <Button variant="ghost" size="sm">
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

      {/* Usage Analytics */}
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
    </div>
  );
}
