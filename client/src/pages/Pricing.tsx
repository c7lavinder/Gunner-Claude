import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 99,
    priceYearly: 82,
    description: "Perfect for small teams getting started with AI call coaching",
    features: [
      "Up to 3 team members",
      "AI call grading",
      "Basic analytics dashboard",
      "Team leaderboard",
      "1 CRM integration",
      "Email support",
    ],
    cta: "Start Free Trial",
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 249,
    priceYearly: 207,
    description: "For growing teams that need more users and advanced features",
    features: [
      "Up to 10 team members",
      "Everything in Starter",
      "Advanced analytics & trends",
      "Custom grading rubrics",
      "Training materials upload",
      "2 CRM integrations",
      "Priority email support",
    ],
    popular: true,
    cta: "Start Free Trial",
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 499,
    priceYearly: 415,
    description: "Enterprise-grade features for large organizations",
    features: [
      "Unlimited team members",
      "Everything in Growth",
      "API access",
      "Custom branding",
      "5 CRM integrations",
      "Dedicated account manager",
      "Phone support",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
  },
];

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const { user } = useAuth();

  const handleSelectPlan = (planId: string) => {
    if (planId === "scale") {
      toast.info("Contact us at sales@gunner.ai for enterprise pricing");
      return;
    }
    // Redirect to onboarding with selected plan
    setLocation(`/onboarding?plan=${planId}&billing=${billingPeriod}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Header */}
      <div className="container py-8">
        <div className="flex items-center justify-between mb-12">
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/ORoxztkyoTJEjMxT.png"
            alt="Gunner"
            className="h-12"
          />
          {user ? (
            <Button variant="outline" onClick={() => setLocation("/")}>
              Back to Dashboard
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setLocation("/")}>
              Sign In
            </Button>
          )}
        </div>

        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            AI Call Coaching for Your Sales Team
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Grade every call, coach every rep, close more deals. Start your 14-day free trial today.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-1 bg-muted rounded-lg">
            <Button
              variant={billingPeriod === "monthly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingPeriod("monthly")}
            >
              Monthly
            </Button>
            <Button
              variant={billingPeriod === "yearly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingPeriod("yearly")}
              className="flex items-center gap-2"
            >
              Yearly
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                Save 17%
              </Badge>
            </Button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                plan.popular ? "border-primary shadow-lg scale-105" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-4 py-1">
                    <Zap className="h-3 w-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-center mb-6">
                  <span className="text-5xl font-bold">
                    ${billingPeriod === "yearly" ? plan.priceYearly : plan.priceMonthly}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                  {billingPeriod === "yearly" && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Billed annually (${plan.priceYearly * 12}/year)
                    </p>
                  )}
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  size="lg"
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {plan.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* FAQ or Trust Signals */}
        <div className="text-center mt-16 text-muted-foreground">
          <p className="mb-4">Trusted by 100+ sales teams</p>
          <p className="text-sm">
            14-day free trial • No credit card required • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
