import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Check, 
  Zap, 
  Phone, 
  BarChart3, 
  Users, 
  FileText, 
  BookOpen, 
  Code, 
  Headphones, 
  Palette, 
  Link2, 
  Layers, 
  UserPlus, 
  HardDrive, 
  Lightbulb, 
  Trophy, 
  Download, 
  Building2,
  Info
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// Feature definitions with human-readable labels, icons, and descriptions
const FEATURE_CONFIG: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  call_grading: { 
    label: "AI Call Grading", 
    icon: Phone, 
    description: "Automatically analyze and score sales calls using AI. Provides instant feedback on pitch quality, objection handling, and closing techniques." 
  },
  basic_analytics: { 
    label: "Basic Analytics", 
    icon: BarChart3, 
    description: "Track key metrics like call volume, average scores, and team performance at a glance." 
  },
  advanced_analytics: { 
    label: "Advanced Analytics", 
    icon: BarChart3, 
    description: "Deep dive into call performance metrics, trends over time, and team comparisons. Includes conversion rate tracking and revenue attribution." 
  },
  team_dashboard: { 
    label: "Team Dashboard", 
    icon: Users, 
    description: "Centralized view of all team members' performance. Track individual progress, identify top performers, and spot coaching opportunities." 
  },
  custom_rubrics: { 
    label: "Custom Rubrics", 
    icon: FileText, 
    description: "Create your own scoring criteria tailored to your sales process. Define what matters most for your team's success." 
  },
  training_materials: { 
    label: "Training Materials", 
    icon: BookOpen, 
    description: "Access to curated sales training content, best practice guides, and example calls from top performers." 
  },
  api_access: { 
    label: "API Access", 
    icon: Code, 
    description: "Programmatic access to call data and analytics. Build custom integrations or export data to your own systems." 
  },
  priority_support: { 
    label: "Priority Support", 
    icon: Headphones, 
    description: "Skip the queue with dedicated support channels. Get faster response times and access to senior support specialists." 
  },
  custom_branding: { 
    label: "Custom Branding", 
    icon: Palette, 
    description: "White-label the platform with your company logo, colors, and domain. Perfect for agencies and enterprises." 
  },
  crm_integration: { 
    label: "CRM Integration", 
    icon: Link2, 
    description: "Connect with GoHighLevel to automatically sync contacts, calls, and deal data. Streamline your workflow." 
  },
  multi_crm: { 
    label: "Multiple CRM Integrations", 
    icon: Layers, 
    description: "Connect multiple CRM instances or different CRM platforms. Ideal for agencies managing multiple client accounts." 
  },
  unlimited_users: { 
    label: "Unlimited Users", 
    icon: UserPlus, 
    description: "No cap on team size. Add as many sales reps, managers, and admins as you need without per-seat charges." 
  },
  call_recording: { 
    label: "Call Recording Storage", 
    icon: HardDrive, 
    description: "Store and access call recordings for review and training. Includes searchable transcripts and highlight clips." 
  },
  coaching_insights: { 
    label: "Coaching Insights", 
    icon: Lightbulb, 
    description: "AI-powered recommendations for improving each rep's performance. Personalized coaching tips based on call analysis." 
  },
  leaderboards: { 
    label: "Team Leaderboards", 
    icon: Trophy, 
    description: "Gamify performance with competitive rankings. Track daily, weekly, and monthly leaders across key metrics." 
  },
  export_reports: { 
    label: "Export Reports", 
    icon: Download, 
    description: "Download detailed reports in PDF or CSV format. Share insights with stakeholders or archive for compliance." 
  },
  white_label: { 
    label: "White Label", 
    icon: Building2, 
    description: "Fully rebrand the entire platform as your own. Remove all Gunner branding for a seamless client experience." 
  },
};

