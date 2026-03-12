import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface VoiceProfile {
  consentGiven: boolean | null;
  totalSamples: number | null;
  totalDurationMinutes: string | null;
  readyForCloning: boolean | null;
}

interface VoiceTabProps {
  voiceProfile: VoiceProfile | null | undefined;
  onToggleConsent: (checked: boolean) => Promise<void>;
  isUpdatingConsent: boolean;
}

export function VoiceTab({
  voiceProfile,
  onToggleConsent,
  isUpdatingConsent,
}: VoiceTabProps) {
  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardHeader><CardTitle>Voice Coaching</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-medium text-[var(--g-text-primary)]">Allow voice sample collection</p>
            <p className="text-sm text-[var(--g-text-tertiary)]">
              Allow Gunner to collect voice samples from your calls to build a personalized coaching profile.
              Your voice data is stored securely and used only to improve your AI coaching experience.
              You can revoke consent at any time.
            </p>
          </div>
          <Switch
            checked={voiceProfile?.consentGiven ?? false}
            onCheckedChange={onToggleConsent}
            disabled={isUpdatingConsent}
          />
        </div>
        {voiceProfile && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="font-medium text-[var(--g-text-primary)]">Voice Profile</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-[var(--g-bg-inset)]">
                  <p className="text-2xl font-bold text-[var(--g-text-primary)]">{voiceProfile.totalSamples ?? 0}</p>
                  <p className="text-xs mt-0.5 text-[var(--g-text-tertiary)]">Samples collected</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--g-bg-inset)]">
                  <p className="text-2xl font-bold text-[var(--g-text-primary)]">{parseFloat(voiceProfile.totalDurationMinutes ?? "0").toFixed(0)}</p>
                  <p className="text-xs mt-0.5 text-[var(--g-text-tertiary)]">Minutes recorded</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--g-bg-inset)]">
                  <p className={voiceProfile.readyForCloning ? "text-sm font-semibold text-[var(--g-grade-a)]" : "text-sm font-semibold text-[var(--g-text-secondary)]"}>
                    {voiceProfile.readyForCloning ? "Ready" : (voiceProfile.totalSamples ?? 0) > 0 ? "Building" : "Not started"}
                  </p>
                  <p className="text-xs mt-0.5 text-[var(--g-text-tertiary)]">Profile status</p>
                </div>
              </div>
              {!voiceProfile.readyForCloning && (voiceProfile.totalSamples ?? 0) > 0 && (
                <p className="text-xs text-[var(--g-text-tertiary)]">
                  Need {Math.max(0, 20 - (voiceProfile.totalSamples ?? 0))} more samples and {Math.max(0, 60 - parseFloat(voiceProfile.totalDurationMinutes ?? "0")).toFixed(0)} more minutes to unlock cloning.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
