import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Flame, Phone, Mic } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";

function gradeColor(grade: number) {
  if (grade >= 90) return "var(--g-grade-a)";
  if (grade >= 80) return "var(--g-grade-b)";
  if (grade >= 70) return "var(--g-grade-c)";
  if (grade >= 60) return "var(--g-grade-d)";
  return "var(--g-grade-f)";
}

export function Profile() {
  const { user } = useAuth();
  const { data: members } = trpc.team.list.useQuery();
  const { data: progress } = trpc.training.getUserProgress.useQuery();
  const { data: userPlaybook } = trpc.playbook.getUser.useQuery();
  const saveInstruction = trpc.ai.saveInstruction.useMutation();
  const updateProfile = trpc.auth.updateProfile.useMutation();
  const updateVoiceConsentMutation = trpc.users.updateVoiceConsent.useMutation();
  const { data: voiceProfile, refetch: refetchVoiceProfile } = trpc.users.getVoiceProfile.useQuery();
  const utils = trpc.useUtils();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [smsTone, setSmsTone] = useState("professional");
  const [defaultGreeting, setDefaultGreeting] = useState("");
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (voiceProfile) {
      setVoiceConsent(voiceProfile.consentGiven ?? false);
    }
  }, [voiceProfile]);

  useEffect(() => {
    if (!userPlaybook) return;
    const instructions = (userPlaybook.instructions as Record<string, string> | null | undefined) ?? {};
    const prefs = instructions.preferences ?? "";
    const toneMatch = prefs.match(/SMS tone:\s*(\w+)/i);
    const greetMatch = prefs.match(/Default greeting:\s*(.+?)(?:\.|$)/i);
    if (toneMatch?.[1]) setSmsTone(toneMatch[1].toLowerCase());
    if (greetMatch?.[1] && greetMatch[1].trim() !== "(none)") setDefaultGreeting(greetMatch[1].trim());
  }, [userPlaybook]);

  useEffect(() => {
    if (user?.name && !editing) setName(user.name);
  }, [user?.name, editing]);

  const displayName = editing ? name : (user?.name ?? name);
  const displayEmail = user?.email ?? "";
  const myMember = members?.find((m) => m.userId === user?.id);
  const role = myMember?.teamRole ?? user?.role ?? "user";
  const callsGraded = progress?.recentCalls?.length ?? 0;
  const avgGradeNum = progress?.avgGrade ?? 0;
  const avgGradePct = Math.round(avgGradeNum * 25);
  const streak = progress?.streak ?? 0;

  const handleSaveProfile = async () => {
    if (!name.trim()) return;
    await updateProfile.mutateAsync({ name: name.trim() });
    await utils.auth.me.invalidate();
    setEditing(false);
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      await saveInstruction.mutateAsync({
        instruction: `SMS tone: ${smsTone}. Default greeting: ${defaultGreeting || "(none)"}`,
        category: "preferences",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--g-accent), #5a1018)" }}>
          {(displayName || "U").toString().split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            {editing ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-[200px] bg-[var(--g-bg-surface)]" />
            ) : (
              <h1 className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>{displayName || "User"}</h1>
            )}
            <Badge variant="secondary">{role}</Badge>
            {editing ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveProfile} disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(user?.name ?? ""); }}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" />Edit Profile</Button>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--g-text-tertiary)" }}>{displayEmail}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="pt-6">
            <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Calls Graded</p>
            <p className="text-3xl font-bold mt-1" style={{ color: "var(--g-text-primary)" }}>{callsGraded}</p>
          </CardContent>
        </Card>
        <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="pt-6">
            <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Average Grade</p>
            <p className="text-3xl font-bold mt-1" style={{ color: gradeColor(avgGradePct) }}>{avgGradePct}</p>
          </CardContent>
        </Card>
        <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="pt-6">
            <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Current Streak</p>
            <p className="text-3xl font-bold mt-1 flex items-center gap-1" style={{ color: "var(--g-streak)" }}><Flame className="size-6" />{streak} days</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardHeader><CardTitle>Preferences</CardTitle><p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Communication style for AI coaching</p></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>SMS Tone</Label>
            <Select value={smsTone} onValueChange={setSmsTone}>
              <SelectTrigger className="w-full max-w-xs bg-[var(--g-bg-surface)]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default greeting</Label>
            <Input value={defaultGreeting} onChange={(e) => setDefaultGreeting(e.target.value)} className="bg-[var(--g-bg-surface)]" placeholder="Your typical call opener" />
          </div>
          <Button onClick={handleSavePreferences} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </CardContent>
      </Card>

      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="p-2 rounded-lg" style={{ background: "var(--g-accent-soft)" }}><Mic className="size-5" style={{ color: "var(--g-accent-text)" }} /></div>
          <div>
            <CardTitle>Voice Profile</CardTitle>
            <p className="text-sm mt-1" style={{ color: "var(--g-text-tertiary)" }}>We collect voice samples to personalize your AI experience and improve coaching feedback.</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--g-text-secondary)" }}>Voice Samples Collected: {voiceProfile?.totalSamples ?? 0}/20</p>
            <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ background: "var(--g-stat-bar-bg)" }}><div className="h-full rounded-full" style={{ background: "var(--g-accent)", width: `${Math.min(100, ((voiceProfile?.totalSamples ?? 0) / 20) * 100)}%` }} /></div>
          </div>
          <Button variant="outline" disabled={!voiceConsent} onClick={() => toast("Voice recording coming soon — your consent is saved.")}><Phone className="size-4" />Record Sample</Button>
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="voice-consent" className="text-sm" style={{ color: "var(--g-text-secondary)" }}>I consent to voice sample collection</Label>
            <Switch id="voice-consent" checked={voiceConsent} disabled={updateVoiceConsentMutation.isPending} onCheckedChange={async (v) => {
              setVoiceConsent(v);
              await updateVoiceConsentMutation.mutateAsync({ consentGiven: v });
              await refetchVoiceProfile();
            }} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
