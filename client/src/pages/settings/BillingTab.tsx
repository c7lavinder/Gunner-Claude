import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

interface Plan {
  code: string;
  name: string;
  priceMonthly: number | null;
}

interface BillingTabProps {
  subscriptionTier: string;
  subscriptionStatus: string;
  plans: Plan[] | undefined;
  teamCount: number;
}

export function BillingTab({
  subscriptionTier,
  subscriptionStatus,
  plans,
  teamCount,
}: BillingTabProps) {
  const utils = trpc.useUtils();
  const tierCode = subscriptionTier;
  const planStatus = subscriptionStatus;
  const currentPlan = plans?.find((p) => p.code === tierCode);
  const planName = currentPlan?.name ?? tierCode.charAt(0).toUpperCase() + tierCode.slice(1) + " Plan";
  const planPrice = currentPlan?.priceMonthly ? `$${(currentPlan.priceMonthly / 100).toFixed(0)}/mo` : null;

  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 rounded-xl bg-[var(--g-accent-soft)] border border-[var(--g-accent-medium)]">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[var(--g-accent-text)]">{planName}</p>
            <Badge variant="outline" className="text-xs capitalize">{planStatus}</Badge>
          </div>
          {planPrice && <p className="text-2xl font-bold mt-1 text-[var(--g-text-primary)]">{planPrice}</p>}
          <p className="mt-2 text-sm text-[var(--g-text-secondary)]">Unlimited calls · AI grading · Team leaderboard · GHL sync</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={async () => {
              try {
                const result = await utils.client.settings.manageBilling.mutate({
                  returnUrl: window.location.href,
                });
                if (result?.url) window.location.href = result.url;
              } catch {
                window.alert("Billing portal is not configured yet.");
              }
            }}
          >
            Manage Subscription
          </Button>
        </div>
        <div>
          <p className="text-sm font-medium mb-2 text-[var(--g-text-secondary)]">Usage this month</p>
          <div className="flex gap-4">
            <div><span className="text-2xl font-bold text-[var(--g-text-primary)]">{teamCount}</span><span className="text-sm ml-1 text-[var(--g-text-tertiary)]">team members</span></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
