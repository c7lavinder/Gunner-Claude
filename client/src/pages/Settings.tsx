import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  Mic,
  Monitor,
  LogOut,
  ClipboardList,
} from "lucide-react";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function SyncHealthDisplay() {
  const { data: health } = trpc.settings.getSyncHealth.useQuery();
  if (!health) return null;
  if (!health.connected && !health.oauthActive) return null;

  return (
    <div className="p-3 rounded-lg space-y-2" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>Sync Health</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          {health.connected ? <Check className="size-3" style={{ color: "var(--g-grade-a)" }} /> : <X className="size-3" style={{ color: "var(--g-grade-f)" }} />}
          <span style={{ color: "var(--g-text-secondary)" }}>CRM Connected</span>
        </div>
        <div className="flex items-center gap-1.5">
          {health.oauthActive ? <Check className="size-3" style={{ color: "var(--g-grade-a)" }} /> : <X className="size-3" style={{ color: "var(--g-grade-f)" }} />}
          <span style={{ color: "var(--g-text-secondary)" }}>OAuth Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          {health.webhooksRegistered ? <Check className="size-3" style={{ color: "var(--g-grade-a)" }} /> : <X className="size-3" style={{ color: "var(--g-grade-f)" }} />}
          <span style={{ color: "var(--g-text-secondary)" }}>Webhooks</span>
        </div>
        {health.lastSync && (
          <div className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
            Last sync: {new Date(health.lastSync).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionsTab() {
  const { data: sessions, isLoading } = trpc.auth.listSessions.useQuery();
  const revokeMutation = trpc.auth.revokeSession.useMutation();
  const revokeAllMutation = trpc.auth.revokeAllSessions.useMutation();
  const utils = trpc.useUtils();

  const handleRevoke = async (sessionId: number) => {
    await revokeMutation.mutateAsync({ sessionId });
    await utils.auth.listSessions.invalidate();
  };
  const handleRevokeAll = async () => {
    await revokeAllMutation.mutateAsync();
    window.location.assign("/login");
  };

  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Active Sessions</CardTitle>
        <Button variant="destructive" size="sm" onClick={handleRevokeAll} disabled={revokeAllMutation.isPending}>
          <LogOut className="size-4 mr-1" />Sign out all devices
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !sessions?.length ? (
          <p className="text-sm py-4" style={{ color: "var(--g-text-tertiary)" }}>No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--g-bg-surface)" }}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--g-text-primary)" }}>
                    {s.userAgent ? s.userAgent.slice(0, 60) : "Unknown device"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                    IP: {s.ipAddress ?? "—"} · Last seen: {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRevoke(s.id)} disabled={revokeMutation.isPending}>
                  <LogOut className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditLogTab() {
  const { data: entries, isLoading } = trpc.auditLog.list.useQuery();

  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardHeader><CardTitle>Audit Log</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !entries?.length ? (
          <p className="text-sm py-4" style={{ color: "var(--g-text-tertiary)" }}>No activity logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--g-border-subtle)" }}>
                  <th className="pb-2 text-left font-medium" style={{ color: "var(--g-text-secondary)" }}>Time</th>
                  <th className="pb-2 text-left font-medium" style={{ color: "var(--g-text-secondary)" }}>User</th>
                  <th className="pb-2 text-left font-medium" style={{ color: "var(--g-text-secondary)" }}>Action</th>
                  <th className="pb-2 text-left font-medium" style={{ color: "var(--g-text-secondary)" }}>Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--g-border-subtle)" }}>
                {entries.map((e) => (
                  <tr key={e.id} className="py-2">
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ color: "var(--g-text-tertiary)" }}>
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4" style={{ color: "var(--g-text-secondary)" }}>
                      {e.userName ?? `User #${e.userId}`}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs" style={{ color: "var(--g-text-primary)" }}>
                      {e.action}
                    </td>
                    <td className="py-2" style={{ color: "var(--g-text-tertiary)" }}>
                      {e.entityType ? `${e.entityType} ${e.entityId ?? ""}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Settings() {
  const { isAdmin } = useAuth();
  const { roles } = useTenantConfig();
  const { data: workspace, isLoading } = trpc.settings.getWorkspace.useQuery();
  const { data: industries } = trpc.playbook.listIndustries.useQuery();
  const updateMutation = trpc.settings.updateWorkspace.useMutation();
  const { data: plans } = trpc.settings.getPlans.useQuery();
  const testQuery = trpc.settings.testCrmConnection.useQuery(undefined, { enabled: false });
  const inviteMutation = trpc.settings.inviteTeamMember.useMutation();
  const removeMutation = trpc.settings.removeTeamMember.useMutation();
  const updateRoleMutation = trpc.settings.updateMemberRole.useMutation();
  const updateVoiceConsentMutation = trpc.users.updateVoiceConsent.useMutation();
  const { data: voiceProfile, refetch: refetchVoiceProfile } = trpc.users.getVoiceProfile.useQuery();
  const utils = trpc.useUtils();

  const tenant = workspace?.tenant;
  const team = workspace?.teamMembers ?? [];
  const crmRaw = parseJson<Record<string, unknown>>(tenant?.crmConfig ?? null, {});
  const crmConfig: Record<string, string> = {};
  for (const [k, v] of Object.entries(crmRaw)) {
    if (typeof v === "string") crmConfig[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") crmConfig[k] = String(v);
  }
  if (crmConfig.ghlApiKey && !crmConfig.apiKey) crmConfig.apiKey = crmConfig.ghlApiKey;
  if (crmConfig.ghlLocationId && !crmConfig.locationId) crmConfig.locationId = crmConfig.ghlLocationId;
  const settingsObj = parseJson<Record<string, unknown>>(tenant?.settings ?? null, {});

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("real-estate");
  const [timezone, setTimezone] = useState("America/New_York");
  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [emailDigest, setEmailDigest] = useState(true);
  const [gradeAlerts, setGradeAlerts] = useState(true);
  const [notifDirty, setNotifDirty] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  useEffect(() => {
    if (!tenant) return;
    const s = parseJson<Record<string, unknown>>(tenant.settings ?? null, {});
    const c = parseJson<Record<string, unknown>>(tenant.crmConfig ?? null, {});
    setCompanyName(tenant.name ?? "");
    setIndustry((s.industry as string) ?? "real-estate");
    setTimezone((s.timezone as string) ?? "America/New_York");
    setEmailDigest((s.emailDigest as boolean) ?? true);
    setGradeAlerts((s.gradeAlerts as boolean) ?? true);
    const loc = (c.locationId ?? c.ghlLocationId) as string | undefined;
    if (loc) setLocationId(loc);
  }, [tenant]);

  const saveGeneral = async () => {
    await updateMutation.mutateAsync({
      name: companyName,
      settings: JSON.stringify({ ...settingsObj, industry, timezone, emailDigest, gradeAlerts }),
      industryCode: industry !== "other" ? industry : undefined,
    });
    setNotifDirty(false);
    await utils.settings.getWorkspace.invalidate();
    await utils.playbook.getConfig.invalidate();
  };
  const saveCrm = async () => {
    await updateMutation.mutateAsync({ crmType: "ghl", crmConfig: JSON.stringify({ apiKey: apiKey || crmConfig.apiKey, locationId: locationId || crmConfig.locationId }) });
    await utils.settings.getWorkspace.invalidate();
  };
  const sendInvite = async () => {
    await inviteMutation.mutateAsync({ name: inviteName, email: inviteEmail, teamRole: inviteRole });
    setShowInvite(false);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("member");
    await utils.settings.getWorkspace.invalidate();
  };

  const removeMember = async (id: number) => {
    await removeMutation.mutateAsync({ id });
    await utils.settings.getWorkspace.invalidate();
  };
  const crmConnected = testQuery.data?.connected ?? null;
  const crmError = testQuery.data?.error;

  const header = (
    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--g-text-primary)" }}>
      <SettingsIcon className="size-6" style={{ color: "var(--g-accent-text)" }} />
      Settings
    </h1>
  );

  if (isLoading) return <div className="space-y-6">{header}<Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="space-y-6">
      {header}
      <Tabs defaultValue="general" className="flex flex-col sm:flex-row gap-8">
        <TabsList className="flex flex-col h-auto w-full sm:w-48 flex-shrink-0 bg-[var(--g-bg-surface)] border border-[var(--g-border-subtle)] p-1 rounded-xl">
          <TabsTrigger value="general" className="justify-start gap-2"><Building2 className="size-4" />General</TabsTrigger>
          <TabsTrigger value="crm" className="justify-start gap-2"><Link2 className="size-4" />CRM</TabsTrigger>
          <TabsTrigger value="team" className="justify-start gap-2"><Users className="size-4" />Team</TabsTrigger>
          <TabsTrigger value="notifications" className="justify-start gap-2"><Bell className="size-4" />Notifications</TabsTrigger>
          <TabsTrigger value="voice" className="justify-start gap-2"><Mic className="size-4" />Voice</TabsTrigger>
          <TabsTrigger value="sessions" className="justify-start gap-2"><Monitor className="size-4" />Sessions</TabsTrigger>
          {isAdmin && <TabsTrigger value="audit" className="justify-start gap-2"><ClipboardList className="size-4" />Audit Log</TabsTrigger>}
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
                      {industries?.map((i) => (
                        <SelectItem key={i.code} value={i.code}>{i.name}</SelectItem>
                      ))}
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
                {isAdmin && <Button onClick={saveGeneral} disabled={updateMutation.isPending}>Save</Button>}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="crm" className="mt-0 space-y-4">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader><CardTitle>Connect via OAuth (Recommended)</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
                  Connect your GoHighLevel account with one click. This automatically sets up API access and webhook notifications.
                </p>
                <Button
                  onClick={() => {
                    const redirectUri = `${window.location.origin}/settings?tab=crm&crm_callback=1`;
                    window.location.href = `/api/trpc/settings.getGhlOAuthUrl?input=${encodeURIComponent(JSON.stringify({ redirectUri }))}`;
                  }}
                >
                  <Link2 className="size-4 mr-2" />
                  Connect GoHighLevel
                </Button>
                <SyncHealthDisplay />
              </CardContent>
            </Card>
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader><CardTitle>Manual API Key</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>
                  Or connect manually using your GHL API key and location ID.
                </p>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={crmConfig.apiKey ? "••••••••••••••••" : ""} className="bg-[var(--g-bg-surface)]" />
                </div>
                <div className="space-y-2">
                  <Label>Location ID</Label>
                  <Input value={locationId} onChange={(e) => setLocationId(e.target.value)} className="bg-[var(--g-bg-surface)]" />
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => testQuery.refetch()} disabled={testQuery.isFetching}>Test Connection</Button>
                  {!testQuery.isFetching && crmConnected === true && <span className="flex items-center gap-1 text-sm" style={{ color: "var(--g-grade-a)" }}><Check className="size-4" />Connected</span>}
                  {!testQuery.isFetching && crmConnected === false && <span className="flex items-center gap-1 text-sm" style={{ color: "var(--g-grade-f)" }}><X className="size-4" />{crmError ?? "Failed"}</span>}
                </div>
                <Button variant="secondary" onClick={saveCrm} disabled={updateMutation.isPending}>Save CRM Config</Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="team" className="mt-0">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Team</CardTitle>
                {isAdmin && <Button size="sm" onClick={() => setShowInvite(!showInvite)}><Plus className="size-4" />Invite</Button>}
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
                    <Button size="sm" onClick={sendInvite} disabled={inviteMutation.isPending}>Send Invite</Button>
                  </div>
                )}
                <div className="space-y-2">
                  {team.length === 0 ? (
                    <p className="text-sm py-4" style={{ color: "var(--g-text-tertiary)" }}>No team members yet.</p>
                  ) : (
                    team.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: "var(--g-bg-surface)" }}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium" style={{ color: "var(--g-text-primary)" }}>{m.name}</span>
                          <Select value={m.teamRole ?? "member"} onValueChange={(v) => {
                            updateRoleMutation.mutate({ id: m.id, teamRole: v }, { onSuccess: () => void utils.settings.getWorkspace.invalidate() });
                          }}>
                            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {roles.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {isAdmin && <Button variant="ghost" size="icon" aria-label="Remove member" onClick={() => removeMember(m.id)} disabled={removeMutation.isPending}><Trash2 className="size-4" style={{ color: "var(--g-text-tertiary)" }} /></Button>}
                      </div>
                    ))
                  )}
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
                  <Switch checked={emailDigest} onCheckedChange={(v) => { setEmailDigest(v); setNotifDirty(true); }} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div><p className="font-medium" style={{ color: "var(--g-text-primary)" }}>Email grade alerts</p><p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>When new grades are ready</p></div>
                  <Switch checked={gradeAlerts} onCheckedChange={(v) => { setGradeAlerts(v); setNotifDirty(true); }} />
                </div>
                <Separator />
                <div className="flex items-center justify-between opacity-60">
                  <div><p className="font-medium" style={{ color: "var(--g-text-primary)" }}>Slack integration</p><Badge variant="outline" className="text-[10px]">Soon</Badge></div>
                  <Switch disabled />
                </div>
                <Separator />
                <div className="flex items-center justify-between opacity-60">
                  <div><p className="font-medium" style={{ color: "var(--g-text-primary)" }}>SMS alerts</p><Badge variant="outline" className="text-[10px]">Soon</Badge></div>
                  <Switch disabled />
                </div>
                <div className="flex items-center gap-2">
                  {notifDirty && <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">Unsaved changes</Badge>}
                  <Button onClick={saveGeneral} disabled={updateMutation.isPending}>Save</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="voice" className="mt-0 space-y-4">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader><CardTitle>Voice Coaching</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium" style={{ color: "var(--g-text-primary)" }}>Allow voice sample collection</p>
                    <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>
                      Allow Gunner to collect voice samples from your calls to build a personalized coaching profile.
                      Your voice data is stored securely and used only to improve your AI coaching experience.
                      You can revoke consent at any time.
                    </p>
                  </div>
                  <Switch
                    checked={voiceProfile?.consentGiven ?? false}
                    onCheckedChange={async (checked) => {
                      await updateVoiceConsentMutation.mutateAsync({ consentGiven: checked });
                      await refetchVoiceProfile();
                    }}
                    disabled={updateVoiceConsentMutation.isPending}
                  />
                </div>
                {voiceProfile && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <p className="font-medium" style={{ color: "var(--g-text-primary)" }}>Voice Profile</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-3 rounded-lg" style={{ background: "var(--g-bg-inset)" }}>
                          <p className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>{voiceProfile.totalSamples ?? 0}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>Samples collected</p>
                        </div>
                        <div className="p-3 rounded-lg" style={{ background: "var(--g-bg-inset)" }}>
                          <p className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>{parseFloat(voiceProfile.totalDurationMinutes ?? "0").toFixed(0)}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>Minutes recorded</p>
                        </div>
                        <div className="p-3 rounded-lg" style={{ background: "var(--g-bg-inset)" }}>
                          <p className="text-sm font-semibold" style={{ color: voiceProfile.readyForCloning ? "var(--g-grade-a)" : "var(--g-text-secondary)" }}>
                            {voiceProfile.readyForCloning ? "Ready" : (voiceProfile.totalSamples ?? 0) > 0 ? "Building" : "Not started"}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>Profile status</p>
                        </div>
                      </div>
                      {!voiceProfile.readyForCloning && (voiceProfile.totalSamples ?? 0) > 0 && (
                        <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                          Need {Math.max(0, 20 - (voiceProfile.totalSamples ?? 0))} more samples and {Math.max(0, 60 - parseFloat(voiceProfile.totalDurationMinutes ?? "0")).toFixed(0)} more minutes to unlock cloning.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="sessions" className="mt-0">
            <SessionsTab />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="audit" className="mt-0">
              <AuditLogTab />
            </TabsContent>
          )}
          <TabsContent value="billing" className="mt-0">
            <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
              <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {(() => {
                  const tierCode = tenant?.subscriptionTier ?? "starter";
                  const planStatus = tenant?.subscriptionStatus ?? "trial";
                  const currentPlan = plans?.find((p) => p.code === tierCode);
                  const planName = currentPlan?.name ?? tierCode.charAt(0).toUpperCase() + tierCode.slice(1) + " Plan";
                  const planPrice = currentPlan?.priceMonthly ? `$${(currentPlan.priceMonthly / 100).toFixed(0)}/mo` : null;
                  return (
                <div className="p-4 rounded-xl" style={{ background: "var(--g-accent-soft)", border: "1px solid var(--g-accent-medium)" }}>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold" style={{ color: "var(--g-accent-text)" }}>{planName}</p>
                    <Badge variant="outline" className="text-xs capitalize">{planStatus}</Badge>
                  </div>
                  {planPrice && <p className="text-2xl font-bold mt-1" style={{ color: "var(--g-text-primary)" }}>{planPrice}</p>}
                  <p className="mt-2 text-sm" style={{ color: "var(--g-text-secondary)" }}>Unlimited calls · AI grading · Team leaderboard · GHL sync</p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const result = await utils.client.settings.manageBilling.mutate({
                          returnUrl: window.location.href,
                        });
                        if (result?.url) window.location.href = result.url;
                      } catch {
                        window.alert("Billing portal is not configured yet.");
                      }
                    }}
                  >
                    Manage Subscription
                  </Button>
                </div>
                  );
                })()}
                <div>
                  <p className="text-sm font-medium mb-2" style={{ color: "var(--g-text-secondary)" }}>Usage this month</p>
                  <div className="flex gap-4">
                    <div><span className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>{team.length}</span><span className="text-sm ml-1" style={{ color: "var(--g-text-tertiary)" }}>team members</span></div>
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
