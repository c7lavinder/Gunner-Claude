import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { GraduationCap, TrendingUp, Shield, Target, Zap, BookOpen, Lock, Award } from "lucide-react";

const RECENT_CALLS = [
  { id: "1", contact: "Sarah Mitchell", date: "2 hours ago", grade: 92, summary: "Strong rapport and objection handling." },
  { id: "2", contact: "Marcus Chen", date: "5 hours ago", grade: 58, summary: "Talk ratio too high, rushed discovery." },
  { id: "3", contact: "David Park", date: "Yesterday", grade: 78, summary: "Good recap, objection handling could improve." },
  { id: "4", contact: "James Foster", date: "2 days ago", grade: 85, summary: "Strong offer presentation." },
  { id: "5", contact: "Nina Patel", date: "3 days ago", grade: 88, summary: "Excellent cold opener." },
];

const MATERIALS = [
  { id: "1", title: "Overcoming Objections", desc: "Handle objections with confidence.", icon: Shield, unlocked: true },
  { id: "2", title: "Tonality Mastery", desc: "Voice tone and pacing techniques.", icon: Target, unlocked: true },
  { id: "3", title: "Speed to Lead", desc: "Respond faster, win more.", icon: Zap, unlocked: true },
  { id: "4", title: "Closing Techniques", desc: "Seal the deal effectively.", icon: Award, unlocked: true },
  { id: "5", title: "Active Listening", desc: "Listen to understand, not to reply.", icon: BookOpen, unlocked: false },
];

const GRADE_BARS = [82, 78, 85, 88, 82, 79, 84, 86, 82, 85];

function gradeClass(grade: number) {
  if (grade >= 90) return "bg-[var(--g-grade-a)]";
  if (grade >= 75) return "bg-[var(--g-grade-b)]";
  if (grade >= 60) return "bg-[var(--g-grade-c)]";
  return "bg-[var(--g-grade-f)]";
}

export function Training() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--g-text-primary)" }}>
        <GraduationCap className="size-6" style={{ color: "var(--g-accent-text)" }} />
        Training
      </h1>

      <Card className="overflow-hidden" style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--g-text-primary)" }}>Your AI Coach</h2>
          <div className="flex flex-wrap gap-6 items-start">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold font-mono text-white" style={{ background: "var(--g-grade-b)" }}>82</div>
              <div>
                <div className="text-sm" style={{ color: "var(--g-text-secondary)" }}>Grade average</div>
                <Badge className="mt-1 gap-1" style={{ background: "var(--g-up-bg)", color: "var(--g-up)", border: "none" }}>
                  <TrendingUp className="size-3" /> Improving
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {GRADE_BARS.map((v, i) => (
                <div
                  key={i}
                  className="w-2 rounded-sm"
                  style={{
                    height: 24 + (v / 100) * 20,
                    background: v >= 90 ? "var(--g-grade-a)" : v >= 75 ? "var(--g-grade-b)" : v >= 60 ? "var(--g-grade-c)" : "var(--g-grade-f)",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>Key strengths:</span>
            {["Rapport building", "Objection handling", "Discovery"].map((s) => (
              <Badge key={s} variant="secondary" className="text-xs" style={{ background: "var(--g-grade-a-bg)", color: "var(--g-grade-a)", border: "none" }}>{s}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>Growth areas:</span>
            {["Talk ratio", "Closing speed", "Active listening"].map((s) => (
              <Badge key={s} variant="secondary" className="text-xs" style={{ background: "var(--g-grade-c-bg)", color: "var(--g-grade-c)", border: "none" }}>{s}</Badge>
            ))}
          </div>
          <Button className="mt-4" size="lg">Start Coaching Session</Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--g-text-secondary)" }}>Recent Calls to Review</h2>
        <div className="space-y-2 overflow-x-auto">
          {RECENT_CALLS.map((call) => (
            <Link key={call.id} href={`/calls?call=${call.id}`}>
              <Card className="flex items-center gap-4 p-4 cursor-pointer transition hover:border-[var(--g-border-medium)]" style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold font-mono text-white shrink-0", gradeClass(call.grade))}>{call.grade}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate" style={{ color: "var(--g-text-primary)" }}>{call.contact}</div>
                  <div className="text-xs truncate" style={{ color: "var(--g-text-tertiary)" }}>{call.summary}</div>
                </div>
                <div className="text-xs shrink-0" style={{ color: "var(--g-text-tertiary)" }}>{call.date}</div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--g-text-secondary)" }}>Training Material</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MATERIALS.map((m) => (
            <Card key={m.id} className={cn(!m.unlocked && "opacity-70")} style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: m.unlocked ? "var(--g-accent-soft)" : "var(--g-bg-inset)" }}>
                    {m.unlocked ? <m.icon className="size-5" style={{ color: "var(--g-accent-text)" }} /> : <Lock className="size-5" style={{ color: "var(--g-text-tertiary)" }} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium" style={{ color: "var(--g-text-primary)" }}>{m.title}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>{m.desc}</div>
                  </div>
                </div>
                <Button variant={m.unlocked ? "default" : "secondary"} size="sm" disabled={!m.unlocked}>{m.unlocked ? "Read" : "Locked"}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--g-text-primary)" }}>Your Journey</h2>
          <div className="flex items-center gap-4 mb-4">
            <Badge className="text-lg px-4 py-1" style={{ background: "var(--g-accent-soft)", color: "var(--g-accent-text)", border: "none" }}>Level 7</Badge>
            <div className="flex-1">
              <div className="text-xs mb-1" style={{ color: "var(--g-text-tertiary)" }}>XP to Level 8</div>
              <Progress value={68} className="h-2" />
            </div>
          </div>
          <div className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Milestones: First 10 calls graded, 5 A+ calls, Speed to Lead mastery</div>
        </CardContent>
      </Card>
    </div>
  );
}
