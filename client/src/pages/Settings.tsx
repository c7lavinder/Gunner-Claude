import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Link2,
  Users,
  Bell,
  CreditCard,
  Check,
  X,
  Mic,
  Monitor,
  LogOut,
  ClipboardList,
} from "lucide-react";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useAuth } from "@/hooks/useAuth";
import { ErrorState } from "@/components/ErrorState";
import { PageShell } from "@/components/layout/PageShell";
import { trpc } from "@/lib/trpc";

import { GeneralTab } from "./settings/GeneralTab";
import { CrmTab } from "./settings/CrmTab";
import { TeamTab } from "./settings/TeamTab";
import { NotificationsTab } from "./settings/NotificationsTab";
import { VoiceTab } from "./settings/VoiceTab";
import { BillingTab } from "./settings/BillingTab";

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
    <div className="p-3 rounded-lg space-y-2 bg-[var(--g-bg-inset)] border border-[var(--g-border-subtle)]">
      <p className="text-sm font-medium text-[var(--g-text-primary)]">Sync Health</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          {health.connected ? <Check className="size-3 text-[var(--g-grade-a)]" /> : <X className="size-3 text-[var(--g-grade-f)]" />}
          <span className="text-[var(--g-text-secondary)]">CRM Connected</span>
        </div>
        <div className="flex items-center gap-1.5">
          {health.oauthActive ? <Check className="size-3 text-[var(--g-grade-a)]" /> : <X className="size-3 text-[var(--g-grade-f)]" />}
          <span className="text-[var(--g-text-secondary)]">OAuth Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          {health.webhooksRegistered ? <Check className="size-3 text-[var(--g-grade-a)]" /> : <X className="size-3 text-[var(--g-grade-f)]" />}
          <span className="text-[var(--g-text-secondary)]">Webhooks</span>
        </div>
        {health.lastSync && (
          <div className="text-xs text-[var(--g-text-tertiary)]">
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
          <p className="text-sm py-4 text-[var(--g-text-tertiary)]">No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--g-bg-surface)]">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium truncate text-[var(--g-text-primary)]">
                    {s.userAgent ? s.userAgent.slice(0, 60) : "Unknown device"}
                  </p>
                  <p className="text-xs text-[var(--g-text-tertiary)]">
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
          <p className="text-sm py-4 text-[var(--g-text-tertiary)]">No activity logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--g-border-subtle)]">
                  <th className="pb-2 text-left font-medium text-[var(--g-text-secondary)]">Time</th>
                  <th className="pb-2 text-left font-medium text-[var(--g-text-secondary)]">User</th>
                  <th className="pb-2 text-left font-medium text-[var(--g-text-secondary)]">Action</th>
                  <th className="pb-2 text-left font-medium text-[var(--g-text-secondary)]">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--g-border-subtle)]">
                {entries.map((e) => (
                  <tr key={e.id} className="py-2">
                    <td className="py-2 pr-4 whitespace-nowrap text-[var(--g-text-tertiary)]">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-[var(--g-text-secondary)]">
                      {e.userName ?? `User #${e.userId}`}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-[var(--g-text-primary)]">
                      {e.action}
                    </td>
                    <td className="py-2 text-[var(--g-text-tertiary)]">
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
  const { data: workspace, isLoading, isError } = trpc.settings.getWorkspace.useQuery();
  const { data: industries } = trpc.playbook.listIndustries.useQuery();
  const updateMutation = trpc.settings.updateWorkspace.useMutation();
  const { data: plans } = trpc.settings.getPlans.useQuery();
  const ghlOAuthRedirectUri = `${window.location.origin}/settings?tab=crm&crm_callback=1`;
  const ghlOAuthUrlQuery = trpc.settings.getGhlOAuthUrl.useQuery(
    { redirectUri: ghlOAuthRedirectUri },
    { enabled: false }
  );
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

  if (isError) return <PageShell title="Settings"><ErrorState onRetry={() => window.location.reload()} /></PageShell>;
  if (isLoading) return <PageShell title="Settings"><Skeleton className="h-64 w-full" /></PageShell>;

  return (
    <PageShell title="Settings">
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
            <GeneralTab
              companyName={companyName}
              setCompanyName={setCompanyName}
              industry={industry}
              setIndustry={setIndustry}
              timezone={timezone}
              setTimezone={setTimezone}
              industries={industries}
              isAdmin={isAdmin}
              onSave={saveGeneral}
              isSaving={updateMutation.isPending}
            />
          </TabsContent>
          <TabsContent value="crm" className="mt-0 space-y-4">
            <CrmTab
              apiKey={apiKey}
              setApiKey={setApiKey}
              locationId={locationId}
              setLocationId={setLocationId}
              crmConfig={crmConfig}
              onOAuthConnect={async () => {
                const result = await ghlOAuthUrlQuery.refetch();
                if (result.data?.url) {
                  window.location.href = result.data.url;
                }
              }}
              isOAuthFetching={ghlOAuthUrlQuery.isFetching}
              onTestConnection={() => { void testQuery.refetch(); }}
              isTestFetching={testQuery.isFetching}
              crmConnected={crmConnected}
              crmError={crmError}
              onSaveCrm={saveCrm}
              isSaving={updateMutation.isPending}
              syncHealthDisplay={<SyncHealthDisplay />}
            />
          </TabsContent>
          <TabsContent value="team" className="mt-0">
            <TeamTab
              isAdmin={isAdmin}
              team={team}
              roles={roles}
              showInvite={showInvite}
              setShowInvite={setShowInvite}
              inviteName={inviteName}
              setInviteName={setInviteName}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              inviteRole={inviteRole}
              setInviteRole={setInviteRole}
              onSendInvite={sendInvite}
              isInviting={inviteMutation.isPending}
              onRemoveMember={removeMember}
              isRemoving={removeMutation.isPending}
              onUpdateRole={(id, role) => {
                updateRoleMutation.mutate({ id, teamRole: role }, { onSuccess: () => void utils.settings.getWorkspace.invalidate() });
              }}
            />
          </TabsContent>
          <TabsContent value="notifications" className="mt-0">
            <NotificationsTab
              emailDigest={emailDigest}
              setEmailDigest={setEmailDigest}
              gradeAlerts={gradeAlerts}
              setGradeAlerts={setGradeAlerts}
              notifDirty={notifDirty}
              setNotifDirty={setNotifDirty}
              onSave={saveGeneral}
              isSaving={updateMutation.isPending}
            />
          </TabsContent>
          <TabsContent value="voice" className="mt-0 space-y-4">
            <VoiceTab
              voiceProfile={voiceProfile}
              onToggleConsent={async (checked) => {
                await updateVoiceConsentMutation.mutateAsync({ consentGiven: checked });
                await refetchVoiceProfile();
              }}
              isUpdatingConsent={updateVoiceConsentMutation.isPending}
            />
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
            <BillingTab
              subscriptionTier={tenant?.subscriptionTier ?? "starter"}
              subscriptionStatus={tenant?.subscriptionStatus ?? "trial"}
              plans={plans}
              teamCount={team.length}
            />
          </TabsContent>
        </div>
      </Tabs>
    </PageShell>
  );
}
