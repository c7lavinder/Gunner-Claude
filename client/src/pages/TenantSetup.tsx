import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Check, Building2, Link2, Users, Rocket, ArrowRight, ArrowLeft,
  UserPlus, Loader2, Trash2, Plus, Copy
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const STEPS = [
  { id: 1, title: "Company Info", icon: Building2, description: "Customer company details" },
  { id: 2, title: "CRM Setup", icon: Link2, description: "Connect GHL & BatchDialer" },
  { id: 3, title: "Team Members", icon: Users, description: "Add the team" },
  { id: 4, title: "Launch", icon: Rocket, description: "Review & create" },
];

const ROLE_OPTIONS = [
  { value: "lead_generator", label: "Lead Generator", description: "Cold calls homeowners" },
  { value: "lead_manager", label: "Lead Manager", description: "Qualifies leads, sets appointments" },
  { value: "acquisition_manager", label: "Acquisition Manager", description: "Handles offer/closing calls" },
  { value: "admin", label: "Admin", description: "Full access to all features" },
];

interface TeamMemberEntry {
  name: string;
  teamRole: "admin" | "lead_manager" | "acquisition_manager" | "lead_generator";
  phone: string;
}

export default function TenantSetup() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    companyName: "",
    companySlug: "",
    subscriptionTier: "trial" as "trial" | "starter" | "growth" | "scale",
    // CRM
    ghlApiKey: "",
    ghlLocationId: "",
    batchDialerApiKey: "",
    dispoPipelineName: "",
    newDealStageName: "",
    // Team
    teamMembers: [
      { name: "", teamRole: "lead_generator" as const, phone: "" },
    ] as TeamMemberEntry[],
    // Bulk paste
    bulkPaste: "",
  });

  const setupTenantMutation = trpc.tenant.setup.useMutation();

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
  };

  const addTeamMember = () => {
    setFormData({
      ...formData,
      teamMembers: [...formData.teamMembers, { name: "", teamRole: "lead_generator", phone: "" }],
    });
  };

  const updateTeamMember = (index: number, field: keyof TeamMemberEntry, value: string) => {
    const updated = [...formData.teamMembers];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, teamMembers: updated });
  };

  const removeTeamMember = (index: number) => {
    if (formData.teamMembers.length > 1) {
      setFormData({
        ...formData,
        teamMembers: formData.teamMembers.filter((_, i) => i !== index),
      });
    }
  };

  const parseBulkPaste = () => {
    const lines = formData.bulkPaste.trim().split("\n").filter(l => l.trim());
    if (lines.length === 0) {
      toast.error("No data to parse. Paste names (one per line) or CSV format: Name, Role, Phone");
      return;
    }

    const parsed: TeamMemberEntry[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map(p => p.trim());
      const name = parts[0];
      if (!name) continue;

      // Try to detect role from second column
      let teamRole: TeamMemberEntry["teamRole"] = "lead_generator";
      if (parts[1]) {
        const roleLower = parts[1].toLowerCase();
        if (roleLower.includes("lead_manager") || roleLower.includes("lead manager") || roleLower.includes("lm")) {
          teamRole = "lead_manager";
        } else if (roleLower.includes("acquisition") || roleLower.includes("am")) {
          teamRole = "acquisition_manager";
        } else if (roleLower.includes("admin")) {
          teamRole = "admin";
        } else if (roleLower.includes("lead_gen") || roleLower.includes("lead gen") || roleLower.includes("lg") || roleLower.includes("cold")) {
          teamRole = "lead_generator";
        }
      }

      const phone = parts[2] || "";
      parsed.push({ name, teamRole, phone });
    }

    if (parsed.length > 0) {
      setFormData({ ...formData, teamMembers: parsed, bulkPaste: "" });
      toast.success(`Parsed ${parsed.length} team member(s). Review roles below.`);
    } else {
      toast.error("Could not parse any team members from the pasted text.");
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !formData.companyName) {
      toast.error("Company name is required");
      return;
    }
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      // Build CRM config
      const crmConfig: Record<string, unknown> = {};
      const hasCrm = formData.ghlApiKey && formData.ghlLocationId;

      if (hasCrm) {
        crmConfig.ghlApiKey = formData.ghlApiKey;
        crmConfig.ghlLocationId = formData.ghlLocationId;
      }
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

      // Filter out empty team members
      const validMembers = formData.teamMembers.filter(m => m.name.trim());

      await setupTenantMutation.mutateAsync({
        name: formData.companyName,
        slug: formData.companySlug || generateSlug(formData.companyName),
        subscriptionTier: formData.subscriptionTier,
        crmType: hasCrm ? "ghl" : "none",
        crmConfig: Object.keys(crmConfig).length > 0 ? crmConfig as any : undefined,
        teamMembers: validMembers.length > 0 ? validMembers : undefined,
      });

      toast.success(`Tenant "${formData.companyName}" created successfully with ${validMembers.length} team members!`);
      setLocation("/admin");
    } catch (error: any) {
      console.error("Failed to create tenant:", error);
      toast.error(error.message || "Failed to create tenant. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const validMemberCount = formData.teamMembers.filter(m => m.name.trim()).length;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                placeholder="e.g., ABC Home Buyers"
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
              <Label htmlFor="companySlug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm whitespace-nowrap">gunner.app/</span>
                <Input
                  id="companySlug"
                  value={formData.companySlug}
                  onChange={(e) => setFormData({ ...formData, companySlug: generateSlug(e.target.value) })}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subscription Tier</Label>
              <Select
                value={formData.subscriptionTier}
                onValueChange={(value) => setFormData({ ...formData, subscriptionTier: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial (14 days free)</SelectItem>
                  <SelectItem value="starter">Starter ($99/mo)</SelectItem>
                  <SelectItem value="growth">Growth ($249/mo)</SelectItem>
                  <SelectItem value="scale">Scale ($499/mo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                GoHighLevel Connection
              </h4>
              <div className="space-y-2">
                <Label htmlFor="ghlApiKey">GHL API Key</Label>
                <Input
                  id="ghlApiKey"
                  type="password"
                  placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={formData.ghlApiKey}
                  onChange={(e) => setFormData({ ...formData, ghlApiKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ghlLocationId">GHL Location ID</Label>
                <Input
                  id="ghlLocationId"
                  placeholder="e.g., hmD7eWGQJE7EVFpJxj4q"
                  value={formData.ghlLocationId}
                  onChange={(e) => setFormData({ ...formData, ghlLocationId: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium">Pipeline Mapping</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dispoPipelineName">Dispo Pipeline Name</Label>
                  <Input
                    id="dispoPipelineName"
                    placeholder="e.g., Dispo Pipeline"
                    value={formData.dispoPipelineName}
                    onChange={(e) => setFormData({ ...formData, dispoPipelineName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newDealStageName">New Deal Stage Name</Label>
                  <Input
                    id="newDealStageName"
                    placeholder="e.g., New Deal"
                    value={formData.newDealStageName}
                    onChange={(e) => setFormData({ ...formData, newDealStageName: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium">BatchDialer (Optional)</h4>
              <div className="space-y-2">
                <Label htmlFor="batchDialerApiKey">BatchDialer API Key</Label>
                <Input
                  id="batchDialerApiKey"
                  type="password"
                  placeholder="Enter BatchDialer API key"
                  value={formData.batchDialerApiKey}
                  onChange={(e) => setFormData({ ...formData, batchDialerApiKey: e.target.value })}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              You can skip CRM setup and configure it later from the tenant's settings
            </p>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <p className="text-muted-foreground text-center text-sm">
              Add team members who make calls. Their names must match what appears in GHL/BatchDialer for auto-matching.
            </p>

            {/* Bulk paste section */}
            <div className="space-y-2 p-4 bg-muted/30 rounded-lg border border-dashed">
              <Label className="flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Quick Import (Paste)
              </Label>
              <Textarea
                placeholder={"Paste team members here, one per line:\nJohn Smith, Lead Manager\nJane Doe, Lead Generator\nMike Johnson, Acquisition Manager"}
                value={formData.bulkPaste}
                onChange={(e) => setFormData({ ...formData, bulkPaste: e.target.value })}
                rows={4}
              />
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  Format: Name, Role, Phone (Role and Phone are optional)
                </p>
                <Button variant="outline" size="sm" onClick={parseBulkPaste} disabled={!formData.bulkPaste.trim()}>
                  Parse & Import
                </Button>
              </div>
            </div>

            {/* Individual entries */}
            <div className="space-y-3">
              <Label>Team Members ({validMemberCount})</Label>
              {formData.teamMembers.map((member, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Input
                    placeholder="Full name (as in CRM)"
                    value={member.name}
                    onChange={(e) => updateTeamMember(index, "name", e.target.value)}
                    className="flex-1"
                  />
                  <Select
                    value={member.teamRole}
                    onValueChange={(value) => updateTeamMember(index, "teamRole", value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.teamMembers.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTeamMember(index)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={addTeamMember}>
                <Plus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Rocket className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold">Review & Launch</h3>
              <p className="text-muted-foreground text-sm">Confirm everything looks good before creating the tenant</p>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Company</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Name:</span> <strong>{formData.companyName}</strong></div>
                  <div><span className="text-muted-foreground">Slug:</span> {formData.companySlug}</div>
                  <div><span className="text-muted-foreground">Plan:</span> <Badge variant="outline">{formData.subscriptionTier}</Badge></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">CRM Integration</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {formData.ghlApiKey ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        GoHighLevel connected
                      </div>
                      <div><span className="text-muted-foreground">Location:</span> {formData.ghlLocationId}</div>
                      {formData.dispoPipelineName && (
                        <div><span className="text-muted-foreground">Pipeline:</span> {formData.dispoPipelineName}</div>
                      )}
                      {formData.newDealStageName && (
                        <div><span className="text-muted-foreground">New Deal Stage:</span> {formData.newDealStageName}</div>
                      )}
                    </>
                  ) : (
                    <div className="text-muted-foreground">No CRM configured (can add later)</div>
                  )}
                  {formData.batchDialerApiKey && (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      BatchDialer connected
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Team Members ({validMemberCount})</CardTitle>
                </CardHeader>
                <CardContent>
                  {validMemberCount > 0 ? (
                    <div className="space-y-1">
                      {formData.teamMembers.filter(m => m.name.trim()).map((member, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{member.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {ROLE_OPTIONS.find(r => r.value === member.teamRole)?.label || member.teamRole}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No team members added (can add later)</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">New Customer Setup</h1>
            <p className="text-muted-foreground text-sm">Onboard a new wholesaling company in minutes</p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isComplete = step.id < currentStep;
              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center gap-1 cursor-pointer ${
                    isActive ? "text-primary" : isComplete ? "text-green-500" : "text-muted-foreground"
                  }`}
                  onClick={() => setCurrentStep(step.id)}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isComplete
                        ? "bg-green-100 text-green-600"
                        : "bg-muted"
                    }`}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
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
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={saving || !formData.companyName}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {saving ? "Creating Tenant..." : "Create Tenant"}
              {!saving && <Rocket className="h-4 w-4 ml-2" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
