import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ArrowDownToLine, ArrowUpFromLine, Star, Play, Plus, FileText } from "lucide-react";

interface MockCall {
  id: string;
  contactName: string;
  callerName: string;
  callType: string;
  direction: "inbound" | "outbound";
  duration: number;
  timestamp: string;
  starred: boolean;
  grade: number | null;
  scorecard?: {
    criteria: Array<{ name: string; earned: number; max: number }>;
    talkRatio: number;
    talkRatioTarget: { min: number; max: number };
    criticalFailures: string[];
    coachInsights: string[];
  };
}

const crit = (arr: [string, number, number][]) => arr.map(([name, earned, max]) => ({ name, earned, max }));
const MOCK_CALLS: MockCall[] = [
  { id: "1", contactName: "Sarah Mitchell", callerName: "Jake Thompson", callType: "Qualification", direction: "outbound", duration: 342, timestamp: "2 hours ago", starred: true, grade: 92, scorecard: { criteria: crit([["Opening & rapport",9,10],["Discovery questions",8,10],["Objection handling",10,10],["Closing attempt",7,10]]), talkRatio: 42, talkRatioTarget: { min: 35, max: 55 }, criticalFailures: [], coachInsights: ["Strong rapport building","Excellent objection handling","Consider shorter discovery"] } },
  { id: "2", contactName: "Marcus Chen", callerName: "Emma Rodriguez", callType: "Cold Call", direction: "outbound", duration: 128, timestamp: "5 hours ago", starred: false, grade: 58, scorecard: { criteria: crit([["Opening & rapport",4,10],["Discovery questions",3,10],["Objection handling",5,10],["Closing attempt",2,10]]), talkRatio: 72, talkRatioTarget: { min: 35, max: 55 }, criticalFailures: ["Did not qualify budget","Missed closing opportunity"], coachInsights: ["Talk ratio too high","Rushed discovery","Add value statements"] } },
  { id: "3", contactName: "David Park", callerName: "Jake Thompson", callType: "Follow-up", direction: "inbound", duration: 456, timestamp: "Yesterday", starred: false, grade: 78, scorecard: { criteria: crit([["Opening & rapport",8,10],["Discovery questions",7,10],["Objection handling",6,10],["Closing attempt",8,10]]), talkRatio: 48, talkRatioTarget: { min: 35, max: 55 }, criticalFailures: [], coachInsights: ["Good recap","Objection handling could be sharper"] } },
  { id: "4", contactName: "Lisa Wong", callerName: "Emma Rodriguez", callType: "Appointment", direction: "inbound", duration: 89, timestamp: "Yesterday", starred: true, grade: null },
  { id: "5", contactName: "James Foster", callerName: "Jake Thompson", callType: "Offer", direction: "outbound", duration: 521, timestamp: "2 days ago", starred: false, grade: 85, scorecard: { criteria: crit([["Opening & rapport",9,10],["Discovery questions",8,10],["Objection handling",8,10],["Closing attempt",7,10]]), talkRatio: 38, talkRatioTarget: { min: 35, max: 55 }, criticalFailures: [], coachInsights: ["Strong offer presentation","Good social proof"] } },
  { id: "6", contactName: "Rachel Green", callerName: "Emma Rodriguez", callType: "Not Interested", direction: "outbound", duration: 67, timestamp: "2 days ago", starred: false, grade: null },
  { id: "7", contactName: "Tom Bradley", callerName: "Jake Thompson", callType: "Qualification", direction: "inbound", duration: 234, timestamp: "3 days ago", starred: false, grade: 65, scorecard: { criteria: crit([["Opening & rapport",6,10],["Discovery questions",5,10],["Objection handling",7,10],["Closing attempt",6,10]]), talkRatio: 58, talkRatioTarget: { min: 35, max: 55 }, criticalFailures: ["Interrupted prospect"], coachInsights: ["Work on active listening"] } },
  { id: "8", contactName: "Nina Patel", callerName: "Emma Rodriguez", callType: "Cold Call", direction: "outbound", duration: 198, timestamp: "3 days ago", starred: true, grade: 88, scorecard: { criteria: crit([["Opening & rapport",9,10],["Discovery questions",8,10],["Objection handling",9,10],["Closing attempt",7,10]]), talkRatio: 44, talkRatioTarget: { min: 35, max: 55 }, criticalFailures: [], coachInsights: ["Excellent cold opener","Natural transition"] } },
];

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function gradeColor(grade: number | null) {
  if (grade === null) return "bg-[var(--g-text-tertiary)]";
  if (grade >= 90) return "bg-[var(--g-grade-a)]";
  if (grade >= 75) return "bg-[var(--g-grade-b)]";
  if (grade >= 60) return "bg-[var(--g-grade-c)]";
  return "bg-[var(--g-grade-f)]";
}

