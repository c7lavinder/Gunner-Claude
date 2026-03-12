import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface NotificationsTabProps {
  emailDigest: boolean;
  setEmailDigest: (v: boolean) => void;
  gradeAlerts: boolean;
  setGradeAlerts: (v: boolean) => void;
  notifDirty: boolean;
  setNotifDirty: (v: boolean) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

export function NotificationsTab({
  emailDigest,
  setEmailDigest,
  gradeAlerts,
  setGradeAlerts,
  notifDirty,
  setNotifDirty,
  onSave,
  isSaving,
}: NotificationsTabProps) {
  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div><p className="font-medium text-[var(--g-text-primary)]">Email daily digest</p><p className="text-sm text-[var(--g-text-tertiary)]">Summary of calls and grades</p></div>
          <Switch checked={emailDigest} onCheckedChange={(v) => { setEmailDigest(v); setNotifDirty(true); }} />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div><p className="font-medium text-[var(--g-text-primary)]">Email grade alerts</p><p className="text-sm text-[var(--g-text-tertiary)]">When new grades are ready</p></div>
          <Switch checked={gradeAlerts} onCheckedChange={(v) => { setGradeAlerts(v); setNotifDirty(true); }} />
        </div>
        <Separator />
        <div className="flex items-center justify-between opacity-60">
          <div><p className="font-medium text-[var(--g-text-primary)]">Slack integration</p><Badge variant="outline" className="text-[10px]">Soon</Badge></div>
          <Switch disabled />
        </div>
        <Separator />
        <div className="flex items-center justify-between opacity-60">
          <div><p className="font-medium text-[var(--g-text-primary)]">SMS alerts</p><Badge variant="outline" className="text-[10px]">Soon</Badge></div>
          <Switch disabled />
        </div>
        <div className="flex items-center gap-2">
          {notifDirty && <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">Unsaved changes</Badge>}
          <Button onClick={onSave} disabled={isSaving}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
