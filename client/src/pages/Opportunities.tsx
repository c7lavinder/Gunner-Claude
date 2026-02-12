import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Calendar,
  ArrowRight,
  Flame,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

const tierConfig = {
  missed: {
    label: "Missed",
    icon: AlertTriangle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    badgeVariant: "destructive" as const,
    description: "Revenue-impacting opportunities that need immediate attention",
  },
  warning: {
    label: "Warning",
    icon: AlertCircle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    badgeVariant: "secondary" as const,
    description: "Leads at risk of going cold — act within 24 hours",
  },
  possible: {
    label: "Possible",
    icon: Lightbulb,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    badgeVariant: "outline" as const,
    description: "Coaching moments and process improvements to review",
  },
};

const ruleLabels: Record<string, string> = {
  motivated_seller_no_followup: "Motivated Seller — No Follow-up",
  objection_not_handled: "Objection Not Handled",
  verbal_commitment_dropped: "Verbal Commitment Dropped",
  slow_response: "Slow Response Time",
  unanswered_callback: "Unanswered Callback Request",
  stale_lead: "Stale Lead",
  low_score_no_coaching: "Low Score — No Coaching",
  missed_upsell: "Missed Upsell Opportunity",
  incomplete_info: "Incomplete Information Gathered",
};

export default function Opportunities() {
  const [activeTab, setActiveTab] = useState("all");
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

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
      toast.success(`Detection complete — found ${result.detected} new opportunities`);
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
    resolveMutation.mutate({ id, status });
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
          <h1 className="text-2xl font-bold tracking-tight">Opportunities</h1>
          <p className="text-muted-foreground mt-1">
            AI-detected missed opportunities and at-risk leads
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
            Run Detection
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
            Warning
            {counts?.warning ? <Badge variant="secondary" className="ml-1.5 text-xs">{counts.warning}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="possible">
            <Lightbulb className="h-3.5 w-3.5 mr-1 text-blue-500" />
            Possible
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
                  <h3 className="text-lg font-semibold">All Clear</h3>
                  <p className="text-muted-foreground mt-1">
                    {activeTab === "all"
                      ? "No active opportunities detected. Run detection to scan for new ones."
                      : `No ${tierConfig[activeTab as keyof typeof tierConfig]?.label.toLowerCase()} opportunities found.`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => runDetectionMutation.mutate()}
                    disabled={runDetectionMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1.5 ${runDetectionMutation.isPending ? "animate-spin" : ""}`} />
                    Run Detection Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {opportunities.map(opp => {
                const tier = opp.tier as keyof typeof tierConfig;
                const config = tierConfig[tier];
                const Icon = config.icon;
                const isExpanded = expandedCards.has(opp.id);
                const isResolved = opp.status !== "active";

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
                            <Icon className={`h-4 w-4 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">
                                {ruleLabels[opp.triggerRules?.[0] as string] || (opp.triggerRules?.[0] as string) || "Opportunity"}
                              </span>
                              <Badge variant={config.badgeVariant} className="text-[10px] px-1.5 py-0">
                                {config.label}
                              </Badge>
                              {opp.priorityScore && Number(opp.priorityScore) >= 80 && (
                                <Flame className="h-3.5 w-3.5 text-orange-500" />
                              )}
                              {isResolved && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {opp.status}
                                </Badge>
                              )}
                            </div>

                            {/* Contact & Property Info */}
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
                              {opp.teamMemberName && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {opp.teamMemberName}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTimeAgo(opp.flaggedAt)}
                              </span>
                            </div>

                            {/* AI Reason (always visible) */}
                            <p className="text-sm mt-2 text-foreground/80">
                              {opp.reason || "Opportunity detected by automated rules."}
                            </p>
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
                                Handled
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleResolve(opp.id, "dismissed")}
                                disabled={resolveMutation.isPending}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Dismiss
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
                                Suggested Action
                              </p>
                              <p className="text-sm">{opp.suggestion}</p>
                            </div>
                          )}

                          {/* Details Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {opp.relatedCallId && (
                              <div>
                                <span className="text-muted-foreground">Call ID</span>
                                <p className="font-medium">#{opp.relatedCallId}</p>
                              </div>
                            )}
                            {opp.priorityScore && (
                              <div>
                                <span className="text-muted-foreground">Priority Score</span>
                                <p className="font-medium">{opp.priorityScore}/100</p>
                              </div>
                            )}
                            {opp.flaggedAt && (
                              <div>
                                <span className="text-muted-foreground">Detected</span>
                                <p className="font-medium">{new Date(opp.flaggedAt).toLocaleString()}</p>
                              </div>
                            )}
                          </div>

                          {/* Trigger Rules */}
                          {opp.triggerRules && Array.isArray(opp.triggerRules) && opp.triggerRules.length > 0 && (
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Detection Rules Triggered</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(opp.triggerRules as string[]).map((rule, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px]">
                                    {ruleLabels[rule] || rule}
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
    </div>
  );
}