export function CallInbox() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(
    () => new Set(MOCK_CALLS.filter((c) => c.starred).map((c) => c.id))
  );
  const [tab, setTab] = useState("all");
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = MOCK_CALLS.filter((c) => {
      const q = search.toLowerCase();
      if (q && !c.contactName.toLowerCase().includes(q) && !c.callerName.toLowerCase().includes(q)) return false;
      if (tab === "needs-review" && c.grade !== null) return false;
      if (tab === "graded" && c.grade === null) return false;
      if (tab === "starred" && !starred.has(c.id)) return false;
      return true;
    });
    return list;
  }, [search, tab, starred]);

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarred((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold" style={{ color: "var(--g-text-primary)" }}>
          Calls
        </h1>
        <Input
          placeholder="Search contact or caller..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-48 text-sm"
        />
        <div className="flex gap-2">
          <select className="h-8 rounded-md border px-2 text-xs" style={{ borderColor: "var(--g-border-subtle)", background: "var(--g-bg-surface)" }}>
            <option>Last 7 days</option>
          </select>
          <select className="h-8 rounded-md border px-2 text-xs" style={{ borderColor: "var(--g-border-subtle)", background: "var(--g-bg-surface)" }}>
            <option>All status</option>
          </select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          <TabsTrigger value="needs-review" className="text-xs">Needs Review</TabsTrigger>
          <TabsTrigger value="graded" className="text-xs">Graded</TabsTrigger>
          <TabsTrigger value="starred" className="text-xs">Starred</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <ScrollArea className="h-[calc(100vh-220px)]">
            <div className="space-y-2 pr-4">
              {filtered.map((call) => (
                <div key={call.id}>
                  <Card
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-md",
                      expandedId === call.id && "ring-2 ring-[var(--g-accent)]"
                    )}
                    style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}
                    onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                  >
                    <CardContent className="p-4 py-3">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold truncate" style={{ color: "var(--g-text-primary)" }}>
                              {call.contactName}
                            </span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {call.callType}
                            </Badge>
                          </div>
                          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--g-text-tertiary)" }}>
                            {call.callerName} · {call.timestamp}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm tabular-nums" style={{ color: "var(--g-text-secondary)" }}>
                            {formatDuration(call.duration)}
                          </span>
                          {call.direction === "inbound" ? (
                            <ArrowDownToLine className="size-4" style={{ color: "var(--g-text-tertiary)" }} />
                          ) : (
                            <ArrowUpFromLine className="size-4" style={{ color: "var(--g-text-tertiary)" }} />
                          )}
                          <div
                            className={cn(
                              "size-10 rounded-full flex items-center justify-center font-mono font-bold text-sm text-white shrink-0",
                              gradeColor(call.grade)
                            )}
                          >
                            {call.grade !== null ? call.grade : "—"}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => toggleStar(call.id, e)}
                            className="shrink-0"
                          >
                            <Star
                              className={cn("size-4", starred.has(call.id) && "fill-amber-400 text-amber-500")}
                            />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {expandedId === call.id && call.scorecard && (
                    <Card className="mt-2" style={{ background: "var(--g-bg-surface)", borderColor: "var(--g-border-subtle)" }}>
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn("size-12 rounded-full flex items-center justify-center font-mono font-bold text-lg text-white", gradeColor(call.grade))}>
                              {call.grade}
                            </div>
                            <div>
                              <p className="font-semibold" style={{ color: "var(--g-text-primary)" }}>Scorecard</p>
                              <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                                Talk ratio: {call.scorecard.talkRatio}% (target {call.scorecard.talkRatioTarget.min}–{call.scorecard.talkRatioTarget.max}%)
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <Play className="size-3.5 mr-1" /> Listen
                            </Button>
                            <Button variant="outline" size="sm"><Plus className="size-3.5 mr-1" /> Task</Button>
                            <Button variant="outline" size="sm"><FileText className="size-3.5 mr-1" /> Note</Button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>Talk ratio</p>
                          <div className="h-2 rounded-full overflow-hidden relative" style={{ background: "var(--g-stat-bar-bg)" }}>
                            <div
                              className="absolute inset-y-0 rounded-full opacity-30"
                              style={{
                                left: `${call.scorecard.talkRatioTarget.min}%`,
                                width: `${call.scorecard.talkRatioTarget.max - call.scorecard.talkRatioTarget.min}%`,
                                background: "var(--g-grade-a)",
                              }}
                            />
                            <div
                              className="h-full rounded-full bg-[var(--g-accent)] relative z-10"
                              style={{ width: `${call.scorecard.talkRatio}%` }}
                            />
                          </div>
                        </div>
                        {call.scorecard.criticalFailures.length > 0 && (
                          <div className="text-sm text-red-600 dark:text-red-400">
                            <span className="font-medium">Critical: </span>
                            {call.scorecard.criticalFailures.join("; ")}
                          </div>
                        )}
                        <div className="space-y-2">
                          {call.scorecard.criteria.map((c) => (
                            <div key={c.name}>
                              <div className="flex justify-between text-xs mb-1">
                                <span style={{ color: "var(--g-text-secondary)" }}>{c.name}</span>
                                <span style={{ color: "var(--g-text-tertiary)" }}>{c.earned}/{c.max}</span>
                              </div>
                              <Progress value={(c.earned / c.max) * 100} className="h-1.5" />
                            </div>
                          ))}
                        </div>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium mb-2" style={{ color: "var(--g-text-secondary)" }}>Coach insights</p>
                          <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: "var(--g-text-secondary)" }}>
                            {call.scorecard.coachInsights.map((i, idx) => (
                              <li key={idx}>{i}</li>
                            ))}
                          </ul>
                        </div>
                        <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
                          <CollapsibleTrigger className="flex items-center gap-1 text-sm" style={{ color: "var(--g-accent-text)" }}>
                            {transcriptOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                            Transcript
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <p className="mt-2 text-sm p-3 rounded-md" style={{ background: "var(--g-bg-inset)", color: "var(--g-text-secondary)" }}>
                              [Transcript placeholder — mock data]
                            </p>
                          </CollapsibleContent>
                        </Collapsible>
                      </CardContent>
                    </Card>
                  )}

                  {expandedId === call.id && !call.scorecard && (
                    <Card className="mt-2" style={{ background: "var(--g-bg-surface)", borderColor: "var(--g-border-subtle)" }}>
                      <CardContent className="p-4">
                        <p className="text-sm" style={{ color: "var(--g-text-tertiary)" }}>Not yet graded.</p>
                        <Button variant="outline" size="sm" className="mt-2"><Play className="size-3.5 mr-1" /> Listen</Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
