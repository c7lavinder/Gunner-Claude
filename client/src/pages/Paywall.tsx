import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Shield, Zap, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const FEATURES_BY_TIER: Record<string, string[]> = {
  starter: [
    "AI Call Grading",
    "Basic Analytics",
    "1 Team Member",
    "500 Calls/Month",
    "Email Support",
  ],
  growth: [
    "Everything in Starter",
    "Advanced Analytics",
    "Custom Rubrics",
    "3 Team Members",
    "1,000 Calls/Month",
    "Priority Support",
  ],
  scale: [
    "Everything in Growth",
    "Unlimited Team Members",
    "Unlimited Calls",
    "API Access",
    "Custom Branding",
    "Dedicated Support",
  ],
};

export default function Paywall() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string>("growth");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);

  // Fetch plans from database
  const { data: plans, isLoading: plansLoading } = trpc.admin.getPlans.useQuery();

  const createCheckoutMutation = trpc.tenant.createCheckout.useMutation();

  const handleStartTrial = async () => {
    if (!selectedPlan) {
      toast.error("Please select a plan");
      return;
    }

    setLoading(true);
    try {
      const result = await createCheckoutMutation.mutateAsync({
        planCode: selectedPlan as "starter" | "growth" | "scale",
        billingPeriod,
      });

      if (result.url) {
        toast.info("Redirecting to secure checkout...");
        window.location.href = result.url;
      } else {
        toast.error("Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getPlanPrice = (planCode: string) => {
    const plan = plans?.find((p: any) => p.code === planCode);
    if (!plan) return { monthly: 0, yearly: 0 };
    return {
      monthly: (plan.priceMonthly || 0) / 100,
      yearly: (plan.priceYearly || 0) / 100,
    };
  };

  const activePlans = plans?.filter((p: any) => p.isActive) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl">
        {/* Logo */}
        <div className="text-center mb-6">
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/ORoxztkyoTJEjMxT.png"
            alt="Gunner"
            className="h-12 mx-auto"
          />
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Start Your 3-Day Free Trial</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Enter your card to unlock your dashboard. You won't be charged until your trial ends.
            Cancel anytime.
          </p>
        </div>

        {/* Trust badges */}
        <div className="flex justify-center gap-6 mb-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-green-500" />
            <span>Secure checkout</span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-green-500" />
            <span>Cancel anytime</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-green-500" />
            <span>Instant access</span>
          </div>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center bg-muted rounded-lg p-1">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === "monthly"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === "yearly"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <Badge variant="secondary" className="ml-2 text-xs">
                2 months free
              </Badge>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        {plansLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {["starter", "growth", "scale"].map((planCode) => {
              const plan = plans?.find((p: any) => p.code === planCode);
              if (!plan || !plan.isActive) return null;

              const price = getPlanPrice(planCode);
              const isSelected = selectedPlan === planCode;
              const isPopular = plan.isPopular;

              return (
                <Card
                  key={planCode}
                  className={`cursor-pointer transition-all relative ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedPlan(planCode)}
                >
                  {isPopular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                      Most Popular
                    </Badge>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="capitalize">{plan.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">
                        ${billingPeriod === "monthly" ? price.monthly : Math.round(price.yearly / 12)}
                      </span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                    {billingPeriod === "yearly" && (
                      <p className="text-xs text-muted-foreground">
                        ${price.yearly}/year (billed annually)
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {FEATURES_BY_TIER[planCode]?.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {isSelected && (
                      <div className="mt-4 text-center">
                        <Badge variant="outline" className="text-primary border-primary">
                          Selected
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* CTA Button */}
        <div className="text-center">
          <Button
            size="lg"
            className="px-12 py-6 text-lg"
            onClick={handleStartTrial}
            disabled={loading || !selectedPlan}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5 mr-2" />
                Start 3-Day Free Trial
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Your card will be charged ${getPlanPrice(selectedPlan)[billingPeriod === "monthly" ? "monthly" : "yearly"]} 
            {billingPeriod === "yearly" ? "/year" : "/month"} after your 3-day trial ends.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-muted-foreground">
          <p>
            By starting your trial, you agree to our{" "}
            <a href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
