import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link2, Check, X } from "lucide-react";
import type { ReactNode } from "react";

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
  syncHealthDisplay: ReactNode;
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
  syncHealthDisplay,
}: CrmTabProps) {
  return (
    <>
      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardHeader><CardTitle>Connect via OAuth (Recommended)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--g-text-secondary)]">
            Connect your GoHighLevel account with one click. This automatically sets up API access and webhook notifications.
          </p>
          <Button
            onClick={onOAuthConnect}
            disabled={isOAuthFetching}
          >
            <Link2 className="size-4 mr-2" />
            Connect GoHighLevel
          </Button>
          {syncHealthDisplay}
        </CardContent>
      </Card>
      <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
        <CardHeader><CardTitle>Manual API Key</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--g-text-tertiary)]">
            Or connect manually using your GHL API key and location ID.
          </p>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={crmConfig.apiKey ? "••••••••••••••••" : ""} className="bg-[var(--g-bg-surface)]" />
          </div>
          <div className="space-y-2">
            <Label>Location ID</Label>
            <Input value={locationId} onChange={(e) => setLocationId(e.target.value)} className="bg-[var(--g-bg-surface)]" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onTestConnection} disabled={isTestFetching}>Test Connection</Button>
            {!isTestFetching && crmConnected === true && <span className="flex items-center gap-1 text-sm text-[var(--g-grade-a)]"><Check className="size-4" />Connected</span>}
            {!isTestFetching && crmConnected === false && <span className="flex items-center gap-1 text-sm text-[var(--g-grade-f)]"><X className="size-4" />{crmError ?? "Failed"}</span>}
          </div>
          <Button variant="secondary" onClick={onSaveCrm} disabled={isSaving}>Save CRM Config</Button>
        </CardContent>
      </Card>
    </>
  );
}
