import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MapPin,
  User,
  Flame,
  Eye,
  EyeOff,
  GitBranch,
  MessageSquare,
  FileText,
  Layers,
  ArrowDownRight,
  PhoneOff,
  PhoneMissed,
  Timer,
  Repeat,
  Skull,
  Building,
  PhoneCall,
  MessageCircle,
  DollarSign,
  TrendingDown,
  Ghost,
} from "lucide-react";
import { toast } from "sonner";
import { useDemo } from "@/hooks/useDemo";

const tierConfig = {
  missed: {
    label: "Missed",
    icon: AlertTriangle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    badgeVariant: "destructive" as const,
    description: "Deals slipping through the cracks — act now",
  },
  warning: {
    label: "At Risk",
    icon: AlertCircle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    badgeVariant: "secondary" as const,
    description: "Leads going cold — needs attention within 24h",
  },
  possible: {
    label: "Worth a Look",
    icon: Lightbulb,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    badgeVariant: "outline" as const,
    description: "Potential deals that deserve a second look",
  },
};

// Format raw rule keys (e.g. "timeline_offered_no_commitment") into readable labels
function formatRuleKey(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace(" No ", " — No ")
    .replace(" Without ", " — Without ");
}

const ruleConfig: Record<string, { label: string; icon: any; shortLabel: string }> = {
  backward_movement_no_call: {
    label: "Lead Moved to Follow Up Without a Call",
    icon: ArrowDownRight,
    shortLabel: "Moved Without Call",
  },
  repeat_inbound_ignored: {
    label: "Repeat Inbound — Nobody Responded",
    icon: Repeat,
    shortLabel: "Repeat Inbound",
  },
  followup_inbound_ignored: {
    label: "Follow Up Lead Reached Out — No Response",
    icon: PhoneMissed,
    shortLabel: "Inbound Ignored",
  },
  offer_no_followup: {
    label: "Offer Made — Team Went Silent",
    icon: PhoneOff,
    shortLabel: "Offer Stalled",
  },
  new_lead_sla_breach: {
    label: "New Lead — No Call Within 15 Min",
    icon: Timer,
    shortLabel: "SLA Breach",
  },
  price_stated_no_followup: {
    label: "Seller Stated Price — No Follow Up",
    icon: MessageSquare,
    shortLabel: "Price Stated",
  },
  motivated_one_and_done: {
    label: "Motivated Seller — Only 1 Call",
    icon: PhoneCall,
    shortLabel: "One & Done",
  },
  stale_active_stage: {
    label: "Stale in Active Stage",
    icon: Clock,
    shortLabel: "Stale Deal",
  },
  dead_with_selling_signals: {
    label: "DQ'd Lead Had Selling Signals",
    icon: Skull,
    shortLabel: "DQ'd w/ Signals",
  },
  walkthrough_no_offer: {
    label: "Walkthrough Done — No Offer Sent",
    icon: Building,
    shortLabel: "No Offer",
  },
  duplicate_property_address: {
    label: "Multiple Contacts — Same Property",
    icon: Layers,
    shortLabel: "Duplicate Property",
  },
  missed_callback_request: {
    label: "Callback Requested — None Made",
    icon: PhoneMissed,
    shortLabel: "Missed Callback",
  },
  high_talk_time_dq: {
    label: "Long Conversation — DQ'd Too Fast",
    icon: MessageCircle,
    shortLabel: "Talk Time DQ",
  },
  active_negotiation_in_followup: {
    label: "Active Engagement in Follow Up — Worth a Look",
    icon: MessageSquare,
    shortLabel: "Active Engagement",
  },
  timeline_offered_no_commitment: {
    label: "Seller Gave Timeline — No Next Step Locked In",
    icon: Clock,
    shortLabel: "Timeline, No Commitment",
  },
  post_walkthrough_ghosting: {
    label: "Post-Walkthrough Ghosting — Seller Went Silent",
    icon: Ghost,
    shortLabel: "Post-Walkthrough Ghost",
  },
};

const sourceConfig: Record<string, { label: string; icon: any; color: string }> = {
  pipeline: { label: "Pipeline", icon: GitBranch, color: "text-purple-500" },
  conversation: { label: "Conversation", icon: MessageSquare, color: "text-blue-500" },
  transcript: { label: "Transcript", icon: FileText, color: "text-green-500" },
  hybrid: { label: "Pipeline + Transcript", icon: Layers, color: "text-orange-500" },
};

