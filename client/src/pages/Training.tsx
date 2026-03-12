import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { GraduationCap, TrendingUp, TrendingDown, Shield, Target, Zap, BookOpen, Lock, Award, X, MessageSquare, Phone, Users, ChevronRight, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { LEVEL_THRESHOLDS } from "@shared/types";

const MATERIAL_ICONS: Record<string, typeof Shield> = {
  objections: Shield,
  tonality: Target,
  speed: Zap,
  closing: Award,
  listening: BookOpen,
};

function gradeClass(grade: number) {
  if (grade >= 90) return "bg-[var(--g-grade-a)]";
  if (grade >= 75) return "bg-[var(--g-grade-b)]";
  if (grade >= 60) return "bg-[var(--g-grade-c)]";
  return "bg-[var(--g-grade-f)]";
}

function letterToScore(letter: string | null): number {
  if (!letter) return 0;
  const m: Record<string, number> = { A: 92, B: 82, C: 72, D: 62, F: 42 };
  return m[letter.toUpperCase()] ?? 0;
}

function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

export function Training() {
  const { algorithm } = useTenantConfig();
  const roleplayPersonas = (algorithm.roleplayPersonas as Array<{ id: string; name: string }> | undefined) ?? [];
  const { data: materials, isLoading: materialsLoading } = trpc.training.getMaterials.useQuery();
  const { data: progress, isLoading: progressLoading } = trpc.training.getUserProgress.useQuery();
  const [selectedMaterial, setSelectedMaterial] = useState<{ id: number; title: string; content: string | null; description: string | null } | null>(null);
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<string>("general_coaching");
  const roleplayMutation = trpc.training.startRoleplay.useMutation();
  const [roleplayResponse, setRoleplayResponse] = useState<string | null>(null);

  const isLoading = materialsLoading || progressLoading;
  const avgGrade100 = Math.round((progress?.avgGrade ?? 0) * 25);
  const recentCalls = progress?.recentCalls ?? [];
  const gradeBars = recentCalls.slice(0, 10).map((r) => letterToScore(r.grade));
  const xp = progress?.xp ?? 0;
  const level = progress?.level ?? 1;

  const currentThreshold = LEVEL_THRESHOLDS[Math.max(0, level - 1)] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[Math.min(level, LEVEL_THRESHOLDS.length - 1)] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]!;
  const xpForNext = Math.max(1, nextThreshold - currentThreshold);
  const xpInLevel = Math.max(0, xp - currentThreshold);
  const progressPct = Math.min(100, (xpInLevel / xpForNext) * 100);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-[var(--g-text-primary)]">
          <GraduationCap className="size-6 text-[var(--g-accent-text)]" />
          Training
        </h1>
        <Card className="overflow-hidden bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm text-[var(--g-text-tertiary)]">
              <div className="size-4 animate-spin rounded-full border-2 border-[var(--g-border-medium)] border-t-[var(--g-accent)]" />
              Loading your training data...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-[var(--g-text-primary)]">
        <GraduationCap className="size-6 text-[var(--g-accent-text)]" />
        Training
      </h1>

      <Card className="overflow-hidden bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-[var(--g-text-primary)]">Your AI Coach</h2>
          <div className="flex flex-wrap gap-6 items-start">
            <div className="flex items-center gap-3">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold font-mono text-white"
                style={{
                  background: avgGrade100 >= 90 ? "var(--g-grade-a)" : avgGrade100 >= 75 ? "var(--g-grade-b)" : avgGrade100 >= 60 ? "var(--g-grade-c)" : "var(--g-grade-f)",
                }}
              >
                {avgGrade100}
              </div>
              <div>
                <div className="text-sm text-[var(--g-text-secondary)]">Grade average</div>
                <Badge
                  className="mt-1 gap-1"
                  style={{
                    background: progress?.trend === "up" ? "var(--g-up-bg)" : progress?.trend === "down" ? "var(--g-down-bg)" : "var(--g-bg-inset)",
                    color: progress?.trend === "up" ? "var(--g-up)" : progress?.trend === "down" ? "var(--g-down)" : "var(--g-text-tertiary)",
                    border: "none",
                  }}
                >
                  {progress?.trend === "up" ? <TrendingUp className="size-3" /> : progress?.trend === "down" ? <TrendingDown className="size-3" /> : null}
                  {progress?.trend === "up" ? "Improving" : progress?.trend === "down" ? "Declining" : "Stable"}
                </Badge>
              </div>
            </div>
            {gradeBars.length > 0 && (
              <div className="flex items-center gap-1.5">
                {gradeBars.map((v, i) => (
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
            )}
          </div>
          {roleplayPersonas.length > 0 && (
            <Select
              value={selectedPersona}
              onValueChange={setSelectedPersona}
            >
              <SelectTrigger className="mt-4 w-full max-w-xs bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]">
                <SelectValue placeholder="Select persona" />
              </SelectTrigger>
              <SelectContent>
                {roleplayPersonas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            className="mt-4"
            size="lg"
            onClick={() => {
              setCoachingOpen(true);
              roleplayMutation.mutate(
                { scenario: selectedPersona },
                { onSuccess: (data) => setRoleplayResponse(data) }
              );
            }}
            disabled={roleplayMutation.isPending}
          >
            <MessageSquare className="size-4 mr-2" />
            {roleplayMutation.isPending ? "Starting..." : "Start Coaching Session"}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-3 text-[var(--g-text-secondary)]">Recent Calls to Review</h2>
        {recentCalls.length === 0 ? (
          <EmptyState
            icon={Phone}
            title="No graded calls yet"
            description="Calls will appear here after they are graded by the AI."
          />
        ) : (
          <div className="space-y-2 overflow-x-auto">
            {recentCalls.map(({ call, grade }) => (
              <Link key={call.id} href={`/calls?call=${call.id}`}>
                <Card className="flex items-center gap-4 p-4 cursor-pointer transition hover:border-[var(--g-border-medium)] bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold font-mono text-white shrink-0", gradeClass(letterToScore(grade)))}>
                    {letterToScore(grade)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-[var(--g-text-primary)]">{call.contactName ?? "Unknown"}</div>
                    <div className="text-xs truncate text-[var(--g-text-tertiary)]">Graded</div>
                  </div>
                  <div className="text-xs shrink-0 text-[var(--g-text-tertiary)]">
                    {formatRelative(call.callTimestamp ?? call.createdAt)}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3 text-[var(--g-text-secondary)]">Training Material</h2>
        {!materials?.length ? (
          <EmptyState
            icon={BookOpen}
            title="No training materials yet"
            description="Training materials will be added by your admin or generated by the AI coach."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((m) => {
              const minLevel = (m as { minLevel?: number | null }).minLevel ?? null;
              const unlocked = minLevel === null || level >= minLevel;
              const Icon = MATERIAL_ICONS[m.category ?? ""] ?? BookOpen;
              return (
                <Card key={m.id} className={cn("bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]", !unlocked && "opacity-70")}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", unlocked ? "bg-[var(--g-accent-soft)]" : "bg-[var(--g-bg-inset)]")}>
                        {unlocked ? <Icon className="size-5 text-[var(--g-accent-text)]" /> : <Lock className="size-5 text-[var(--g-text-tertiary)]" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--g-text-primary)]">{m.title}</div>
                        <div className="text-xs mt-0.5 text-[var(--g-text-tertiary)]">{m.description ?? ""}</div>
                      </div>
                    </div>
                    <Button
                      variant={unlocked ? "default" : "secondary"}
                      size="sm"
                      disabled={!unlocked}
                      onClick={() => unlocked && setSelectedMaterial({ id: m.id, title: m.title, content: m.content, description: m.description })}
                    >
                      {unlocked ? "Read" : "Locked"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-[var(--g-text-primary)]">Your Journey</h2>
          <div className="flex items-center gap-4 mb-4">
            <Badge className="text-lg px-4 py-1 bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] border-none">
              Level {level}
            </Badge>
            <div className="flex-1">
              <div className="text-xs mb-1 text-[var(--g-text-tertiary)]">XP to Level {level + 1}</div>
              <Progress value={progressPct} className="h-2" />
            </div>
          </div>
          <div className="text-xs text-[var(--g-text-tertiary)]">
            {xp} XP total · {progress?.streak ?? 0} day streak
          </div>
        </CardContent>
      </Card>

      <ObjectionLibrary roleplayPersonas={roleplayPersonas} />

      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-[var(--g-text-primary)] flex items-center gap-2">
            <Users className="size-5 text-[var(--g-accent-text)]" />
            Team Training
          </h2>
          <p className="text-sm text-[var(--g-text-secondary)] mb-4">
            Schedule a team training session to sharpen your sales skills together.
          </p>
          <Button onClick={() => toast("Team training scheduling — contact your account manager to set up a session.")}>
            Schedule Session
          </Button>
        </CardContent>
      </Card>

      {selectedMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedMaterial(null)}>
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col m-4 bg-[var(--g-bg-card)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--g-border-subtle)]">
              <h3 className="font-semibold text-[var(--g-text-primary)]">{selectedMaterial.title}</h3>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSelectedMaterial(null)}><X className="size-4" /></Button>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="prose prose-sm max-w-none text-[var(--g-text-secondary)]">
                {selectedMaterial.content ? (
                  <div className="whitespace-pre-wrap">{selectedMaterial.content}</div>
                ) : (
                  <p>{selectedMaterial.description || "No content available for this material yet."}</p>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      )}

      {coachingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setCoachingOpen(false); setRoleplayResponse(null); }}>
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col m-4 bg-[var(--g-bg-card)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--g-border-subtle)]">
              <h3 className="font-semibold text-[var(--g-text-primary)]">Coaching Session</h3>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => { setCoachingOpen(false); setRoleplayResponse(null); }}><X className="size-4" /></Button>
            </div>
            <ScrollArea className="flex-1 p-4">
              {roleplayMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-[var(--g-text-tertiary)]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
                  Your AI coach is preparing...
                </div>
              )}
              {roleplayResponse && (
                <div className="text-sm whitespace-pre-wrap text-[var(--g-text-secondary)]">
                  {roleplayResponse}
                </div>
              )}
              {roleplayMutation.isError && (
                <p className="text-sm text-red-400">{roleplayMutation.error.message}</p>
              )}
            </ScrollArea>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ── Objection Library with expandable responses ── */

const CANNED_RESPONSES: Record<string, string> = {
  "I need to think about it": "I completely understand — this is a big decision. Just so I can help you think it through, what specifically are you weighing? Is it the price, the timeline, or something else? Most sellers I work with felt the same way, but once we walked through the numbers together, the decision became much clearer.",
  "Your offer is too low": "I appreciate you being upfront about that. Our offer is based on the current condition of the property and the repairs needed. Let me walk you through exactly how we arrived at that number — once you see the breakdown, it usually makes a lot more sense. What price did you have in mind?",
  "I'm not in a rush to sell": "That's totally fine — there's no pressure here. A lot of the homeowners I work with weren't in a rush either. They just wanted to know their options. Would it be helpful if I showed you what your property could sell for today, just so you have a number in your back pocket?",
  "I want to list with an agent": "That's a great option for a lot of people. The main difference is time and certainty — with an agent, you might get a higher price but it could take months, plus you'll have showings, repairs, and commissions. With us, you get a guaranteed close in as little as two weeks. Would it help to compare both scenarios side by side?",
  "I already have another offer": "That's great — competition is healthy. Out of curiosity, is that offer contingent on financing or inspection? Ours is a cash offer with no contingencies and a flexible closing date. Sometimes sellers find that the certainty of our offer is worth more than a slightly higher number with strings attached.",
};

function ObjectionLibrary({ roleplayPersonas }: { roleplayPersonas: Array<{ id: string; name: string }> }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const allObjections = roleplayPersonas.flatMap((p) => (p as { objections?: string[] }).objections ?? []);
  const uniqueObjections = Array.from(new Set(allObjections));

  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 text-[var(--g-text-primary)] flex items-center gap-2">
          <BookOpen className="size-5 text-[var(--g-accent-text)]" />
          Objection Library
        </h2>
        {uniqueObjections.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No objections loaded"
            description="Objections will appear here from your Industry Playbook's roleplay personas."
          />
        ) : (
          <div className="space-y-2">
            {uniqueObjections.map((objection) => {
              const isOpen = expanded === objection;
              const response = CANNED_RESPONSES[objection] ?? "Acknowledge their concern, ask a clarifying question to understand the real objection, then reframe the value of your offer in terms of what matters most to them — speed, certainty, or convenience.";
              return (
                <div key={objection} className="rounded-lg border border-[var(--g-border-subtle)] overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--g-bg-surface)] transition-colors"
                    onClick={() => setExpanded(isOpen ? null : objection)}
                  >
                    <span className="text-sm font-medium text-[var(--g-text-primary)]">{objection}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1 text-[var(--g-text-secondary)]"
                    >
                      {isOpen ? "Hide" : "View Response"}
                      {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      <div className="bg-[var(--g-bg-inset)] rounded-lg p-3 text-sm text-[var(--g-text-secondary)] leading-relaxed">
                        {response}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Badge variant="outline" className="mt-3 text-[10px] text-[var(--g-text-tertiary)]">
          Powered by Industry Playbook
        </Badge>
      </CardContent>
    </Card>
  );
}
