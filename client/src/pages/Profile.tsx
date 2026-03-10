import { useState } from "react";
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
import { useAuth } from "@/hooks/useAuth";

const MOCK = { name: "Alex Rivera", email: "alex@company.com", role: "Lead Manager", callsGraded: 47, avgGrade: 84, streak: 12, smsTone: "professional", defaultGreeting: "Hi, this is Alex from New Again Houses." };

function gradeColor(grade: number) {
  if (grade >= 90) return "var(--g-grade-a)";
  if (grade >= 80) return "var(--g-grade-b)";
  if (grade >= 70) return "var(--g-grade-c)";
  if (grade >= 60) return "var(--g-grade-d)";
  return "var(--g-grade-f)";
}

export function Profile() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(MOCK.name);
  const [smsTone, setSmsTone] = useState(MOCK.smsTone);
  const [defaultGreeting, setDefaultGreeting] = useState(MOCK.defaultGreeting);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const displayName = user?.name ?? name;
  const displayEmail = user?.email ?? MOCK.email;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--g-accent), #5a1018)" }}>
          {(displayName || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            {editing ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-[200px] bg-[var(--g-bg-surface)]" />
            ) : (
              <h1 className="text-2xl font-bold" style={{ color: "var(--g-text-primary)" }}>{name}</h1>
            )}
            <Badge variant="secondary">{MOCK.role}</Badge>
            {editing ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setEditing(false)}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(MOCK.name); }}>Cancel</Button>
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
            <p className="text-3xl font-bold mt-1" style={{ color: "var(--g-text-primary)" }}>{MOCK.callsGraded}</p>
          </CardContent>
        </Card>
        <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="pt-6">
            <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Average Grade</p>
            <p className="text-3xl font-bold mt-1" style={{ color: gradeColor(MOCK.avgGrade) }}>{MOCK.avgGrade}</p>
          </CardContent>
        </Card>
        <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="pt-6">
            <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Current Streak</p>
            <p className="text-3xl font-bold mt-1 flex items-center gap-1" style={{ color: "var(--g-streak)" }}><Flame className="size-6" />{MOCK.streak} days</p>
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
          <Button>Save</Button>
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
            <p className="text-sm font-medium" style={{ color: "var(--g-text-secondary)" }}>Voice Samples Collected: 0/10</p>
            <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ background: "var(--g-stat-bar-bg)" }}><div className="h-full rounded-full w-0" style={{ background: "var(--g-accent)" }} /></div>
          </div>
          <Button variant="outline"><Phone className="size-4" />Record Sample</Button>
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="voice-consent" className="text-sm" style={{ color: "var(--g-text-secondary)" }}>I consent to voice sample collection</Label>
            <Switch id="voice-consent" checked={voiceConsent} onCheckedChange={setVoiceConsent} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