export default function Opportunities() {
  const { isDemo, guardAction: guardDemoAction } = useDemo();
  const [activeTab, setActiveTab] = useState("all");
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissDialogId, setDismissDialogId] = useState<number | null>(null);
  const [dismissReason, setDismissReason] = useState<"false_positive" | "not_a_deal" | "already_handled" | "duplicate" | "other">("not_a_deal");
  const [dismissNote, setDismissNote] = useState("");

  const { data: counts, refetch: refetchCounts } = trpc.opportunities.counts.useQuery();
  const { data: opportunities, isLoading, refetch: refetchList } = trpc.opportunities.list.useQuery({
    tier: activeTab === "all" ? "all" : activeTab as "missed" | "warning" | "possible",
    status: showDismissed ? "all" : "active",
  });

  const resolveMutation = trpc.opportunities.resolve.useMutation({
    onSuccess: () => {
      refetchList();
      refetchCounts();
    },
  });

  const runDetectionMutation = trpc.opportunities.runDetection.useMutation({
    onSuccess: (result) => {
      toast.success(`Pipeline scan complete — found ${result.detected} new signals`);
      refetchList();
      refetchCounts();
    },
    onError: (err) => {
      toast.error(`Detection failed: ${err.message}`);
    },
  });

  const toggleExpanded = (id: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResolve = (id: number, status: "handled" | "dismissed") => {
    if (guardDemoAction("Pipeline actions")) return;
    if (status === "dismissed") {
      setDismissDialogId(id);
      setDismissReason("not_a_deal");
      setDismissNote("");
      return;
    }
    resolveMutation.mutate({ id, status });
  };

  const confirmDismiss = () => {
    if (guardDemoAction("Pipeline actions")) return;
    if (dismissDialogId === null) return;
    resolveMutation.mutate({
      id: dismissDialogId,
      status: "dismissed",
      dismissReason,
      dismissNote: dismissNote.trim() || undefined,
    }, {
      onSuccess: () => {
        setDismissDialogId(null);
        refetchList();
        refetchCounts();
      },
    });
  };

  const formatTimeAgo = (date: Date | string | null) => {
    if (!date) return "Unknown";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHrs > 0) return `${diffHrs}h ago`;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}m ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tighter">Pipeline Signals</h1>
          <p className="text-muted-foreground mt-1">
            Deals your team might be missing — detected from pipeline activity, conversations, and call data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDismissed(!showDismissed)}
          >
            {showDismissed ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {showDismissed ? "Hide Resolved" : "Show Resolved"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runDetectionMutation.mutate()}
            disabled={runDetectionMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${runDetectionMutation.isPending ? "animate-spin" : ""}`} />
            Scan Pipeline
          </Button>
        </div>
      </div>

      {/* Tier Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["missed", "warning", "possible"] as const).map(tier => {
          const config = tierConfig[tier];
          const count = counts?.[tier] || 0;
          const Icon = config.icon;
          return (
            <Card
              key={tier}
              className={`cursor-pointer transition-all hover:shadow-md ${activeTab === tier ? `${config.borderColor} border-2` : ""}`}
              onClick={() => setActiveTab(activeTab === tier ? "all" : tier)}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.bgColor}`}>
                      <Icon className={`h-5 w-5 ${config.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{config.label}</p>
                      <p className="text-2xl font-bold">{count}</p>
                    </div>
                  </div>
                  {count > 0 && (
                    <Badge variant={config.badgeVariant} className="text-xs">
                      {count} active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{config.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Opportunities List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            All
            {counts?.total ? <Badge variant="secondary" className="ml-1.5 text-xs">{counts.total}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="missed">
            <AlertTriangle className="h-3.5 w-3.5 mr-1 text-red-500" />
            Missed
            {counts?.missed ? <Badge variant="destructive" className="ml-1.5 text-xs">{counts.missed}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="warning">
            <AlertCircle className="h-3.5 w-3.5 mr-1 text-amber-500" />
            At Risk
            {counts?.warning ? <Badge variant="secondary" className="ml-1.5 text-xs">{counts.warning}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="possible">
            <Lightbulb className="h-3.5 w-3.5 mr-1 text-blue-500" />
            Worth a Look
            {counts?.possible ? <Badge variant="outline" className="ml-1.5 text-xs">{counts.possible}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-6">
                    <div className="h-20 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !opportunities?.length ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-semibold">No Urgent Signals — Your Team Is on Track</h3>
                  <p className="text-muted-foreground mt-1">
                    {activeTab === "all"
                      ? "No missed follow-ups or stale leads detected. Scan the pipeline anytime to double-check."
                      : `No ${tierConfig[activeTab as keyof typeof tierConfig]?.label.toLowerCase()} signals right now — looking good.`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => runDetectionMutation.mutate()}
                    disabled={runDetectionMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1.5 ${runDetectionMutation.isPending ? "animate-spin" : ""}`} />
                    Scan Pipeline Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {opportunities.map(opp => {
                const tier = opp.tier as keyof typeof tierConfig;
                const config = tierConfig[tier];
                const primaryRule = (opp.triggerRules as string[])?.[0] || "";
                const rule = ruleConfig[primaryRule];
                const RuleIcon = rule?.icon || config.icon;
                const isExpanded = expandedCards.has(opp.id);
                const isResolved = opp.status !== "active";
                const source = sourceConfig[(opp as any).detectionSource || "pipeline"];

                return (
                  <Card
                    key={opp.id}
                    className={`transition-all ${isResolved ? "opacity-60" : ""} ${config.borderColor} border-l-4`}
                  >
                    <CardContent className="pt-4 pb-3">
                      {/* Main Row */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`p-1.5 rounded-md ${config.bgColor} mt-0.5 shrink-0`}>
                            <RuleIcon className={`h-4 w-4 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">
                                {rule?.label || formatRuleKey(primaryRule) || "Signal"}
                              </span>
                              <Badge variant={config.badgeVariant} className="text-[10px] px-1.5 py-0">
                                {config.label}
                              </Badge>
                              {opp.priorityScore && Number(opp.priorityScore) >= 80 && (
                                <Flame className="h-3.5 w-3.5 text-orange-500" />
                              )}
                              {isResolved && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {opp.status === "dismissed" && (opp as any).dismissReason
                                    ? `Dismissed: ${(opp as any).dismissReason.replace(/_/g, " ")}`
                                    : opp.status}
                                </Badge>
                              )}
                            </div>

                            {/* Contact & Pipeline Info */}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                              {opp.contactName && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {opp.contactName}
                                </span>
                              )}
                              {opp.propertyAddress && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {opp.propertyAddress}
                                </span>
                              )}
                              {(opp as any).ghlPipelineStageName && (
                                <span className="flex items-center gap-1">
                                  <GitBranch className="h-3 w-3" />
                                  {(opp as any).ghlPipelineStageName}
                                </span>
                              )}
                              {opp.teamMemberName && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {opp.teamMemberName}
                                </span>
                              )}
                              {source && (
                                <span className={`flex items-center gap-1 ${source.color}`}>
                                  <source.icon className="h-3 w-3" />
                                  {source.label}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTimeAgo(opp.flaggedAt)}
                              </span>
                            </div>

                            {/* Price Data (at a glance) */}
                            {((opp as any).ourOffer || (opp as any).sellerAsk) && (
                              <div className="flex items-center gap-3 mt-2 flex-wrap">
                                {(opp as any).ourOffer && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">
                                    <DollarSign className="h-3 w-3" />
                                    Our Offer: ${Number((opp as any).ourOffer).toLocaleString()}
                                  </span>
                                )}
                                {(opp as any).sellerAsk && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-md">
                                    <DollarSign className="h-3 w-3" />
                                    Seller Ask: ${Number((opp as any).sellerAsk).toLocaleString()}
                                  </span>
                                )}
                                {(opp as any).priceGap && (
                                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${
                                    Number((opp as any).priceGap) >= 120000
                                      ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                      : Number((opp as any).priceGap) < 50000
                                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                        : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                                  }`}>
                                    <TrendingDown className="h-3 w-3" />
                                    Gap: ${Number((opp as any).priceGap).toLocaleString()}
                                    {Number((opp as any).priceGap) >= 120000 && " ⚠️"}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* AI Reason (always visible) */}
                            <p className="text-sm mt-2 text-foreground/80">
                              {opp.reason || "Signal detected from pipeline activity."}
                            </p>

                            {/* Missed Items — context depends on tier */}
                            {(opp as any).missedItems && Array.isArray((opp as any).missedItems) && (opp as any).missedItems.length > 0 && (
                              <div className={`mt-2 rounded-lg p-2.5 ${
                                (opp as any).tier === "possible"
                                  ? "bg-blue-500/5 border border-blue-500/20"
                                  : "bg-amber-500/5 border border-amber-500/20"
                              }`}>
                                <p className={`text-[11px] font-semibold mb-1.5 flex items-center gap-1 ${
                                  (opp as any).tier === "possible"
                                    ? "text-blue-600 dark:text-blue-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}>
                                  <Eye className="h-3 w-3" />
                                  {(opp as any).tier === "possible" ? "Why This Is Worth a Look" : "What They Missed"}
                                </p>
                                <ul className="space-y-1">
                                  {((opp as any).missedItems as string[]).map((item: string, idx: number) => (
                                    <li key={idx} className="text-xs text-foreground/70 flex items-start gap-1.5">
                                      <span className={`mt-0.5 shrink-0 ${(opp as any).tier === "possible" ? "text-blue-500" : "text-amber-500"}`}>•</span>
                                      <span>{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {!isResolved && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => handleResolve(opp.id, "handled")}
                                disabled={resolveMutation.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                On It
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleResolve(opp.id, "dismissed")}
                                disabled={resolveMutation.isPending}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Not a Deal
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => toggleExpanded(opp.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t space-y-3">
                          {/* AI Suggestion */}
                          {opp.suggestion && (
                            <div className="bg-primary/5 rounded-lg p-3">
                              <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                                <Lightbulb className="h-3 w-3" />
                                Recommended Next Step
                              </p>
                              <p className="text-sm">{opp.suggestion}</p>
                            </div>
                          )}

                          {/* Details Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {(opp as any).ghlPipelineStageName && (
                              <div>
                                <span className="text-muted-foreground">Pipeline Stage</span>
                                <p className="font-medium">{(opp as any).ghlPipelineStageName}</p>
                              </div>
                            )}
                            {opp.priorityScore && (
                              <div>
                                <span className="text-muted-foreground">Priority Score</span>
                                <p className="font-medium">{opp.priorityScore}/100</p>
                              </div>
                            )}
                            {(opp as any).lastActivityAt && (
                              <div>
                                <span className="text-muted-foreground">Last Activity</span>
                                <p className="font-medium">{formatTimeAgo((opp as any).lastActivityAt)}</p>
                              </div>
                            )}
                            {opp.flaggedAt && (
                              <div>
                                <span className="text-muted-foreground">Detected</span>
                                <p className="font-medium">{new Date(opp.flaggedAt).toLocaleString()}</p>
                              </div>
                            )}
                            {opp.contactPhone && (
                              <div>
                                <span className="text-muted-foreground">Phone</span>
                                <p className="font-medium">{opp.contactPhone}</p>
                              </div>
                            )}
                            {(opp as any).assignedTo && (
                              <div>
                                <span className="text-muted-foreground">Assigned To</span>
                                <p className="font-medium">{(opp as any).assignedTo}</p>
                              </div>
                            )}
                            {opp.relatedCallId && (
                              <div>
                                <span className="text-muted-foreground">Related Call</span>
                                <p className="font-medium">#{opp.relatedCallId}</p>
                              </div>
                            )}
                            {(opp as any).detectionSource && (
                              <div>
                                <span className="text-muted-foreground">Detection Source</span>
                                <p className="font-medium capitalize">{(opp as any).detectionSource}</p>
                              </div>
                            )}
                          </div>

                          {/* Trigger Rules */}
                          {opp.triggerRules && Array.isArray(opp.triggerRules) && opp.triggerRules.length > 0 && (
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Detection Rules</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(opp.triggerRules as string[]).map((r, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px]">
                                    {ruleConfig[r]?.shortLabel || formatRuleKey(r)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dismiss Reason Dialog */}
      <Dialog open={dismissDialogId !== null} onOpenChange={(open) => { if (!open) setDismissDialogId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dismiss Signal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Select value={dismissReason} onValueChange={(v: any) => setDismissReason(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_a_deal">Not a Deal</SelectItem>
                  <SelectItem value="false_positive">False Positive</SelectItem>
                  <SelectItem value="already_handled">Already Handled</SelectItem>
                  <SelectItem value="duplicate">Duplicate Signal</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Note <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                placeholder="Add context for why this was dismissed..."
                value={dismissNote}
                onChange={(e) => setDismissNote(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissDialogId(null)}>Cancel</Button>
            <Button onClick={confirmDismiss} disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? "Dismissing..." : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
