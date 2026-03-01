import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Building2, Link2, FileText, Users, Rocket, ArrowRight, ArrowLeft, UserPlus, Clock, Loader2, Wifi, WifiOff, GitBranch, Copy, Webhook, AlertTriangle, Zap, ExternalLink } from "lucide-react";
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
  { id: "lead_manager", name: "Lead Manager", description: "Qualifies leads, sets appointments for walkthroughs, manages Lead Generators" },
  { id: "acquisition_manager", name: "Acquisition Manager", description: "Handles offer/closing calls" },
  { id: "lead_generator", name: "Lead Generator", description: "Cold calls homeowners to generate interest in selling — does NOT set appointments" },
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
  // GHL connection test state
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    success: boolean;
    locationName?: string;
    error?: string;
  }>({ tested: false, success: false });
  // Pipeline state
  const [loadingPipelines, setLoadingPipelines] = useState(false);
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [stageMapping, setStageMapping] = useState<Record<string, string>>({});
  // Stage classification: maps stage name (lowercase) to bucket
  const [stageClassifications, setStageClassifications] = useState<Record<string, 'active' | 'follow_up' | 'dead' | 'unclassified'>>({});
  const [formData, setFormData] = useState({
    companyName: "",
    companySlug: "",
    timezone: "America/Chicago",
    selectedCrm: "",
    ghlApiKey: "",
    ghlLocationId: "",
    batchDialerApiKey: "",
    dispoPipelineName: "",
    newDealStageName: "",
    industry: "",
    activeStages: "",
    followUpStages: "",
    deadStages: "",
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
  const testConnectionMut = trpc.tenant.testGhlConnection.useMutation();
  const fetchPipelinesMut = trpc.tenant.fetchGhlPipelines.useMutation();
  
  // OAuth queries
  const { data: oauthInstallUrl } = trpc.tenant.getGhlOAuthInstallUrl.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const { data: oauthStatus, refetch: refetchOAuthStatus } = trpc.tenant.getGhlOAuthStatus.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5s while onboarding to detect OAuth callback completion
  });

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
          onboardingStep: 2,
        });
      }
      
      if (currentStep === 2 && formData.selectedCrm) {
        const isOAuthConnected = oauthStatus?.connected;
        const hasManualKeys = formData.ghlApiKey && formData.ghlLocationId;
        
        if (formData.selectedCrm === 'ghl' && (isOAuthConnected || hasManualKeys)) {
          // Build crmConfig JSON with all CRM credentials
          const crmConfig: Record<string, unknown> = {};
          // Only include API key/location if manually entered (OAuth handles its own)
          if (formData.ghlApiKey) crmConfig.ghlApiKey = formData.ghlApiKey;
          if (formData.ghlLocationId) crmConfig.ghlLocationId = formData.ghlLocationId;
          if (formData.batchDialerApiKey) {
            crmConfig.batchDialerEnabled = true;
            crmConfig.batchDialerApiKey = formData.batchDialerApiKey;
          }
          if (formData.dispoPipelineName) {
            crmConfig.dispoPipelineName = formData.dispoPipelineName;
          }
          if (formData.newDealStageName) {
            crmConfig.newDealStageName = formData.newDealStageName;
          }
          if (formData.industry) {
            crmConfig.industry = formData.industry;
          }
          // Derive stage classification from interactive map or free-text fallback
          const hasInteractiveClassifications = Object.keys(stageClassifications).length > 0;
          let activeStages: string[] = [];
          let followUpStages: string[] = [];
          let deadStages: string[] = [];
          if (hasInteractiveClassifications) {
            for (const [stageName, bucket] of Object.entries(stageClassifications)) {
              if (bucket === 'active') activeStages.push(stageName);
              else if (bucket === 'follow_up') followUpStages.push(stageName);
              else if (bucket === 'dead') deadStages.push(stageName);
            }
          } else {
            // Fallback: parse comma-separated text inputs
            const parseStages = (val: string) => val.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
            activeStages = parseStages(formData.activeStages);
            followUpStages = parseStages(formData.followUpStages);
            deadStages = parseStages(formData.deadStages);
          }
          if (activeStages.length > 0 || followUpStages.length > 0 || deadStages.length > 0) {
            crmConfig.stageClassification = { activeStages, followUpStages, deadStages };
          }
          
          await updateTenantMutation.mutateAsync({
            crmType: 'ghl',
            crmConfig: JSON.stringify(crmConfig),
            crmConnected: 'true',
            onboardingStep: 3,
          });
          toast.success("CRM credentials saved successfully!");
        } else if (formData.selectedCrm === 'none') {
          await updateTenantMutation.mutateAsync({
            crmType: 'none',
            onboardingStep: 3,
          });
        }
      }
      
      if (currentStep === 3) {
        await updateTenantMutation.mutateAsync({
          onboardingStep: 4,
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
      // Redirect to paywall - user must enter card before accessing dashboard
      toast.success("Almost there! Start your free trial to access your dashboard.");
      setLocation("/paywall");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      // Still redirect even if the mutation fails - invalidate cache anyway
      await utils.tenant.getSettings.invalidate();
      toast.success("Almost there! Start your free trial to access your dashboard.");
      setLocation("/paywall");
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
                <span className="text-muted-foreground text-sm">getgunner.ai/</span>
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
                <div key={crm.id}
                  className={`obs-panel cursor-pointer transition-all ${
                    crm.available ? "hover:border-primary" : "opacity-60"
                  } ${formData.selectedCrm === crm.id ? "border-primary ring-2 ring-primary/20" : ""}`}
                  onClick={() => crm.available && setFormData({ ...formData, selectedCrm: crm.id })}
                >
                  <div className="pb-2" style={{marginBottom: 16}}>
                    <h3 className="obs-section-title text-base flex items-center gap-2">
                      {formData.selectedCrm === crm.id && <Check className="h-4 w-4 text-green-500" />}
                      {crm.name}
                      {!crm.available && <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>}
                    </h3>
                    <p className="text-sm" style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>{crm.description}</p>
                  </div>
                </div>
              ))}
            </div>
            
            {formData.selectedCrm === "ghl" && (
              <div className="mt-6 space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium">CRM Connection</h4>
                
                {/* OAuth Connect Button — Primary Method */}
                {oauthInstallUrl?.available && (
                  <div className="space-y-3">
                    {oauthStatus?.connected ? (
                      <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                        <Check className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-800 dark:text-green-300">Connected via GoHighLevel Marketplace</p>
                          {oauthStatus.locationId && (
                            <p className="text-xs text-green-600 dark:text-green-400">Location: {oauthStatus.locationId}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <Button
                          className="w-full h-12 text-base gap-2"
                          onClick={() => {
                            if (oauthInstallUrl.url) {
                              window.open(oauthInstallUrl.url, '_blank');
                              toast.info("Complete the connection in the GoHighLevel tab, then return here.");
                            }
                          }}
                        >
                          <ExternalLink className="h-5 w-5" />
                          Connect with GoHighLevel
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          One-click setup — no API keys needed. Automatically connects your GHL account.
                        </p>
                      </>
                    )}
                    
                    {!oauthStatus?.connected && (
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-muted/50 px-2 text-muted-foreground">or connect manually</span></div>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual API Key Fields — Fallback / shown when OAuth not available or not connected */}
                {(!oauthInstallUrl?.available || !oauthStatus?.connected) && (
                  <div className={`space-y-4 ${oauthInstallUrl?.available && !oauthStatus?.connected ? '' : ''}`}>
                    <div className="space-y-2">
                      <Label htmlFor="ghlApiKey">API Key</Label>
                      <Input
                        id="ghlApiKey"
                        type="password"
                        placeholder="Enter your CRM API key"
                        value={formData.ghlApiKey}
                        onChange={(e) => setFormData({ ...formData, ghlApiKey: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Find this in your CRM → Settings → Business Profile → API Keys
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ghlLocationId">Location ID</Label>
                      <Input
                        id="ghlLocationId"
                        placeholder="Enter your CRM Location ID"
                        value={formData.ghlLocationId}
                        onChange={(e) => {
                          setFormData({ ...formData, ghlLocationId: e.target.value });
                          setConnectionStatus({ tested: false, success: false });
                        }}
                      />
                    </div>

                    {/* Test Connection Button */}
                    <div className="flex items-center gap-3">
                      <Button
                        variant={connectionStatus.success ? "outline" : "default"}
                        size="sm"
                        onClick={async () => {
                          if (!formData.ghlApiKey || !formData.ghlLocationId) {
                            toast.error("Enter both API Key and Location ID first");
                            return;
                          }
                          setTestingConnection(true);
                          setConnectionStatus({ tested: false, success: false });
                          try {
                            const result = await testConnectionMut.mutateAsync({
                              apiKey: formData.ghlApiKey,
                              locationId: formData.ghlLocationId,
                            });
                            if (result.success) {
                              setConnectionStatus({ tested: true, success: true, locationName: result.locationName });
                              toast.success(result.message || "Connection successful!");
                              // Auto-fetch pipelines
                              setLoadingPipelines(true);
                              try {
                                const pResult = await fetchPipelinesMut.mutateAsync({
                                  apiKey: formData.ghlApiKey,
                                  locationId: formData.ghlLocationId,
                                });
                                if (pResult.success && pResult.pipelines.length > 0) {
                                  setPipelines(pResult.pipelines);
                                  if (!selectedPipelineId) setSelectedPipelineId(pResult.pipelines[0].id);
                                }
                              } catch {} finally { setLoadingPipelines(false); }
                            } else {
                              setConnectionStatus({ tested: true, success: false, error: result.error });
                              toast.error(result.error || "Connection failed");
                            }
                          } catch (error: any) {
                            setConnectionStatus({ tested: true, success: false, error: error.message });
                            toast.error(error.message || "Connection test failed");
                          } finally { setTestingConnection(false); }
                        }}
                        disabled={testingConnection || !formData.ghlApiKey || !formData.ghlLocationId}
                      >
                        {testingConnection ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : connectionStatus.success ? (
                          <Wifi className="h-4 w-4 mr-2 text-green-500" />
                        ) : (
                          <Wifi className="h-4 w-4 mr-2" />
                        )}
                        {testingConnection ? "Testing..." : connectionStatus.success ? "Re-test" : "Test Connection"}
                      </Button>
                      {connectionStatus.tested && (
                        <div className="flex items-center gap-2 text-sm">
                          {connectionStatus.success ? (
                            <><Check className="h-4 w-4 text-green-500" /><span className="text-green-600">Connected to <strong>{connectionStatus.locationName}</strong></span></>
                          ) : (
                            <><WifiOff className="h-4 w-4 text-red-500" /><span className="text-red-600">{connectionStatus.error}</span></>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Webhook Setup Wizard Card */}
                {connectionStatus.success && (
                  <div className="border-t pt-4 mt-4">
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                      <h4 className="font-medium mb-2 flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                        <Webhook className="h-4 w-4" />
                        Recommended: Enable Real-Time Webhooks
                      </h4>
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-3">
                        Webhooks deliver new calls and opportunities to Gunner instantly — within seconds instead of waiting for the next sync cycle. This means faster grading and less API usage.
                      </p>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Your Webhook URL:</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="flex-1 text-xs bg-white dark:bg-black/30 border border-emerald-200 dark:border-emerald-700 rounded px-3 py-2 font-mono break-all">
                              {`${window.location.origin}/api/webhook/ghl`}
                            </code>
                            <Button
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/api/webhook/ghl`);
                                toast.success("Webhook URL copied!");
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 space-y-1.5">
                          <p className="font-medium">How to set up in your GHL app:</p>
                          <ol className="list-decimal list-inside space-y-1 ml-1">
                            <li>Go to your <strong>GHL Developer App</strong> settings (or Marketplace app)</li>
                            <li>Navigate to the <strong>Webhooks</strong> section</li>
                            <li>Add the URL above as a new webhook endpoint</li>
                            <li>Subscribe to these events:</li>
                          </ol>
                          <div className="flex flex-wrap gap-1.5 ml-5 mt-1">
                            {["InboundMessage", "OutboundMessage", "OpportunityCreate", "OpportunityStageUpdate", "ContactCreate", "ContactUpdate"].map((evt) => (
                              <span key={evt} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700">
                                {evt}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30 rounded p-2">
                          <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>Without webhooks, Gunner will still sync your calls via polling every 2 hours. Webhooks just make it instant. You can set this up now or later from Settings → CRM.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2"><GitBranch className="h-4 w-4" /> Pipeline Mapping</h4>
                  {connectionStatus.success && pipelines.length > 0 ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Select Dispo Pipeline</Label>
                        <Select
                          value={selectedPipelineId}
                          onValueChange={(value) => {
                            setSelectedPipelineId(value);
                            const p = pipelines.find(pp => pp.id === value);
                            if (p) setFormData({ ...formData, dispoPipelineName: p.name });
                            setStageMapping({});
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Choose a pipeline" /></SelectTrigger>
                          <SelectContent>
                            {pipelines.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.stages.length} stages)</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {(() => {
                        const selPipeline = pipelines.find(p => p.id === selectedPipelineId);
                        if (!selPipeline || selPipeline.stages.length === 0) return null;
                        return (
                          <div className="space-y-2">
                            <Label className="text-sm">Map stages to call types</Label>
                            {selPipeline.stages.map((stage) => (
                              <div key={stage.id} className="flex items-center gap-3 p-2 bg-background rounded border">
                                <span className="text-sm font-medium flex-1 truncate">{stage.name}</span>
                                <Select
                                  value={stageMapping[stage.id] || ""}
                                  onValueChange={(value) => {
                                    setStageMapping({ ...stageMapping, [stage.id]: value });
                                    if (stage.name.toLowerCase().includes("new deal") || stage.name.toLowerCase().includes("new lead")) {
                                      setFormData({ ...formData, newDealStageName: stage.name });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Call type" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unmapped">— Not mapped —</SelectItem>
                                    <SelectItem value="lead_gen">Lead Generation</SelectItem>
                                    <SelectItem value="qualification">Qualification</SelectItem>
                                    <SelectItem value="acquisition">Acquisition</SelectItem>
                                    <SelectItem value="follow_up">Follow Up</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      <div className="space-y-2 mt-3">
                        <Label htmlFor="newDealStageName">New Deal Stage Name</Label>
                        <Input
                          id="newDealStageName"
                          placeholder="e.g., New Deal"
                          value={formData.newDealStageName}
                          onChange={(e) => setFormData({ ...formData, newDealStageName: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">Stage that triggers the "Closer" badge</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-3">
                        {connectionStatus.success ? "No pipelines found. Enter names manually:" : "Connect CRM above to auto-load pipelines, or enter names manually:"}
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="dispoPipelineName">Dispo Pipeline Name</Label>
                        <Input
                          id="dispoPipelineName"
                          placeholder="e.g., Dispo Pipeline"
                          value={formData.dispoPipelineName}
                          onChange={(e) => setFormData({ ...formData, dispoPipelineName: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">The pipeline in your CRM where qualified leads are moved</p>
                      </div>
                      <div className="space-y-2 mt-3">
                        <Label htmlFor="newDealStageName">New Deal Stage Name</Label>
                        <Input
                          id="newDealStageName"
                          placeholder="e.g., New Deal"
                          value={formData.newDealStageName}
                          onChange={(e) => setFormData({ ...formData, newDealStageName: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">The stage name for new deals in your dispo pipeline</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Stage Classification */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">Pipeline Stage Classification</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Classify your pipeline stages so Gunner can detect opportunities. Click each stage to cycle through categories.
                  </p>
                  
                  {connectionStatus.success && pipelines.length > 0 ? (() => {
                    // Get all stages from ALL pipelines (not just selected)
                    const allStages = pipelines.flatMap(p => p.stages);
                    if (allStages.length === 0) return null;
                    
                    const bucketColors = {
                      active: { bg: 'bg-green-100 dark:bg-green-900/40', border: 'border-green-400', text: 'text-green-700 dark:text-green-300', label: 'Active Deal' },
                      follow_up: { bg: 'bg-yellow-100 dark:bg-yellow-900/40', border: 'border-yellow-400', text: 'text-yellow-700 dark:text-yellow-300', label: 'Follow-Up' },
                      dead: { bg: 'bg-red-100 dark:bg-red-900/40', border: 'border-red-400', text: 'text-red-700 dark:text-red-300', label: 'Dead / Closed' },
                      unclassified: { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground', label: 'Unclassified' },
                    };
                    const cycleOrder: Array<'active' | 'follow_up' | 'dead' | 'unclassified'> = ['unclassified', 'active', 'follow_up', 'dead'];
                    
                    const handleStageClick = (stageName: string) => {
                      const key = stageName.toLowerCase();
                      const current = stageClassifications[key] || 'unclassified';
                      const currentIdx = cycleOrder.indexOf(current);
                      const next = cycleOrder[(currentIdx + 1) % cycleOrder.length];
                      setStageClassifications(prev => ({ ...prev, [key]: next }));
                    };
                    
                    // Count per bucket
                    const counts = { active: 0, follow_up: 0, dead: 0, unclassified: 0 };
                    allStages.forEach(s => {
                      const bucket = stageClassifications[s.name.toLowerCase()] || 'unclassified';
                      counts[bucket]++;
                    });
                    
                    return (
                      <div className="space-y-3">
                        {/* Legend */}
                        <div className="flex flex-wrap gap-3 text-xs">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Active Deal ({counts.active})</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Follow-Up ({counts.follow_up})</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Dead ({counts.dead})</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" /> Unclassified ({counts.unclassified})</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Click a stage to cycle: Unclassified → Active → Follow-Up → Dead</p>
                        
                        {/* Stage chips */}
                        <div className="flex flex-wrap gap-2">
                          {allStages.map((stage) => {
                            const bucket = stageClassifications[stage.name.toLowerCase()] || 'unclassified';
                            const colors = bucketColors[bucket];
                            return (
                              <button
                                key={stage.id}
                                type="button"
                                onClick={() => handleStageClick(stage.name)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all cursor-pointer hover:scale-105 ${colors.bg} ${colors.border} ${colors.text}`}
                              >
                                {stage.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })() : (
                    /* Fallback: free-text inputs when no pipelines loaded */
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                          Active Deal Stages
                        </Label>
                        <Input
                          placeholder="e.g. warm leads, pending apt, made offer, counter offer"
                          value={formData.activeStages}
                          onChange={(e) => setFormData({ ...formData, activeStages: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" />
                          Follow-Up Stages
                        </Label>
                        <Input
                          placeholder="e.g. follow up, callback, nurture"
                          value={formData.followUpStages}
                          onChange={(e) => setFormData({ ...formData, followUpStages: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                          Dead / Closed Stages
                        </Label>
                        <Input
                          placeholder="e.g. dead, not interested, do not contact, wrong number"
                          value={formData.deadStages}
                          onChange={(e) => setFormData({ ...formData, deadStages: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">You can update these later in Settings → Integrations</p>
                </div>

                {/* Industry */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3">Industry / Business Type</h4>
                  <Input
                    placeholder="e.g. real estate wholesaling/investing"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Used to customize AI grading. Default: real estate wholesaling/investing</p>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3">BatchDialer Integration (Optional)</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    If your team uses BatchDialer for cold calling, connect it to sync those calls too
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="batchDialerApiKey">BatchDialer API Key</Label>
                    <Input
                      id="batchDialerApiKey"
                      type="password"
                      placeholder="Enter your BatchDialer API key (optional)"
                      value={formData.batchDialerApiKey}
                      onChange={(e) => setFormData({ ...formData, batchDialerApiKey: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Find this in BatchDialer → Settings → API
                    </p>
                  </div>
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
                <div key={role.id}
                  className={`obs-panel cursor-pointer transition-all hover:border-primary ${
                    formData.selectedRoles.includes(role.id) ? "border-primary ring-2 ring-primary/20" : ""
                  }`}
                  onClick={() => toggleRole(role.id)}
                >
                  <div className="pb-2" style={{marginBottom: 16}}>
                    <h3 className="obs-section-title text-base flex items-center gap-2">
                      {formData.selectedRoles.includes(role.id) && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                      {role.name}
                    </h3>
                    <p className="text-sm" style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>{role.description}</p>
                  </div>
                </div>
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
              <h3 className="text-2xl font-bold mb-2">Ready to Launch!</h3>
              <p className="text-muted-foreground">
                {formData.companyName || "Your team"} is set up and ready to go. One last step to unlock your dashboard.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
              <p className="font-medium">What happens next:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Start your 14-day free trial (cancel anytime)
                </li>
                <li className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Calls will sync automatically from your CRM
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  AI grades every call with coaching feedback
                </li>
                <li className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Track team performance on your dashboard
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
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663328210645/nusXfQu5XBTMz3NUCR6brb/gunner-logo-transparent_1da41add.png"
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
        <div className="obs-panel">
          <div className="text-center" style={{marginBottom: 16}}>
            <h3 className="obs-section-title">{STEPS[currentStep - 1].title}</h3>
            <p style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>{STEPS[currentStep - 1].description}</p>
          </div>
          <div>{renderStepContent()}</div>
        </div>

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
              {completing ? "Setting up..." : "Start Free Trial"}
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
