import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const STEPS = ["welcome", "crm", "team", "done"] as const;

export function Onboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("real-estate");
  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [members, setMembers] = useState<Array<{ name: string; email: string; role: string }>>([]);
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState("member");

  const { data: workspace, isLoading } = trpc.settings.getWorkspace.useQuery();
  const { data: industries } = trpc.playbook.listIndustries.useQuery();
  const updateMutation = trpc.settings.updateWorkspace.useMutation();
  const testQuery = trpc.settings.testCrmConnection.useQuery(undefined, { enabled: false });
  const inviteMutation = trpc.settings.inviteTeamMember.useMutation();
  const utils = trpc.useUtils();

  const tenant = workspace?.tenant;

  useEffect(() => {
    if (tenant) setCompanyName(tenant.name ?? "");
  }, [tenant]);

  useEffect(() => {
    if (!isLoading && tenant?.onboardingCompleted === "true") setLocation("/today");
  }, [isLoading, tenant?.onboardingCompleted, setLocation]);

  const saveStep1 = async () => {
    await updateMutation.mutateAsync({
      name: companyName,
      settings: JSON.stringify({ industry }),
      industryCode: industry !== "other" ? industry : undefined,
      onboardingStep: 2,
    });
    setStep(1);
  };

  const saveStep2 = async () => {
    await updateMutation.mutateAsync({
      crmType: "ghl",
      crmConfig: JSON.stringify({ apiKey, locationId, ghlApiKey: apiKey, ghlLocationId: locationId }),
      crmConnected: testQuery.data?.connected ? "true" : "false",
      onboardingStep: 3,
    });
    setStep(2);
  };

  const skipCrm = async () => {
    await updateMutation.mutateAsync({ onboardingStep: 3 });
    setStep(2);
  };

  const addMember = () => {
    if (invName && invEmail) {
      setMembers((m) => [...m, { name: invName, email: invEmail, role: invRole }]);
      setInvName("");
      setInvEmail("");
      setInvRole("member");
    }
  };

  const removeMember = (i: number) => setMembers((m) => m.filter((_, idx) => idx !== i));

  const saveStep3 = async () => {
    for (const m of members) {
      await inviteMutation.mutateAsync({ name: m.name, email: m.email, teamRole: m.role });
    }
    await updateMutation.mutateAsync({ onboardingStep: 4 });
    setStep(3);
  };

  const skipTeam = async () => {
    await updateMutation.mutateAsync({ onboardingStep: 4 });
    setStep(3);
  };

  const complete = async () => {
    await updateMutation.mutateAsync({ onboardingCompleted: "true" });
    await utils.settings.getWorkspace.invalidate();
    setLocation("/today");
  };

  if (isLoading) return <div className="min-h-svh flex items-center justify-center bg-[var(--g-bg-base)]"><div className="g-shimmer w-48 h-8 rounded-lg" /></div>;

  return (
    <div className="min-h-svh bg-[var(--g-bg-base)] text-[var(--g-text-primary)] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <Tabs value={STEPS[step]} onValueChange={(v) => setStep(STEPS.indexOf(v as typeof STEPS[number]))}>
          <TabsList className="grid w-full grid-cols-4 mb-8">
            {STEPS.map((s, i) => (
              <TabsTrigger key={s} value={s} disabled={i > step} className="text-xs">
                {i + 1}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="welcome" className="mt-0 space-y-6">
            <h1 className="text-2xl font-bold">Welcome to Gunner!</h1>
            <p className="text-[var(--g-text-secondary)]">Let&apos;s get your team set up in under 5 minutes.</p>
            <div className="space-y-2">
              <Label>Company name</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-[var(--g-bg-surface)]" />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="bg-[var(--g-bg-surface)]"><SelectValue placeholder="Select your industry" /></SelectTrigger>
                <SelectContent>
                  {industries?.map((i) => <SelectItem key={i.code} value={i.code}>{i.name}</SelectItem>)}
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveStep1} disabled={updateMutation.isPending}>Continue</Button>
          </TabsContent>

          <TabsContent value="crm" className="mt-0 space-y-6">
            <h2 className="text-xl font-bold">Connect CRM</h2>
            <div className="flex gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-[var(--g-accent)] text-[var(--g-accent-text)] text-sm">GoHighLevel</span>
              <span className="px-3 py-1 rounded-full bg-[var(--g-bg-surface)] text-[var(--g-text-tertiary)] text-sm opacity-60">HubSpot (coming soon)</span>
              <span className="px-3 py-1 rounded-full bg-[var(--g-bg-surface)] text-[var(--g-text-tertiary)] text-sm opacity-60">Salesforce (coming soon)</span>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="GHL API key" className="bg-[var(--g-bg-surface)]" />
            </div>
            <div className="space-y-2">
              <Label>Location ID</Label>
              <Input value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="Location ID" className="bg-[var(--g-bg-surface)]" />
            </div>
            <div className="flex gap-3 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await updateMutation.mutateAsync({
                    crmType: "ghl",
                    crmConfig: JSON.stringify({ apiKey, locationId, ghlApiKey: apiKey, ghlLocationId: locationId }),
                  });
                  await utils.settings.getWorkspace.invalidate();
                  testQuery.refetch();
                }}
                disabled={testQuery.isFetching || updateMutation.isPending}
              >
                Test Connection
              </Button>
              {testQuery.data?.connected && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="size-4" />Connected</span>}
            </div>
            <div className="flex gap-3">
              <Button onClick={saveStep2} disabled={updateMutation.isPending}>Continue</Button>
              <button type="button" onClick={skipCrm} className="text-sm text-[var(--g-text-tertiary)] hover:underline">Skip for now</button>
            </div>
          </TabsContent>

          <TabsContent value="team" className="mt-0 space-y-6">
            <h2 className="text-xl font-bold">Add Team</h2>
            <p className="text-[var(--g-text-secondary)]">Invite your team members</p>
            <div className="flex gap-2 flex-wrap">
              <Input value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Name" className="bg-[var(--g-bg-surface)] flex-1 min-w-[120px]" />
              <Input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="Email" className="bg-[var(--g-bg-surface)] flex-1 min-w-[120px]" />
              <Select value={invRole} onValueChange={setInvRole}>
                <SelectTrigger className="w-[120px] bg-[var(--g-bg-surface)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="lead_manager">Lead Manager</SelectItem>
                  <SelectItem value="acquisition_manager">Acquisition Manager</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="outline" aria-label="Add team member" onClick={addMember}><Plus className="size-4" /></Button>
            </div>
            {members.length > 0 && (
              <ul className="space-y-2">
                {members.map((m, i) => (
                  <li key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--g-bg-surface)]">
                    <span>{m.name} ({m.email}) — {m.role}</span>
                    <Button variant="ghost" size="icon" aria-label="Remove member" onClick={() => removeMember(i)}><Trash2 className="size-4" /></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-3">
              <Button onClick={saveStep3} disabled={updateMutation.isPending || inviteMutation.isPending}>Continue</Button>
              <button type="button" onClick={skipTeam} className="text-sm text-[var(--g-text-tertiary)] hover:underline">Skip for now</button>
            </div>
          </TabsContent>

          <TabsContent value="done" className="mt-0 space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-green-500/20 p-4"><Check className="size-10 text-green-600" /></div>
              <h2 className="text-xl font-bold">You&apos;re all set!</h2>
              <p className="text-center text-[var(--g-text-secondary)]">
                Company: {tenant?.name ?? companyName}. {tenant?.crmConnected === "true" ? "CRM connected." : ""} {members.length > 0 ? `${members.length} team member(s) invited.` : ""}
              </p>
              <Button onClick={complete} disabled={updateMutation.isPending}>Go to Dashboard</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
