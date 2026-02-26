import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Webhook,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Activity,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

function formatTimeAgo(date: Date | string | null): string {
  if (!date) return "Never";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

export function WebhookHealthWidget() {
  const [expanded, setExpanded] = useState(false);

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = trpc.tenant.getWebhookHealth.useQuery(
    undefined,
    { refetchInterval: 60000 } // Refresh every minute
  );

  const { data: webhookInfo } = trpc.tenant.getWebhookUrl.useQuery();

  const webhookUrl = webhookInfo?.webhookUrl || `${window.location.origin}/api/webhook/ghl`;

  const statusConfig = {
    healthy: {
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
      badge: <Badge className="bg-green-100 text-green-700 border-green-300 gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />Active</Badge>,
      color: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20",
    },
    degraded: {
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      badge: <Badge className="bg-amber-100 text-amber-700 border-amber-300 gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500" />Degraded</Badge>,
      color: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20",
    },
    inactive: {
      icon: <Clock className="h-4 w-4 text-gray-400" />,
      badge: <Badge variant="outline" className="text-muted-foreground gap-1"><span className="inline-block w-2 h-2 rounded-full bg-gray-400" />Inactive</Badge>,
      color: "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30",
    },
    never_connected: {
      icon: <XCircle className="h-4 w-4 text-gray-400" />,
      badge: <Badge variant="outline" className="text-muted-foreground gap-1"><span className="inline-block w-2 h-2 rounded-full bg-gray-400" />Not Connected</Badge>,
      color: "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30",
    },
  };

  const status = health?.status || "never_connected";
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.never_connected;

  return (
    <div className={`rounded-lg border ${config.color} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-foreground/70" />
          <span className="text-sm font-semibold">Webhook Integration</span>
        </div>
        <div className="flex items-center gap-2">
          {healthLoading ? <Skeleton className="h-6 w-16" /> : config.badge}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => refetchHealth()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Quick Stats Row */}
      {health && status !== "never_connected" && (
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-md bg-white/60 dark:bg-black/20">
            <div className="text-lg font-bold text-foreground">{health.lastHour.total}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Events/hr</div>
          </div>
          <div className="text-center p-2 rounded-md bg-white/60 dark:bg-black/20">
            <div className="text-lg font-bold text-green-600">{health.lastHour.processed}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Processed</div>
          </div>
          <div className="text-center p-2 rounded-md bg-white/60 dark:bg-black/20">
            <div className={`text-lg font-bold ${health.lastHour.failed > 0 ? "text-red-500" : "text-foreground"}`}>{health.lastHour.failed}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Failed</div>
          </div>
        </div>
      )}

      {/* Last Event */}
      {health?.lastEvent && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>Last event: <span className="font-medium text-foreground">{health.lastEvent.eventType}</span> — {formatTimeAgo(health.lastEvent.receivedAt)}</span>
        </div>
      )}

      {/* Webhook URL (always visible) */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-foreground/70">Webhook URL</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-white dark:bg-black/30 border border-current/10 rounded px-3 py-2 font-mono break-all text-foreground/80">
            {webhookUrl}
          </code>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 h-8"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              toast.success("Webhook URL copied!");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expand/Collapse for Setup Instructions */}
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {status === "never_connected" ? "Setup Instructions" : "Setup Details & Event Breakdown"}
      </button>

      {expanded && (
        <div className="space-y-4 pt-1 border-t border-current/5">
          {/* Setup Instructions */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground/70">How to Connect</div>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Go to your <span className="font-medium">GHL Developer App</span> settings</li>
              <li>Navigate to <span className="font-medium">Webhooks</span> section</li>
              <li>Add the webhook URL above as a new endpoint</li>
              <li>Subscribe to these events:</li>
            </ol>
            <div className="flex flex-wrap gap-1.5 ml-4">
              {(webhookInfo?.supportedEvents || [
                "InboundMessage", "OutboundMessage",
                "OpportunityCreate", "OpportunityStageUpdate", "OpportunityStatusUpdate",
                "ContactCreate", "ContactUpdate",
              ]).map((event) => (
                <Badge key={event} variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                  {event}
                </Badge>
              ))}
            </div>
            <a
              href="https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1"
            >
              <ExternalLink className="h-3 w-3" />
              GHL Webhook Integration Guide
            </a>
          </div>

          {/* 24h Event Breakdown */}
          {health && health.eventsByType.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-foreground/70">Last 24 Hours by Event Type</div>
              <div className="space-y-1">
                {health.eventsByType.map((evt: { type: string; count: number }) => (
                  <div key={evt.type} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{evt.type}</span>
                    <span className="font-medium text-foreground">{evt.count}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-current/5">
                <span className="font-medium text-foreground/70">Total (24h)</span>
                <span className="font-bold text-foreground">{health.last24Hours.total}</span>
              </div>
            </div>
          )}

          {/* Status explanation */}
          {status === "never_connected" && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <span className="font-semibold">Why use webhooks?</span> Instead of polling your CRM every few hours, webhooks deliver new calls and opportunities to Gunner in real-time — within seconds. This means faster grading, less API usage, and no missed calls.
              </p>
            </div>
          )}

          {status === "degraded" && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-semibold">Some events are failing.</span> Check your GHL webhook configuration and ensure the endpoint URL is correct. Gunner will continue to use fallback polling to ensure no data is missed.
              </p>
            </div>
          )}

          {status === "inactive" && (
            <div className="rounded-md bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">No events received recently.</span> Webhooks were previously active but no events have been received in the last 2 hours. This could be normal during low-activity periods, or it may indicate a configuration issue.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