// Fallback static plans if API fails
const FALLBACK_PLANS = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 99,
    priceYearly: 990,
    description: "Perfect for small teams getting started with AI call coaching",
    features: ["call_grading", "basic_analytics", "team_dashboard"],
    maxUsers: 3,
    popular: false,
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 249,
    priceYearly: 2490,
    description: "For growing teams that need more users and advanced features",
    features: ["call_grading", "advanced_analytics", "team_dashboard", "custom_rubrics", "training_materials"],
    maxUsers: 10,
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 499,
    priceYearly: 4990,
    description: "Enterprise-grade features for large organizations",
    features: ["call_grading", "advanced_analytics", "team_dashboard", "custom_rubrics", "training_materials", "api_access", "priority_support", "custom_branding"],
    maxUsers: -1,
    popular: false,
  },
];

function FeatureItem({ featureId }: { featureId: string }) {
  const config = FEATURE_CONFIG[featureId];
  
  if (!config) {
    // Fallback for unknown features - display as-is with generic icon
    return (
      <li className="flex items-start gap-2">
        <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
        <span className="text-sm">{featureId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
      </li>
    );
  }

  const IconComponent = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <li className="flex items-start gap-2 cursor-help group">
            <IconComponent className="h-5 w-5 text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
            <span className="text-sm group-hover:text-primary transition-colors flex items-center gap-1">
              {config.label}
              <Info className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </li>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-sm">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const { user } = useAuth();

  // Fetch plans from database
  const { data: dbPlans, isLoading } = trpc.admin.getPlans.useQuery(undefined, {
    retry: false,
  });

  // Transform database plans or use fallback
  const plans = dbPlans && dbPlans.length > 0 
    ? dbPlans
        .filter((p: any) => p.isActive === 'true' || p.isActive === true)
        .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((p: any) => ({
          id: p.code,
          name: p.name,
          // Database stores prices in cents, convert to dollars
          priceMonthly: Math.round((p.priceMonthly || 0) / 100),
          priceYearly: Math.round((p.priceYearly || 0) / 100),
          description: p.description,
          features: p.features || [],
          maxUsers: p.maxUsers,
          popular: p.isPopular === 'true' || p.isPopular === true,
        }))
    : FALLBACK_PLANS;

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
        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="flex flex-col">
                <CardHeader className="text-center pb-2">
                  <Skeleton className="h-8 w-24 mx-auto mb-2" />
                  <Skeleton className="h-4 w-48 mx-auto" />
                </CardHeader>
                <CardContent className="flex-1">
                  <Skeleton className="h-12 w-32 mx-auto mb-6" />
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <Skeleton key={j} className="h-4 w-full" />
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan: any) => (
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
                      ${billingPeriod === "yearly" ? Math.round(plan.priceYearly / 12) : plan.priceMonthly}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                    {billingPeriod === "yearly" && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Billed annually (${plan.priceYearly}/year)
                      </p>
                    )}
                  </div>
                  
                  {/* Max Users Badge */}
                  <div className="flex justify-center mb-4">
                    <Badge variant="outline" className="text-sm">
                      <Users className="h-3 w-3 mr-1" />
                      {plan.maxUsers === -1 ? "Unlimited" : `Up to ${plan.maxUsers}`} team members
                    </Badge>
                  </div>

                  <ul className="space-y-3">
                    {plan.features.map((featureId: string, i: number) => (
                      <FeatureItem key={i} featureId={featureId} />
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
                    {plan.id === "scale" ? "Contact Sales" : "Start Free Trial"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Feature Legend */}
        <div className="max-w-4xl mx-auto mt-12 p-6 bg-muted/50 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-center">Hover over any feature to learn more</h3>
          <p className="text-sm text-muted-foreground text-center">
            Each plan includes all features from the previous tier, plus additional capabilities to help your team grow.
          </p>
        </div>

        {/* FAQ or Trust Signals */}
        <div className="text-center mt-16 text-muted-foreground">
          <p className="mb-4">Trusted by 100+ sales teams</p>
          <p className="text-sm">
            3-day free trial • Card required to start • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
