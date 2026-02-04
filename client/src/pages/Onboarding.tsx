import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Building2, Link2, FileText, Users, Rocket, ArrowRight, ArrowLeft, UserPlus, Clock, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const STEPS = [
  { id: 1, title: "Company Info", icon: Building2, description: "Tell us about your business" },
  { id: 2, title: "Connect CRM", icon: Link2, description: "Integrate your CRM" },
  { id: 3, title: "Define Roles", icon: UserPlus, description: "Set up team roles" },
  { id: 4, title: "Training", icon: FileText, description: "Upload training materials" },
  { id: 5, title: "Invite Team", icon: Users, description: "Add team members" },
  { id: 6, title: "Launch", icon: Rocket, description: "You're ready to go!" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona (No DST)" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "UTC", label: "UTC" },
];

const CRM_OPTIONS = [
  { id: "ghl", name: "GoHighLevel", description: "Popular CRM for agencies", available: true },
  { id: "hubspot", name: "HubSpot", description: "Enterprise CRM platform", available: false },
  { id: "salesforce", name: "Salesforce", description: "World's #1 CRM", available: false },
  { id: "close", name: "Close", description: "Built for sales teams", available: false },
  { id: "pipedrive", name: "Pipedrive", description: "Sales-focused CRM", available: false },
  { id: "none", name: "Skip for now", description: "Connect later", available: true },
];

const ROLE_TEMPLATES = [
  { id: "admin", name: "Admin", description: "Full access to all features and settings" },
  { id: "lead_manager", name: "Lead Manager", description: "Handles qualification calls, manages Lead Generators" },
  { id: "acquisition_manager", name: "Acquisition Manager", description: "Handles offer/closing calls" },
  { id: "lead_generator", name: "Lead Generator", description: "Outbound lead generation (cold calling, SMS)" },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  
  // Check for success/canceled from Stripe checkout
  const checkoutSuccess = searchParams.get('success') === 'true';
  const checkoutCanceled = searchParams.get('canceled') === 'true';
  const stepParam = searchParams.get('step');
  
  // Fetch tenant settings to get saved onboarding step
  const { user } = useAuth();
  const { data: tenantSettings, isLoading: tenantLoading } = trpc.tenant.getSettings.useQuery(
    undefined,
    { 
      enabled: !!user,
      staleTime: Infinity, // Don't refetch - we only need initial value
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );
  
  // Use ref to track if we've already initialized the step (survives re-renders)
  const stepInitializedRef = useRef(false);
  
  // Initialize step from URL param, tenant settings, or default to 1
  const [currentStep, setCurrentStep] = useState(() => {
    // Check URL param first
    if (stepParam) {
      return parseInt(stepParam);
    }
    return 1; // Default, will be updated by useEffect if tenant has saved step
  });
  
  // Initialize step from tenant settings (only once)
  useEffect(() => {
    if (!stepInitializedRef.current && !tenantLoading && tenantSettings) {
      stepInitializedRef.current = true;
      // Only update if tenant has a saved step > 1 and no URL param
      if (!stepParam && tenantSettings.onboardingStep && tenantSettings.onboardingStep > 1) {
        setCurrentStep(tenantSettings.onboardingStep);
      }
    }
  }, [tenantSettings, tenantLoading, stepParam]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    companySlug: "",
    timezone: "America/Chicago",
    selectedCrm: "",
    ghlApiKey: "",
    ghlLocationId: "",
    selectedRoles: ["lead_manager", "acquisition_manager"] as string[],
    trainingMaterials: "",
    teamInvites: [
      { email: "", role: "lead_manager" },
    ],
  });

  // Show toast on checkout result
  useEffect(() => {
    if (checkoutSuccess) {
      toast.success("Payment successful! Let's finish setting up your account.");
    } else if (checkoutCanceled) {
      toast.info("Checkout was canceled. You can complete payment later from Settings.");
    }
  }, [checkoutSuccess, checkoutCanceled]);

  const updateTenantMutation = trpc.tenant.updateSettings.useMutation();
  const inviteUserMutation = trpc.tenant.inviteUser.useMutation();
  const createTrainingMutation = trpc.training.create.useMutation();
  const completeOnboardingMutation = trpc.tenant.completeOnboarding.useMutation();

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      // Save data for each step
      if (currentStep === 1 && formData.companyName) {
        await updateTenantMutation.mutateAsync({
          name: formData.companyName,
        });
      }
      
      if (currentStep === 4 && formData.trainingMaterials.trim()) {
        await createTrainingMutation.mutateAsync({
          title: "Initial Training Materials",
          content: formData.trainingMaterials,
          category: "script",
          applicableTo: "all",
        });
      }
      
      if (currentStep === 5) {
        // Send invitations
        const validInvites = formData.teamInvites.filter(i => i.email.trim());
        for (const invite of validInvites) {
          try {
            await inviteUserMutation.mutateAsync({
              email: invite.email,
              role: invite.role as any,
            });
          } catch (e) {
            console.error("Failed to invite:", invite.email, e);
          }
        }
        if (validInvites.length > 0) {
          toast.success(`Invited ${validInvites.length} team member(s)`);
        }
      }
      
      if (currentStep < STEPS.length) {
        setCurrentStep(currentStep + 1);
      }
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const utils = trpc.useUtils();
  
  const handleComplete = async () => {
    setCompleting(true);
    try {
      // Mark onboarding as complete in the database
      await completeOnboardingMutation.mutateAsync();
      // Invalidate tenant settings cache so DashboardLayout sees the updated value
      await utils.tenant.getSettings.invalidate();
      toast.success("Welcome to Gunner! Your account is ready.");
      setLocation("/dashboard");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      // Still redirect even if the mutation fails - invalidate cache anyway
      await utils.tenant.getSettings.invalidate();
      toast.success("Welcome to Gunner! Your account is ready.");
      setLocation("/dashboard");
    } finally {
      setCompleting(false);
    }
  };

  const addTeamInvite = () => {
    setFormData({
      ...formData,
      teamInvites: [...formData.teamInvites, { email: "", role: "lead_manager" }],
    });
  };

  const updateTeamInvite = (index: number, field: "email" | "role", value: string) => {
    const newInvites = [...formData.teamInvites];
    newInvites[index] = { ...newInvites[index], [field]: value };
    setFormData({ ...formData, teamInvites: newInvites });
  };

  const removeTeamInvite = (index: number) => {
    if (formData.teamInvites.length > 1) {
      setFormData({
        ...formData,
        teamInvites: formData.teamInvites.filter((_, i) => i !== index),
      });
    }
  };

  const toggleRole = (roleId: string) => {
    const current = formData.selectedRoles;
    if (current.includes(roleId)) {
      setFormData({ ...formData, selectedRoles: current.filter(r => r !== roleId) });
    } else {
      setFormData({ ...formData, selectedRoles: [...current, roleId] });
    }
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
                <span className="text-muted-foreground text-sm">app.getgunner.ai/</span>
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
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData({ ...formData, timezone: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground text-center mb-6">
              Connect your CRM to automatically sync calls for AI grading
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {CRM_OPTIONS.map((crm) => (
                <Card
                  key={crm.id}
                  className={`cursor-pointer transition-all ${
                    crm.available ? "hover:border-primary" : "opacity-60"
                  } ${formData.selectedCrm === crm.id ? "border-primary ring-2 ring-primary/20" : ""}`}
                  onClick={() => crm.available && setFormData({ ...formData, selectedCrm: crm.id })}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {formData.selectedCrm === crm.id && <Check className="h-4 w-4 text-green-500" />}
                      {crm.name}
                      {!crm.available && <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>}
                    </CardTitle>
                    <CardDescription className="text-sm">{crm.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            
            {formData.selectedCrm === "ghl" && (
              <div className="mt-6 space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium">GoHighLevel Connection</h4>
                <div className="space-y-2">
                  <Label htmlFor="ghlApiKey">API Key</Label>
                  <Input
                    id="ghlApiKey"
                    type="password"
                    placeholder="Enter your GHL API key"
                    value={formData.ghlApiKey}
                    onChange={(e) => setFormData({ ...formData, ghlApiKey: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Find this in GHL → Settings → Business Profile → API Keys
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ghlLocationId">Location ID</Label>
                  <Input
                    id="ghlLocationId"
                    placeholder="Enter your GHL Location ID"
                    value={formData.ghlLocationId}
                    onChange={(e) => setFormData({ ...formData, ghlLocationId: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <p className="text-muted-foreground text-center">
              Select the roles on your team. Each role gets customized grading criteria.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {ROLE_TEMPLATES.map((role) => (
                <Card
                  key={role.id}
                  className={`cursor-pointer transition-all hover:border-primary ${
                    formData.selectedRoles.includes(role.id) ? "border-primary ring-2 ring-primary/20" : ""
                  }`}
                  onClick={() => toggleRole(role.id)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {formData.selectedRoles.includes(role.id) && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                      {role.name}
                    </CardTitle>
                    <CardDescription className="text-sm">{role.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              You can customize roles and grading criteria later in Settings
            </p>
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
                You can also upload PDF/Word files after setup from the Training page
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setCurrentStep(currentStep + 1)}>
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
            <div className="space-y-4">
              {formData.teamInvites.map((invite, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <div className="flex-1">
                    <Input
                      placeholder="team@company.com"
                      type="email"
                      value={invite.email}
                      onChange={(e) => updateTeamInvite(index, "email", e.target.value)}
                    />
                  </div>
                  <Select
                    value={invite.role}
                    onValueChange={(value) => updateTeamInvite(index, "role", value)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_TEMPLATES.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.teamInvites.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTeamInvite(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={addTeamInvite}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Another Team Member
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setCurrentStep(currentStep + 1)}>
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
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Your 14-day free trial has started
                </li>
                <li className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Calls will be automatically synced from your CRM
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  AI will grade calls and provide coaching feedback
                </li>
                <li className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  View team performance on your dashboard
                </li>
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
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/ORoxztkyoTJEjMxT.png"
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
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 1 || saving}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {currentStep < STEPS.length ? (
            <Button onClick={handleNext} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={completing}>
              {completing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {completing ? "Setting up..." : "Go to Dashboard"}
              {!completing && <Rocket className="h-4 w-4 ml-2" />}
            </Button>
          )}
        </div>
        
        {/* Time estimate */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Setup takes about 5 minutes • You can skip steps and complete later
        </p>
      </div>
    </div>
  );
}
