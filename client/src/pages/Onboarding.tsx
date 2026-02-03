import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Building2, CreditCard, Link2, FileText, Users, Rocket, ArrowRight, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STEPS = [
  { id: 1, title: "Company Info", icon: Building2, description: "Tell us about your business" },
  { id: 2, title: "Choose Plan", icon: CreditCard, description: "Select your subscription" },
  { id: 3, title: "Connect CRM", icon: Link2, description: "Integrate your CRM" },
  { id: 4, title: "Training", icon: FileText, description: "Upload training materials" },
  { id: 5, title: "Invite Team", icon: Users, description: "Add team members" },
  { id: 6, title: "Launch", icon: Rocket, description: "You're ready to go!" },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 99,
    period: "month",
    description: "Perfect for small teams",
    features: ["Up to 3 team members", "AI call grading", "Basic analytics", "1 CRM integration"],
  },
  {
    id: "growth",
    name: "Growth",
    price: 249,
    period: "month",
    description: "For growing teams",
    features: ["Up to 10 team members", "Advanced analytics", "Custom rubrics", "2 CRM integrations"],
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 499,
    period: "month",
    description: "Enterprise features",
    features: ["Unlimited team members", "API access", "Custom branding", "5 CRM integrations"],
  },
];

const CRM_OPTIONS = [
  { id: "ghl", name: "GoHighLevel", description: "Popular CRM for agencies" },
  { id: "hubspot", name: "HubSpot", description: "Enterprise CRM platform" },
  { id: "salesforce", name: "Salesforce", description: "World's #1 CRM" },
  { id: "close", name: "Close", description: "Built for sales teams" },
  { id: "pipedrive", name: "Pipedrive", description: "Sales-focused CRM" },
  { id: "none", name: "Skip for now", description: "Connect later" },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    companyName: "",
    companySlug: "",
    selectedPlan: "growth",
    billingPeriod: "monthly" as "monthly" | "yearly",
    selectedCrm: "",
    trainingMaterials: "",
    teamEmails: "",
  });

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    toast.success("Welcome to Gunner! Your account is ready.");
    setLocation("/");
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="Acme Real Estate"
                value={formData.companyName}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    companyName: e.target.value,
                    companySlug: generateSlug(e.target.value),
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companySlug">Your Gunner URL</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">gunner.app/</span>
                <Input
                  id="companySlug"
                  placeholder="acme-real-estate"
                  value={formData.companySlug}
                  onChange={(e) => setFormData({ ...formData, companySlug: generateSlug(e.target.value) })}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">This will be your team's unique URL</p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="flex justify-center gap-4 mb-6">
              <Button
                variant={formData.billingPeriod === "monthly" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, billingPeriod: "monthly" })}
              >
                Monthly
              </Button>
              <Button
                variant={formData.billingPeriod === "yearly" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, billingPeriod: "yearly" })}
              >
                Yearly <Badge variant="secondary" className="ml-2">Save 17%</Badge>
              </Button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {PLANS.map((plan) => (
                <Card
                  key={plan.id}
                  className={`cursor-pointer transition-all hover:border-primary ${
                    formData.selectedPlan === plan.id ? "border-primary ring-2 ring-primary/20" : ""
                  } ${plan.popular ? "relative" : ""}`}
                  onClick={() => setFormData({ ...formData, selectedPlan: plan.id })}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">Most Popular</Badge>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <span className="text-3xl font-bold">
                        ${formData.billingPeriod === "yearly" ? Math.round(plan.price * 0.83) : plan.price}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              14-day free trial included. Cancel anytime.
            </p>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground text-center mb-6">
              Connect your CRM to automatically sync calls for AI grading
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {CRM_OPTIONS.map((crm) => (
                <Card
                  key={crm.id}
                  className={`cursor-pointer transition-all hover:border-primary ${
                    formData.selectedCrm === crm.id ? "border-primary ring-2 ring-primary/20" : ""
                  }`}
                  onClick={() => setFormData({ ...formData, selectedCrm: crm.id })}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {formData.selectedCrm === crm.id && <Check className="h-4 w-4 text-green-500" />}
                      {crm.name}
                    </CardTitle>
                    <CardDescription className="text-sm">{crm.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <p className="text-muted-foreground text-center">
              Upload your sales scripts, training docs, or objection handling guides.
              Our AI will use these to grade calls against your methodology.
            </p>
            <div className="space-y-2">
              <Label>Training Materials</Label>
              <Textarea
                placeholder="Paste your sales script, training notes, or key talking points here..."
                value={formData.trainingMaterials}
                onChange={(e) => setFormData({ ...formData, trainingMaterials: e.target.value })}
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                You can also upload files after setup from the Training page
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleNext}>
              Skip for now
            </Button>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <p className="text-muted-foreground text-center">
              Invite your team members to start using Gunner. They'll receive an email invitation.
            </p>
            <div className="space-y-2">
              <Label>Team Email Addresses</Label>
              <Textarea
                placeholder="john@company.com&#10;jane@company.com&#10;mike@company.com"
                value={formData.teamEmails}
                onChange={(e) => setFormData({ ...formData, teamEmails: e.target.value })}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Enter one email per line. You can add more team members later.
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleNext}>
              Skip for now
            </Button>
          </div>
        );

      case 6:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Rocket className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-2">You're All Set!</h3>
              <p className="text-muted-foreground">
                Welcome to Gunner, {formData.companyName || "your team"}! Your AI call coaching platform is ready.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
              <p className="font-medium">What's next:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Your 14-day free trial has started</li>
                <li>• Calls will be automatically synced from your CRM</li>
                <li>• AI will grade calls and provide coaching feedback</li>
                <li>• View team performance on your dashboard</li>
              </ul>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="https://manus-storage-test.oss-cn-beijing.aliyuncs.com/user-file/a0e4e2cd-b4d4-4866-9c05-c8e0eb0f4f4a/gunner-logo-final.png"
            alt="Gunner"
            className="h-16 mx-auto"
          />
        </div>

        {/* Progress */}
        <div className="mb-8">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-4">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isComplete = step.id < currentStep;
              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center gap-1 ${
                    isActive ? "text-primary" : isComplete ? "text-green-500" : "text-muted-foreground"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isComplete
                        ? "bg-green-100 text-green-600"
                        : "bg-muted"
                    }`}
                  >
                    {isComplete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span className="text-xs font-medium hidden md:block">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
            <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
          </CardHeader>
          <CardContent>{renderStepContent()}</CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 1}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {currentStep < STEPS.length ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleComplete}>
              Go to Dashboard
              <Rocket className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
