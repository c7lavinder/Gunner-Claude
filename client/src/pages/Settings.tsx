import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings as SettingsIcon,
  Building2,
  Link2,
  Users,
  Bell,
  CreditCard,
  Check,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import { useTenantConfig } from "@/hooks/useTenantConfig";

const MOCK_TEAM = [
  { id: 1, name: "Alex Rivera", email: "alex@company.com", role: "Lead Manager" },
  { id: 2, name: "Jordan Kim", email: "jordan@company.com", role: "Acquisition" },
  { id: 3, name: "Sam Chen", email: "sam@company.com", role: "Team Member" },
  { id: 4, name: "Taylor Moore", email: "taylor@company.com", role: "Admin" },
];

export function Settings() {
  const { roles } = useTenantConfig();
  const [companyName, setCompanyName] = useState("New Again Houses");
  const [industry, setIndustry] = useState("real-estate");
  const [timezone, setTimezone] = useState("America/New_York");
  const [apiKey, setApiKey] = useState("••••••••••••••••");
  const [locationId, setLocationId] = useState("hmD7eWGQJE7EVFpJxj4q");
  const [crmConnected, setCrmConnected] = useState<boolean | null>(true);
  const [emailDigest, setEmailDigest] = useState(true);
  const [gradeAlerts, setGradeAlerts] = useState(true);
  const [team, setTeam] = useState(MOCK_TEAM);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const testConnection = () => {
    setCrmConnected(null);
    setTimeout(() => setCrmConnected(true), 800);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--g-text-primary)" }}>
        <SettingsIcon className="size-6" style={{ color: "var(--g-accent-text)" }} />
        Settings
      </h1>
      <Tabs defaultValue="general" className="flex flex-col sm:flex-row gap-8">
        <TabsList className="flex flex-col h-auto w-full sm:w-48 flex-shrink-0 bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] p-1 rounded-xl">
          <TabsTrigger value="general" className="justify-start gap-2"><Building2 className="size-4" />General</TabsTrigger>
          <TabsTrigger value="crm" className="justify-start gap-2"><Link2 className="size-4" />CRM</TabsTrigger>
          <TabsTrigger value="team" className="justify-start gap-2"><Users className="size-4" />Team</TabsTrigger>
          <TabsTrigger value="notifications" className="justify-start gap-2"><Bell className="size-4" />Notifications</TabsTrigger>
          <TabsTrigger value="billing" className="justify-start gap-2"><CreditCard className="size-4" />Billing</TabsTrigger>
        </TabsList>
        <div className="flex-1 min-w-0">
          <TabsContent value="general" className="mt-0">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader><CardTitle>General</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Company name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-[var(--g-bg-surface)]" />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger className="w-full bg-[var(--g-bg-surface)]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="real-estate">Real Estate</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="solar">Solar</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="w-full bg-[var(--g-bg-surface)]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern</SelectItem>
                      <SelectItem value="America/Chicago">Central</SelectItem>
                      <SelectItem value="America/Denver">Mountain</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button>Save</Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="crm" className="mt-0">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader><CardTitle>CRM</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>CRM type</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="default" className="cursor-default">GHL</Badge>
                    <Badge variant="secondary" className="opacity-60 cursor-default">HubSpot <span className="ml-1 text-[10px]">Coming Soon</span></Badge>
                    <Badge variant="secondary" className="opacity-60 cursor-default">Salesforce <span className="ml-1 text-[10px]">Coming Soon</span></Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="bg-[var(--g-bg-surface)]" />
                </div>
                <div className="space-y-2">
                  <Label>Location ID</Label>
                  <Input value={locationId} onChange={(e) => setLocationId(e.target.value)} className="bg-[var(--g-bg-surface)]" />
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={testConnection}>Test Connection</Button>
                  {crmConnected === true && <span className="flex items-center gap-1 text-sm" style={{ color: "var(--g-grade-a)" }}><Check className="size-4" />Connected</span>}
                  {crmConnected === false && <span className="flex items-center gap-1 text-sm" style={{ color: "var(--g-grade-f)" }}><X className="size-4" />Failed</span>}
                </div>
                <Button variant="secondary">Connect via OAuth</Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="team" className="mt-0">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Team</CardTitle>
                <Button size="sm" onClick={() => setShowInvite(!showInvite)}><Plus className="size-4" />Invite</Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {showInvite && (
                  <div className="p-4 rounded-lg space-y-3" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                    <div className="space-y-2"><Label>Name</Label><Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Name" className="bg-[var(--g-bg-surface)]" /></div>
                    <div className="space-y-2"><Label>Email</Label><Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email" className="bg-[var(--g-bg-surface)]" /></div>
                    <div className="space-y-2"><Label>Role</Label>
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger className="w-full bg-[var(--g-bg-surface)]"><SelectValue /></SelectTrigger>
                        <SelectContent>{roles.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" onClick={() => setShowInvite(false)}>Send Invite</Button>
                  </div>
                )}
                <div className="space-y-2">
                  {team.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: "var(--g-bg-surface)" }}>
                      <div>
                        <span className="font-medium" style={{ color: "var(--g-text-primary)" }}>{m.name}</span>
                        <span className="text-sm ml-2" style={{ color: "var(--g-text-tertiary)" }}>{m.email}</span>
                        <Badge variant="secondary" className="ml-2 text-xs">{m.role}</Badge>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => setTeam((t) => t.filter((x) => x.id !== m.id))}><Trash2 className="size-4" style={{ color: "var(--g-text-tertiary)" }} /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="notifications" className="mt-0">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><p className="font-medium" style={{ color: "var(--g-text-primary)" }}>Email daily digest</p><p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Summary of calls and grades</p></div>
                  <Switch checked={emailDigest} onCheckedChange={setEmailDigest} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div><p className="font-medium" style={{ color: "var(--g-text-primary)" }}>Email grade alerts</p><p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>When new grades are ready</p></div>
                  <Switch checked={gradeAlerts} onCheckedChange={setGradeAlerts} />
                </div>
                <Separator />
                <div className="flex items-center justify-between opacity-60">
                  <div><p className="font-medium" style={{ color: "var(--g-text-primary)" }}>Slack integration</p><Badge variant="outline" className="text-[10px]">Coming Soon</Badge></div>
                  <Switch disabled />
                </div>
                <Separator />
                <div className="flex items-center justify-between opacity-60">
                  <div><p className="font-medium" style={{ color: "var(--g-text-primary)" }}>SMS alerts</p><Badge variant="outline" className="text-[10px]">Coming Soon</Badge></div>
                  <Switch disabled />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="billing" className="mt-0">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-xl" style={{ background: "var(--g-accent-soft)", border: "1px solid var(--g-accent-medium)" }}>
                  <p className="font-semibold" style={{ color: "var(--g-accent-text)" }}>Pro Plan</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "var(--g-text-primary)" }}>$99/mo</p>
                  <ul className="mt-2 text-sm space-y-1" style={{ color: "var(--g-text-secondary)" }}>
                    <li>• Unlimited calls</li><li>• AI grading</li><li>• Team leaderboard</li><li>• GHL sync</li>
                  </ul>
                  <Button className="mt-4" variant="outline">Manage Subscription</Button>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2" style={{ color: "var(--g-text-secondary)" }}>Usage this month</p>
                  <div className="flex gap-4">
                    <div><span className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>312</span><span className="text-sm ml-1" style={{ color: "var(--g-text-tertiary)" }}>calls</span></div>
                    <div><span className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>4</span><span className="text-sm ml-1" style={{ color: "var(--g-text-tertiary)" }}>team members</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
