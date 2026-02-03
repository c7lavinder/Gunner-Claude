import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Building2, 
  DollarSign, 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  Search,
  MoreHorizontal,
  Eye,
  ArrowLeft
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// Mock data for demonstration
const MOCK_TENANTS = [
  {
    id: 1,
    name: "New Again Houses",
    slug: "nah",
    plan: "scale",
    status: "active",
    users: 8,
    calls: 1250,
    mrr: 499,
    createdAt: "2024-01-15",
  },
  {
    id: 2,
    name: "Acme Real Estate",
    slug: "acme",
    plan: "growth",
    status: "active",
    users: 5,
    calls: 450,
    mrr: 249,
    createdAt: "2024-02-01",
  },
  {
    id: 3,
    name: "Quick Flip Properties",
    slug: "quickflip",
    plan: "starter",
    status: "trial",
    users: 2,
    calls: 85,
    mrr: 0,
    createdAt: "2024-02-10",
  },
  {
    id: 4,
    name: "Metro Investors",
    slug: "metro",
    plan: "growth",
    status: "past_due",
    users: 7,
    calls: 320,
    mrr: 249,
    createdAt: "2024-01-20",
  },
];

const MOCK_METRICS = {
  totalMrr: 997,
  totalArr: 11964,
  totalTenants: 4,
  activeTenants: 3,
  trialTenants: 1,
  churnedTenants: 0,
  totalUsers: 22,
  totalCalls: 2105,
  avgCallsPerTenant: 526,
};

export default function SuperAdmin() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  // Check if user is super admin or platform owner
  // Platform owner is identified by OWNER_OPEN_ID env variable
  const isPlatformOwner = user?.openId === "U3JEthPNs4UbYRrgRBbShj"; // Corey's openId
  const isSuperAdmin = user?.role === "super_admin" || isPlatformOwner;
  
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the Super Admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredTenants = MOCK_TENANTS.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
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
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case "starter":
        return <Badge variant="outline">Starter</Badge>;
      case "growth":
        return <Badge className="bg-purple-100 text-purple-700">Growth</Badge>;
      case "scale":
        return <Badge className="bg-amber-100 text-amber-700">Scale</Badge>;
      default:
        return <Badge variant="outline">{plan}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
            <p className="text-muted-foreground">Platform-wide metrics and tenant management</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Monthly Recurring Revenue</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <DollarSign className="h-6 w-6 text-green-500" />
                  ${MOCK_METRICS.totalMrr.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Annual Recurring Revenue</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <TrendingUp className="h-6 w-6 text-blue-500" />
                  ${MOCK_METRICS.totalArr.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Tenants</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <Building2 className="h-6 w-6 text-purple-500" />
                  {MOCK_METRICS.totalTenants}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Users</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <Users className="h-6 w-6 text-amber-500" />
                  {MOCK_METRICS.totalUsers}
                </CardTitle>
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
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Active</span>
                    <Badge className="bg-green-100 text-green-700">{MOCK_METRICS.activeTenants}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Trial</span>
                    <Badge className="bg-blue-100 text-blue-700">{MOCK_METRICS.trialTenants}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Churned</span>
                    <Badge className="bg-gray-100 text-gray-700">{MOCK_METRICS.churnedTenants}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Platform Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Total Calls Graded</span>
                    <span className="font-bold">{MOCK_METRICS.totalCalls.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Avg Calls per Tenant</span>
                    <span className="font-bold">{MOCK_METRICS.avgCallsPerTenant}</span>
                  </div>
                </div>
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-sm text-muted-foreground">{tenant.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell>{getPlanBadge(tenant.plan)}</TableCell>
                    <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                    <TableCell>{tenant.users}</TableCell>
                    <TableCell>{tenant.calls.toLocaleString()}</TableCell>
                    <TableCell>${tenant.mrr}</TableCell>
                    <TableCell>{tenant.createdAt}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="font-medium">Starter ($99/mo)</div>
                    <div className="text-sm text-muted-foreground">1 tenant</div>
                  </div>
                  <div className="text-xl font-bold">$0</div>
                </div>
                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="font-medium">Growth ($249/mo)</div>
                    <div className="text-sm text-muted-foreground">2 tenants</div>
                  </div>
                  <div className="text-xl font-bold">$498</div>
                </div>
                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="font-medium">Scale ($499/mo)</div>
                    <div className="text-sm text-muted-foreground">1 tenant</div>
                  </div>
                  <div className="text-xl font-bold">$499</div>
                </div>
              </div>
            </CardContent>
          </Card>
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
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                  <div>
                    <div className="font-medium text-red-700">Payment Failed</div>
                    <div className="text-sm text-red-600">
                      Metro Investors - Last payment failed 3 days ago
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <div className="font-medium text-amber-700">Trial Ending Soon</div>
                    <div className="text-sm text-amber-600">
                      Quick Flip Properties - Trial ends in 4 days
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
