import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Building2, 
  CreditCard, 
  Users, 
  Link2, 
  FileText, 
  Settings,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";

// Mock data for demonstration
const MOCK_TENANT = {
  id: 1,
  name: "New Again Houses",
  slug: "nah",
  domain: null,
  plan: "scale",
  status: "active",
  trialEndsAt: null,
  stripeCustomerId: "cus_xxx",
  stripeSubscriptionId: "sub_xxx",
};

const MOCK_TEAM = [
  { id: 1, name: "Corey Lavinder", email: "corey@newagainhouses.com", role: "admin", status: "active" },
  { id: 2, name: "John Smith", email: "john@newagainhouses.com", role: "manager", status: "active" },
  { id: 3, name: "Jane Doe", email: "jane@newagainhouses.com", role: "member", status: "active" },
  { id: 4, name: "Mike Johnson", email: "mike@newagainhouses.com", role: "member", status: "pending" },
];

const MOCK_RUBRICS = [
  { id: 1, name: "Cold Call Rubric", categories: 5, isDefault: true },
  { id: 2, name: "Follow-up Call Rubric", categories: 4, isDefault: false },
];

export default function TenantSettings() {
  const [activeTab, setActiveTab] = useState("general");
  const [companyName, setCompanyName] = useState(MOCK_TENANT.name);
  const [inviteEmail, setInviteEmail] = useState("");

  const handleSaveGeneral = () => {
    toast.success("Company settings saved");
  };

  const handleInviteTeamMember = () => {
    if (!inviteEmail) {
      toast.error("Please enter an email address");
      return;
    }
    toast.success(`Invitation sent to ${inviteEmail}`);
    setInviteEmail("");
  };

  const handleManageBilling = () => {
    toast.info("Redirecting to Stripe billing portal...");
    // In production, this would create a Stripe billing portal session
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Company Settings</h1>
        <p className="text-muted-foreground">Manage your organization's settings and team</p>
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
                  <Input value={`gunner.app/${MOCK_TENANT.slug}`} disabled />
                  <Button variant="outline" size="icon">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button onClick={handleSaveGeneral}>Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom Domain</CardTitle>
              <CardDescription>Use your own domain for Gunner (Scale plan only)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customDomain">Custom Domain</Label>
                <Input
                  id="customDomain"
                  placeholder="coaching.yourcompany.com"
                  disabled={MOCK_TENANT.plan !== "scale"}
                />
              </div>
              {MOCK_TENANT.plan !== "scale" && (
                <p className="text-sm text-muted-foreground">
                  Upgrade to Scale plan to use a custom domain
                </p>
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
                  {MOCK_TEAM.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {member.status === "active" ? (
                          <Badge className="bg-green-100 text-green-700">Active</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <div className="font-medium text-lg capitalize">{MOCK_TENANT.plan} Plan</div>
                  <div className="text-sm text-muted-foreground">
                    {MOCK_TENANT.plan === "starter" && "$99/month"}
                    {MOCK_TENANT.plan === "growth" && "$249/month"}
                    {MOCK_TENANT.plan === "scale" && "$499/month"}
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-700">Active</Badge>
              </div>
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleManageBilling}>
                  Manage Billing
                </Button>
                <Button variant="outline">View Invoices</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>Your current usage this billing period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>Team Members</span>
                  <span className="font-medium">
                    {MOCK_TEAM.length} / {MOCK_TENANT.plan === "starter" ? 3 : MOCK_TENANT.plan === "growth" ? 10 : "Unlimited"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Calls Graded (This Month)</span>
                  <span className="font-medium">247</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>CRM Integrations</span>
                  <span className="font-medium">
                    1 / {MOCK_TENANT.plan === "starter" ? 1 : MOCK_TENANT.plan === "growth" ? 2 : 5}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CRM Integrations */}
        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connected CRM</CardTitle>
              <CardDescription>Manage your CRM integration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Link2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">GoHighLevel</div>
                    <div className="text-sm text-muted-foreground">Connected</div>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-700">Active</Badge>
              </div>
              <div className="space-y-2">
                <Label>GHL Location ID</Label>
                <Input value="abc123xyz" disabled />
              </div>
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input value="https://gunner.app/api/webhook/ghl" disabled />
                <p className="text-xs text-muted-foreground">
                  Add this URL to your GHL workflow to automatically sync calls
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sync Settings</CardTitle>
              <CardDescription>Configure how calls are synced</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Auto-sync new calls</div>
                  <div className="text-sm text-muted-foreground">
                    Automatically import and grade new calls
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Sync call recordings</div>
                  <div className="text-sm text-muted-foreground">
                    Download and store call audio files
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Grading Rubrics */}
        <TabsContent value="rubrics" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Grading Rubrics</CardTitle>
                <CardDescription>Customize how calls are evaluated</CardDescription>
              </div>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Rubric
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_RUBRICS.map((rubric) => (
                    <TableRow key={rubric.id}>
                      <TableCell className="font-medium">{rubric.name}</TableCell>
                      <TableCell>{rubric.categories}</TableCell>
                      <TableCell>
                        {rubric.isDefault ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
