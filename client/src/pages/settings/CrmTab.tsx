import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Link2,
  Check,
  X,
  RefreshCw,
  Unplug,
  Loader2,
  Clock,
  Zap,
  Key,
  Timer,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const CRM_DISPLAY_NAMES: Record<string, string> = {
  ghl: "GoHighLevel",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  demo: "Demo",
  none: "None",
};

function getCrmDisplayName(crmType: string | undefined | null): string {
  return CRM_DISPLAY_NAMES[crmType ?? "none"] ?? crmType ?? "CRM";
}

function StatusDot({ status }: { status: "connected" | "warning" | "disconnected" }) {
  const colors = {
    connected: "bg-emerald-500",
    warning: "bg-amber-500",
    disconnected: "bg-zinc-500",
  };
  return <span className={`inline-block size-2.5 rounded-full ${colors[status]}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    connected: { label: "Connected", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    expired: { label: "Token Expired", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    disconnected: { label: "Disconnected", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
    not_set: { label: "Not Set", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
    active: { label: "Active", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    paused: { label: "Paused", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
    failed: { label: "Failed", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  };
  const v = variants[status] ?? { label: status, className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "Unknown";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Expired";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m remaining`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h remaining`;
  const days = Math.floor(hrs / 24);
  return `${days}d remaining`;
}

interface ActivityEntry {
  id: number;
  layer: string;
  eventType: string | null;
  status: string;
  details: string | null;
  createdAt: string | Date;
}

function ActivityTable({ entries, isLoading }: { entries: ActivityEntry[] | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!entries?.length) return <p className="text-xs text-[var(--g-text-tertiary)] py-2">No activity yet.</p>;

  return (
    <div className="overflow-x-auto max-h-64 overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--g-border-subtle)]">
            <th className="pb-1 text-left font-medium text-[var(--g-text-secondary)]">Time</th>
            <th className="pb-1 text-left font-medium text-[var(--g-text-secondary)]">Event</th>
            <th className="pb-1 text-left font-medium text-[var(--g-text-secondary)]">Status</th>
            <th className="pb-1 text-left font-medium text-[var(--g-text-secondary)]">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--g-border-subtle)]">
          {entries.map((e) => {
            let details = "";
            if (e.details) {
              try {
                const parsed = JSON.parse(e.details) as Record<string, unknown>;
                details = Object.entries(parsed)
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(", ");
              } catch {
                details = e.details;
              }
            }
            return (
              <tr key={e.id}>
                <td className="py-1.5 pr-3 whitespace-nowrap text-[var(--g-text-tertiary)]">
                  {formatTimeAgo(typeof e.createdAt === "string" ? e.createdAt : e.createdAt.toISOString())}
                </td>
                <td className="py-1.5 pr-3 font-mono text-[var(--g-text-primary)]">{e.eventType ?? "—"}</td>
                <td className="py-1.5 pr-3">
                  <span className={e.status === "success" ? "text-emerald-400" : e.status === "error" ? "text-red-400" : "text-zinc-400"}>
                    {e.status}
                  </span>
                </td>
                <td className="py-1.5 text-[var(--g-text-tertiary)] truncate max-w-[200px]">{details || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface CrmTabProps {
  apiKey: string;
  setApiKey: (v: string) => void;
  locationId: string;
  setLocationId: (v: string) => void;
  crmConfig: Record<string, string>;
  onOAuthConnect: () => Promise<void>;
  isOAuthFetching: boolean;
  onTestConnection: () => void;
  isTestFetching: boolean;
  crmConnected: boolean | null;
  crmError: string | undefined;
  onSaveCrm: () => Promise<void>;
  isSaving: boolean;
  syncHealthDisplay: React.ReactNode;
}

export function CrmTab({
  apiKey,
  setApiKey,
  locationId,
  setLocationId,
  crmConfig,
  onOAuthConnect,
  isOAuthFetching,
  onTestConnection,
  isTestFetching,
  crmConnected,
  crmError,
  onSaveCrm,
  isSaving,
}: CrmTabProps) {
  const utils = trpc.useUtils();
  const [oauthCompleting, setOauthCompleting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthSuccess, setOauthSuccess] = useState(false);

  const completeOAuth = trpc.settings.completeGhlOAuth.useMutation();
  const disconnectOAuth = trpc.settings.disconnectOAuth.useMutation();

  // Bug fix #1: Read ?code= param on mount and complete OAuth flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const crmCallback = params.get("crm_callback");

    if (code && crmCallback) {
      setOauthCompleting(true);
      setOauthError(null);
      const redirectUri = `${window.location.origin}/settings?tab=crm&crm_callback=1`;

      completeOAuth.mutateAsync({ code, redirectUri })
        .then(() => {
          setOauthSuccess(true);
          // Clean URL params
          const url = new URL(window.location.href);
          url.searchParams.delete("code");
          url.searchParams.delete("crm_callback");
          url.searchParams.delete("state");
          window.history.replaceState({}, "", url.toString());
          // Refresh data
          void utils.settings.getWorkspace.invalidate();
          void utils.settings.getSyncLayerStatus.invalidate();
          void utils.settings.getSyncHealth.invalidate();
        })
        .catch((err) => {
          setOauthError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          setOauthCompleting(false);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: layerStatus, isLoading: layerLoading } = trpc.settings.getSyncLayerStatus.useQuery();
  const { data: oauthLog, isLoading: oauthLogLoading } = trpc.settings.getSyncActivityLog.useQuery({ layer: "oauth", limit: 20 });
  const { data: apiLog, isLoading: apiLogLoading } = trpc.settings.getSyncActivityLog.useQuery({ layer: "api", limit: 20 });
  const { data: pollingLog, isLoading: pollingLogLoading } = trpc.settings.getSyncActivityLog.useQuery({ layer: "polling", limit: 20 });
  const { data: summary } = trpc.settings.getSyncSummary.useQuery();

  const crmName = getCrmDisplayName(layerStatus?.crmType);

  const handleDisconnect = async () => {
    await disconnectOAuth.mutateAsync();
    setOauthSuccess(false);
    await utils.settings.getWorkspace.invalidate();
    await utils.settings.getSyncLayerStatus.invalidate();
    await utils.settings.getSyncHealth.invalidate();
  };

  // OAuth completing state
  if (oauthCompleting) {
    return (
      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardContent className="flex items-center justify-center py-12 gap-3">
          <Loader2 className="size-5 animate-spin text-[var(--g-accent)]" />
          <span className="text-[var(--g-text-secondary)]">Completing CRM connection...</span>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (layerLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  const oauthStatus = layerStatus?.oauth.status ?? "disconnected";
  const apiStatus = layerStatus?.api.status ?? "not_set";
  const pollingStatus = layerStatus?.polling.status ?? "paused";

  const getLayerDot = (status: string): "connected" | "warning" | "disconnected" => {
    if (status === "connected" || status === "active") return "connected";
    if (status === "expired" || status === "failed") return "warning";
    return "disconnected";
  };

  return (
    <div className="space-y-4">
      {/* OAuth success/error banners */}
      {oauthSuccess && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
          <Check className="size-4 inline mr-2" />
          {crmName} connected successfully. Webhooks registered.
        </div>
      )}
      {oauthError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <X className="size-4 inline mr-2" />
          OAuth failed: {oauthError}
        </div>
      )}

      {/* Connection Status Banner */}
      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <StatusDot status={getLayerDot(oauthStatus)} />
                <span className="text-sm text-[var(--g-text-secondary)]">OAuth + Webhooks</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusDot status={getLayerDot(apiStatus)} />
                <span className="text-sm text-[var(--g-text-secondary)]">API Token</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusDot status={getLayerDot(pollingStatus)} />
                <span className="text-sm text-[var(--g-text-secondary)]">Polling</span>
              </div>
            </div>
            <span className="text-xs text-[var(--g-text-tertiary)]">{crmName}</span>
          </div>
        </CardContent>
      </Card>

      {/* Layer 1: OAuth + Webhooks */}
      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-[var(--g-text-tertiary)]" />
            <CardTitle className="text-base">Layer 1: OAuth + Webhooks</CardTitle>
          </div>
          <StatusBadge status={oauthStatus} />
        </CardHeader>
        <CardContent className="space-y-4">
          {oauthStatus === "connected" || oauthStatus === "expired" ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--g-text-tertiary)]">Location ID</span>
                  <p className="font-mono text-[var(--g-text-primary)]">{layerStatus?.oauth.locationId ?? "—"}</p>
                </div>
                <div>
                  <span className="text-[var(--g-text-tertiary)]">Token Expiry</span>
                  <p className={`text-sm ${oauthStatus === "expired" ? "text-amber-400" : "text-[var(--g-text-primary)]"}`}>
                    {formatExpiry(layerStatus?.oauth.tokenExpiresAt ?? null)}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--g-text-tertiary)]">Webhooks</span>
                  <p className="text-[var(--g-text-primary)]">
                    {layerStatus?.oauth.webhooksRegistered ? (
                      <span className="flex items-center gap-1"><Check className="size-3 text-emerald-400" />4 events registered</span>
                    ) : (
                      <span className="flex items-center gap-1"><X className="size-3 text-zinc-400" />Not registered</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--g-text-tertiary)]">Last Webhook</span>
                  <p className="text-[var(--g-text-primary)]">{formatTimeAgo(layerStatus?.oauth.lastActivity ?? null)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onOAuthConnect} disabled={isOAuthFetching}>
                  <RefreshCw className="size-3.5 mr-1.5" />Reconnect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnectOAuth.isPending}
                  className="text-red-400 hover:text-red-300"
                >
                  <Unplug className="size-3.5 mr-1.5" />Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--g-text-secondary)]">
                Connect your {crmName} account with one click. This automatically sets up API access and webhook notifications for real-time sync.
              </p>
              <Button onClick={onOAuthConnect} disabled={isOAuthFetching}>
                <Link2 className="size-4 mr-2" />
                Connect {crmName}
              </Button>
            </>
          )}

          <div className="pt-2 border-t border-[var(--g-border-subtle)]">
            <p className="text-xs font-medium text-[var(--g-text-secondary)] mb-2">Recent Activity</p>
            <ActivityTable entries={oauthLog as ActivityEntry[] | undefined} isLoading={oauthLogLoading} />
          </div>
        </CardContent>
      </Card>

      {/* Layer 2: API Token */}
      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="size-4 text-[var(--g-text-tertiary)]" />
            <CardTitle className="text-base">Layer 2: API Token</CardTitle>
          </div>
          <StatusBadge status={apiStatus} />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--g-text-tertiary)]">
            Direct API access as a fallback when webhooks miss events.
          </p>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={crmConfig.apiKey ? "••••••••••••••••" : "Enter API key"}
              className="bg-[var(--g-bg-surface)]"
            />
          </div>
          <div className="space-y-2">
            <Label>Location ID</Label>
            <Input
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder={crmConfig.locationId ?? "Enter location ID"}
              className="bg-[var(--g-bg-surface)]"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onTestConnection} disabled={isTestFetching}>
              Test Connection
            </Button>
            <Button variant="secondary" size="sm" onClick={onSaveCrm} disabled={isSaving}>
              Save
            </Button>
            {!isTestFetching && crmConnected === true && (
              <span className="flex items-center gap-1 text-sm text-emerald-400"><Check className="size-4" />Connected</span>
            )}
            {!isTestFetching && crmConnected === false && (
              <span className="flex items-center gap-1 text-sm text-red-400"><X className="size-4" />{crmError ?? "Failed"}</span>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--g-border-subtle)]">
            <p className="text-xs font-medium text-[var(--g-text-secondary)] mb-2">Recent Activity</p>
            <ActivityTable entries={apiLog as ActivityEntry[] | undefined} isLoading={apiLogLoading} />
          </div>
        </CardContent>
      </Card>

      {/* Layer 3: Polling */}
      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-[var(--g-text-tertiary)]" />
            <CardTitle className="text-base">Layer 3: Polling</CardTitle>
          </div>
          <StatusBadge status={pollingStatus} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--g-text-tertiary)]">Interval</span>
              <p className="text-[var(--g-text-primary)]">Every 5 minutes (calls) / 10 minutes (opportunities)</p>
            </div>
            <div>
              <span className="text-[var(--g-text-tertiary)]">Last Poll</span>
              <p className="text-[var(--g-text-primary)]">{formatTimeAgo(layerStatus?.polling.lastSync ?? null)}</p>
            </div>
          </div>

          {pollingLog && pollingLog.length > 0 && (() => {
            const last = pollingLog[0];
            if (last?.details) {
              try {
                const d = JSON.parse(last.details) as Record<string, unknown>;
                return (
                  <div className="flex gap-4 text-sm">
                    <div>
                      <span className="text-[var(--g-text-tertiary)]">Processed</span>
                      <p className="text-[var(--g-text-primary)] font-medium">{String(d.processed ?? 0)}</p>
                    </div>
                    <div>
                      <span className="text-[var(--g-text-tertiary)]">Skipped</span>
                      <p className="text-[var(--g-text-primary)]">{String(d.skipped ?? 0)}</p>
                    </div>
                    <div>
                      <span className="text-[var(--g-text-tertiary)]">Errors</span>
                      <p className={Number(d.errors ?? 0) > 0 ? "text-red-400 font-medium" : "text-[var(--g-text-primary)]"}>
                        {String(d.errors ?? 0)}
                      </p>
                    </div>
                  </div>
                );
              } catch { /* ignore */ }
            }
            return null;
          })()}

          <div className="pt-2 border-t border-[var(--g-border-subtle)]">
            <p className="text-xs font-medium text-[var(--g-text-secondary)] mb-2">Recent Activity</p>
            <ActivityTable entries={pollingLog as ActivityEntry[] | undefined} isLoading={pollingLogLoading} />
          </div>
        </CardContent>
      </Card>

      {/* Sync Summary */}
      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardContent className="py-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-6">
              <div>
                <span className="text-[var(--g-text-tertiary)]">Total Calls</span>
                <p className="text-lg font-semibold text-[var(--g-text-primary)]">{summary?.totalCalls ?? 0}</p>
              </div>
              <div>
                <span className="text-[var(--g-text-tertiary)]">Total Opportunities</span>
                <p className="text-lg font-semibold text-[var(--g-text-primary)]">{summary?.totalOpportunities ?? 0}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[var(--g-text-tertiary)]">Data Freshness</span>
              <p className="flex items-center gap-1 text-[var(--g-text-primary)]">
                <Clock className="size-3" />
                {formatTimeAgo(summary?.lastSync ?? null)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
