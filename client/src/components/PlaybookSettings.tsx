/**
 * PlaybookSettings Component
 * 
 * Manages the 3-tier playbook system:
 * - Layer 1 (Software Playbook): Universal defaults (read-only display)
 * - Layer 2 (Industry Playbook): Pre-built template that was seeded
 * - Layer 3 (Tenant Playbook): Customizable roles, rubrics, call types, terminology
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  BookOpen, 
  Users, 
  FileText, 
  Phone, 
  Tag, 
  Edit, 
  Plus, 
  Trash2, 
  Save, 
  RotateCcw,
  ChevronRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Layers,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ============ TYPES ============

interface PlaybookRole {
  id: number;
  name: string;
  code: string;
  description: string | null;
  rubricId: number | null;
  sortOrder: number | null;
}

interface PlaybookRubric {
  id: number;
  name: string;
  description: string | null;
  callType: string | null;
  criteria: string | null;
  redFlags: string | null;
}

interface PlaybookCallType {
  id: number;
  name: string;
  code: string;
  description: string | null;
  rubricId: number | null;
  sortOrder: number | null;
}

interface CriterionItem {
  name: string;
  maxPoints: number;
  description: string;
  keyPhrases?: string[];
}

// ============ MAIN COMPONENT ============

export default function PlaybookSettings() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<"overview" | "roles" | "rubrics" | "callTypes" | "terminology">("overview");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // Fetch playbook data
  const { data: playbook, isLoading, refetch } = trpc.playbook.get.useQuery(undefined, {
    enabled: !!user?.tenantId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!playbook) {
    return <PlaybookEmpty isAdmin={isAdmin} onSeeded={refetch} />;
  }

  const sections = [
    { id: "overview" as const, label: "Overview", icon: Layers },
    { id: "roles" as const, label: "Roles", icon: Users },
    { id: "rubrics" as const, label: "Rubrics", icon: FileText },
    { id: "callTypes" as const, label: "Call Types", icon: Phone },
    { id: "terminology" as const, label: "Terminology", icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      {/* Section Navigation */}
      <div className="flex gap-2 flex-wrap">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeSection === section.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            <section.icon className="h-3.5 w-3.5" />
            {section.label}
          </button>
        ))}
      </div>

      {/* Section Content */}
      {activeSection === "overview" && (
        <PlaybookOverview playbook={playbook} />
      )}
      {activeSection === "roles" && (
        <RolesSection roles={playbook.roles} rubrics={playbook.rubrics} isAdmin={isAdmin} onRefetch={refetch} />
      )}
      {activeSection === "rubrics" && (
        <RubricsSection rubrics={playbook.rubrics} isAdmin={isAdmin} onRefetch={refetch} />
      )}
      {activeSection === "callTypes" && (
        <CallTypesSection callTypes={playbook.callTypes} rubrics={playbook.rubrics} isAdmin={isAdmin} onRefetch={refetch} />
      )}
      {activeSection === "terminology" && (
        <TerminologySection terminology={playbook.terminology} isAdmin={isAdmin} onRefetch={refetch} />
      )}
    </div>
  );
}

// ============ EMPTY STATE ============

function PlaybookEmpty({ isAdmin, onSeeded }: { isAdmin: boolean; onSeeded: () => void }) {
  const seedMutation = trpc.playbook.seed.useMutation({
    onSuccess: () => {
      toast.success("Playbook seeded successfully! Your roles, rubrics, and call types are now configured.");
      onSeeded();
    },
    onError: (err) => toast.error(err.message || "Failed to seed playbook"),
  });

  return (
    <div className="obs-panel">
      <div className="text-center py-8">
        <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Playbook Configured</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Your team doesn't have a playbook set up yet. Seed the Real Estate Wholesaling playbook to get started with pre-configured roles, rubrics, and call types.
        </p>
        {isAdmin && (
          <Button
            onClick={() => seedMutation.mutate({ playbookCode: "real_estate_wholesaling" })}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Seeding...</>
            ) : (
              <><BookOpen className="h-4 w-4 mr-2" />Seed Wholesaling Playbook</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ============ OVERVIEW ============

function PlaybookOverview({ playbook }: { playbook: any }) {
  const industryName = playbook.industryPlaybook === "real_estate_wholesaling" 
    ? "Real Estate Wholesaling" 
    : playbook.industryPlaybook || "Custom";

  return (
    <div className="space-y-4">
      {/* 3-Tier Visual */}
      <div className="obs-panel">
        <h3 className="obs-section-title flex items-center gap-2 mb-4">
          <Layers className="h-5 w-5" />
          Playbook Configuration
        </h3>
        <div className="grid gap-3">
          {/* Layer 1 */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-xs font-bold text-emerald-400">1</span>
            </div>
            <div>
              <p className="font-medium text-emerald-400">Software Playbook</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Universal call coaching fundamentals — rapport, objection handling, tonality, clear next steps. 
                These apply to every call regardless of industry.
              </p>
            </div>
            <Badge variant="outline" className="flex-shrink-0 text-emerald-400 border-emerald-500/30">Active</Badge>
          </div>

          {/* Layer 2 */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="text-xs font-bold text-blue-400">2</span>
            </div>
            <div>
              <p className="font-medium text-blue-400">Industry Playbook: {industryName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pre-built roles ({playbook.roles.length}), rubrics ({playbook.rubrics.length}), and call types ({playbook.callTypes.length}) 
                optimized for {industryName.toLowerCase()} teams.
              </p>
            </div>
            <Badge variant="outline" className="flex-shrink-0 text-blue-400 border-blue-500/30">Seeded</Badge>
          </div>

          {/* Layer 3 */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <span className="text-xs font-bold text-purple-400">3</span>
            </div>
            <div>
              <p className="font-medium text-purple-400">Your Customizations</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Rename roles, adjust rubric weights, change terminology — make it match your team's process. 
                Use the tabs above to customize each section.
              </p>
            </div>
            <Badge variant="outline" className="flex-shrink-0 text-purple-400 border-purple-500/30">Editable</Badge>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="obs-panel p-4 text-center">
          <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-bold">{playbook.roles.length}</p>
          <p className="text-xs text-muted-foreground">Roles</p>
        </div>
        <div className="obs-panel p-4 text-center">
          <FileText className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-bold">{playbook.rubrics.length}</p>
          <p className="text-xs text-muted-foreground">Rubrics</p>
        </div>
        <div className="obs-panel p-4 text-center">
          <Phone className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-bold">{playbook.callTypes.length}</p>
          <p className="text-xs text-muted-foreground">Call Types</p>
        </div>
        <div className="obs-panel p-4 text-center">
          <Tag className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-bold">{Object.keys(playbook.terminology?.outcomeLabels || {}).length}</p>
          <p className="text-xs text-muted-foreground">Outcomes</p>
        </div>
      </div>
    </div>
  );
}

// ============ ROLES SECTION ============

function RolesSection({ roles, rubrics, isAdmin, onRefetch }: { 
  roles: PlaybookRole[]; rubrics: PlaybookRubric[]; isAdmin: boolean; onRefetch: () => void 
}) {
  const [editingRole, setEditingRole] = useState<PlaybookRole | null>(null);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", code: "", description: "", rubricId: "" });

  const updateMutation = trpc.playbook.updateRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); setEditingRole(null); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  const addMutation = trpc.playbook.addRole.useMutation({
    onSuccess: () => { toast.success("Role added"); setShowAddRole(false); setNewRole({ name: "", code: "", description: "", rubricId: "" }); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.playbook.deleteRole.useMutation({
    onSuccess: () => { toast.success("Role removed"); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="obs-panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="obs-section-title flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Roles
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Define the roles on your team. Each role can be linked to a default rubric for grading.
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowAddRole(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Role
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {roles.map((role) => {
            const linkedRubric = rubrics.find(r => r.id === role.rubricId);
            return (
              <div key={role.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{role.name}</p>
                    <Badge variant="outline" className="text-[10px]">{role.code}</Badge>
                  </div>
                  {role.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{role.description}</p>
                  )}
                  {linkedRubric && (
                    <p className="text-xs text-blue-400 mt-0.5">
                      <FileText className="h-3 w-3 inline mr-1" />
                      Rubric: {linkedRubric.name}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-1 ml-2">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingRole(role)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remove role "${role.name}"?`)) {
                          deleteMutation.mutate({ roleId: role.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {roles.length === 0 && (
            <p className="text-center text-muted-foreground py-4">No roles configured</p>
          )}
        </div>
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>Update the role name, description, and linked rubric.</DialogDescription>
          </DialogHeader>
          {editingRole && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Role Name</Label>
                <Input
                  value={editingRole.name}
                  onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingRole.description || ""}
                  onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Rubric</Label>
                <Select
                  value={editingRole.rubricId?.toString() || "none"}
                  onValueChange={(v) => setEditingRole({ ...editingRole, rubricId: v === "none" ? null : parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rubric" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default rubric</SelectItem>
                    {rubrics.map((r) => (
                      <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingRole(null)}>Cancel</Button>
                <Button
                  onClick={() => updateMutation.mutate({
                    roleId: editingRole.id,
                    name: editingRole.name,
                    description: editingRole.description || undefined,
                    rubricId: editingRole.rubricId,
                  })}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Role Dialog */}
      <Dialog open={showAddRole} onOpenChange={setShowAddRole}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Role</DialogTitle>
            <DialogDescription>Create a custom role for your team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Role Name</Label>
              <Input
                placeholder="e.g., Setter, Closer, Dispo Manager"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Code (internal identifier)</Label>
              <Input
                placeholder="e.g., setter, closer"
                value={newRole.code}
                onChange={(e) => setNewRole({ ...newRole, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              />
              <p className="text-xs text-muted-foreground">Lowercase, no spaces. Used internally.</p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="What does this role do?"
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Rubric</Label>
              <Select
                value={newRole.rubricId || "none"}
                onValueChange={(v) => setNewRole({ ...newRole, rubricId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rubric" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No default rubric</SelectItem>
                  {rubrics.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddRole(false)}>Cancel</Button>
              <Button
                onClick={() => addMutation.mutate({
                  name: newRole.name,
                  code: newRole.code,
                  description: newRole.description || undefined,
                  rubricId: newRole.rubricId ? parseInt(newRole.rubricId) : undefined,
                })}
                disabled={addMutation.isPending || !newRole.name || !newRole.code}
              >
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Add Role
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ RUBRICS SECTION ============

function RubricsSection({ rubrics, isAdmin, onRefetch }: { 
  rubrics: PlaybookRubric[]; isAdmin: boolean; onRefetch: () => void 
}) {
  const [editingRubric, setEditingRubric] = useState<PlaybookRubric | null>(null);
  const [editingCriteria, setEditingCriteria] = useState<CriterionItem[]>([]);
  const [editingRedFlags, setEditingRedFlags] = useState<string[]>([]);

  const updateMutation = trpc.playbook.updateRubric.useMutation({
    onSuccess: () => { toast.success("Rubric updated"); setEditingRubric(null); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.playbook.deleteRubric.useMutation({
    onSuccess: () => { toast.success("Rubric removed"); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  const startEditing = (rubric: PlaybookRubric) => {
    setEditingRubric(rubric);
    try {
      const criteria = rubric.criteria ? JSON.parse(rubric.criteria) : [];
      setEditingCriteria(criteria);
    } catch { setEditingCriteria([]); }
    try {
      const flags = rubric.redFlags ? JSON.parse(rubric.redFlags) : [];
      setEditingRedFlags(flags);
    } catch { setEditingRedFlags([]); }
  };

  const formatCallType = (ct: string | null) => {
    if (!ct) return "General";
    return ct.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="space-y-4">
      <div className="obs-panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="obs-section-title flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Grading Rubrics
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Each rubric defines how a specific call type is graded. Adjust criteria weights and red flags to match your process.
            </p>
          </div>
        </div>

        <Accordion type="single" collapsible className="space-y-2">
          {rubrics.map((rubric) => {
            let criteria: CriterionItem[] = [];
            let redFlags: string[] = [];
            try { criteria = rubric.criteria ? JSON.parse(rubric.criteria) : []; } catch {}
            try { redFlags = rubric.redFlags ? JSON.parse(rubric.redFlags) : []; } catch {}
            const totalPoints = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

            return (
              <AccordionItem key={rubric.id} value={rubric.id.toString()} className="border rounded-lg px-3">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-2 text-left">
                    <span className="font-medium">{rubric.name}</span>
                    <Badge variant="outline" className="text-[10px]">{formatCallType(rubric.callType)}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{totalPoints} pts</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pb-2">
                    {rubric.description && (
                      <p className="text-xs text-muted-foreground">{rubric.description}</p>
                    )}

                    {/* Criteria Table */}
                    <div>
                      <p className="text-xs font-semibold mb-1.5 text-foreground">Criteria ({criteria.length})</p>
                      <div className="space-y-1">
                        {criteria.map((c, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/30">
                            <Badge variant="outline" className="text-[10px] flex-shrink-0 mt-0.5">{c.maxPoints}pts</Badge>
                            <div>
                              <p className="font-medium">{c.name}</p>
                              <p className="text-muted-foreground mt-0.5">{c.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Red Flags */}
                    {redFlags.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1.5 text-red-400">Red Flags ({redFlags.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {redFlags.map((flag, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] text-red-400 border-red-500/30">
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {isAdmin && (
                      <div className="flex gap-2 pt-2 border-t border-border/50">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startEditing(rubric)}>
                          <Edit className="h-3 w-3 mr-1" />
                          Edit Rubric
                        </Button>
                        <Button 
                          size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Remove rubric "${rubric.name}"? This cannot be undone.`)) {
                              deleteMutation.mutate({ rubricId: rubric.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {rubrics.length === 0 && (
          <p className="text-center text-muted-foreground py-4">No rubrics configured</p>
        )}
      </div>

      {/* Edit Rubric Dialog */}
      <Dialog open={!!editingRubric} onOpenChange={(open) => !open && setEditingRubric(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Rubric: {editingRubric?.name}</DialogTitle>
            <DialogDescription>Adjust criteria weights, descriptions, and red flags.</DialogDescription>
          </DialogHeader>
          {editingRubric && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Rubric Name</Label>
                <Input
                  value={editingRubric.name}
                  onChange={(e) => setEditingRubric({ ...editingRubric, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingRubric.description || ""}
                  onChange={(e) => setEditingRubric({ ...editingRubric, description: e.target.value })}
                  rows={2}
                />
              </div>

              {/* Criteria Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Criteria ({editingCriteria.length})</Label>
                  <span className="text-xs text-muted-foreground">
                    Total: {editingCriteria.reduce((s, c) => s + c.maxPoints, 0)} pts
                  </span>
                </div>
                <div className="space-y-2">
                  {editingCriteria.map((criterion, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border/50 space-y-2">
                      <div className="flex gap-2">
                        <Input
                          className="flex-1"
                          placeholder="Criterion name"
                          value={criterion.name}
                          onChange={(e) => {
                            const updated = [...editingCriteria];
                            updated[i] = { ...updated[i], name: e.target.value };
                            setEditingCriteria(updated);
                          }}
                        />
                        <Input
                          className="w-20"
                          type="number"
                          placeholder="Pts"
                          value={criterion.maxPoints}
                          onChange={(e) => {
                            const updated = [...editingCriteria];
                            updated[i] = { ...updated[i], maxPoints: parseInt(e.target.value) || 0 };
                            setEditingCriteria(updated);
                          }}
                        />
                        <Button
                          size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive"
                          onClick={() => setEditingCriteria(editingCriteria.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Description of what this criterion evaluates"
                        value={criterion.description}
                        onChange={(e) => {
                          const updated = [...editingCriteria];
                          updated[i] = { ...updated[i], description: e.target.value };
                          setEditingCriteria(updated);
                        }}
                        rows={1}
                        className="text-xs"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  size="sm" variant="outline" className="w-full"
                  onClick={() => setEditingCriteria([...editingCriteria, { name: "", maxPoints: 10, description: "", keyPhrases: [] }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Criterion
                </Button>
              </div>

              {/* Red Flags Editor */}
              <div className="space-y-2">
                <Label>Red Flags ({editingRedFlags.length})</Label>
                <div className="space-y-1">
                  {editingRedFlags.map((flag, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={flag}
                        onChange={(e) => {
                          const updated = [...editingRedFlags];
                          updated[i] = e.target.value;
                          setEditingRedFlags(updated);
                        }}
                        className="text-xs"
                      />
                      <Button
                        size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive"
                        onClick={() => setEditingRedFlags(editingRedFlags.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm" variant="outline" className="w-full"
                  onClick={() => setEditingRedFlags([...editingRedFlags, ""])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Red Flag
                </Button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingRubric(null)}>Cancel</Button>
                <Button
                  onClick={() => updateMutation.mutate({
                    rubricId: editingRubric.id,
                    name: editingRubric.name,
                    description: editingRubric.description || undefined,
                    criteria: JSON.stringify(editingCriteria),
                    redFlags: JSON.stringify(editingRedFlags),
                  })}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Rubric
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ CALL TYPES SECTION ============

function CallTypesSection({ callTypes, rubrics, isAdmin, onRefetch }: { 
  callTypes: PlaybookCallType[]; rubrics: PlaybookRubric[]; isAdmin: boolean; onRefetch: () => void 
}) {
  const [editingCallType, setEditingCallType] = useState<PlaybookCallType | null>(null);
  const [showAddCallType, setShowAddCallType] = useState(false);
  const [newCallType, setNewCallType] = useState({ name: "", code: "", description: "", rubricId: "" });

  const updateMutation = trpc.playbook.updateCallType.useMutation({
    onSuccess: () => { toast.success("Call type updated"); setEditingCallType(null); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  const addMutation = trpc.playbook.addCallType.useMutation({
    onSuccess: () => { toast.success("Call type added"); setShowAddCallType(false); setNewCallType({ name: "", code: "", description: "", rubricId: "" }); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.playbook.deleteCallType.useMutation({
    onSuccess: () => { toast.success("Call type removed"); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="obs-panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="obs-section-title flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Call Types
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Define the types of calls your team makes. Each call type is linked to a rubric for grading.
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowAddCallType(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Type
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {callTypes.map((ct) => {
            const linkedRubric = rubrics.find(r => r.id === ct.rubricId);
            return (
              <div key={ct.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{ct.name}</p>
                    <Badge variant="outline" className="text-[10px]">{ct.code}</Badge>
                  </div>
                  {ct.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{ct.description}</p>
                  )}
                  {linkedRubric && (
                    <p className="text-xs text-blue-400 mt-0.5">
                      <FileText className="h-3 w-3 inline mr-1" />
                      Graded with: {linkedRubric.name}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-1 ml-2">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingCallType(ct)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remove call type "${ct.name}"?`)) {
                          deleteMutation.mutate({ callTypeId: ct.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {callTypes.length === 0 && (
            <p className="text-center text-muted-foreground py-4">No call types configured</p>
          )}
        </div>
      </div>

      {/* Edit Call Type Dialog */}
      <Dialog open={!!editingCallType} onOpenChange={(open) => !open && setEditingCallType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Call Type</DialogTitle>
            <DialogDescription>Update the call type name, description, and linked rubric.</DialogDescription>
          </DialogHeader>
          {editingCallType && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Call Type Name</Label>
                <Input
                  value={editingCallType.name}
                  onChange={(e) => setEditingCallType({ ...editingCallType, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingCallType.description || ""}
                  onChange={(e) => setEditingCallType({ ...editingCallType, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Grading Rubric</Label>
                <Select
                  value={editingCallType.rubricId?.toString() || "none"}
                  onValueChange={(v) => setEditingCallType({ ...editingCallType, rubricId: v === "none" ? null : parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rubric" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No rubric</SelectItem>
                    {rubrics.map((r) => (
                      <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingCallType(null)}>Cancel</Button>
                <Button
                  onClick={() => updateMutation.mutate({
                    callTypeId: editingCallType.id,
                    name: editingCallType.name,
                    description: editingCallType.description || undefined,
                    rubricId: editingCallType.rubricId,
                  })}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Call Type Dialog */}
      <Dialog open={showAddCallType} onOpenChange={setShowAddCallType}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Call Type</DialogTitle>
            <DialogDescription>Create a custom call type for your team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Call Type Name</Label>
              <Input
                placeholder="e.g., Setter Call, Dispo Call"
                value={newCallType.name}
                onChange={(e) => setNewCallType({ ...newCallType, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Code (internal identifier)</Label>
              <Input
                placeholder="e.g., setter_call, dispo_call"
                value={newCallType.code}
                onChange={(e) => setNewCallType({ ...newCallType, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="When is this call type used?"
                value={newCallType.description}
                onChange={(e) => setNewCallType({ ...newCallType, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Grading Rubric</Label>
              <Select
                value={newCallType.rubricId || "none"}
                onValueChange={(v) => setNewCallType({ ...newCallType, rubricId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rubric" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No rubric</SelectItem>
                  {rubrics.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddCallType(false)}>Cancel</Button>
              <Button
                onClick={() => addMutation.mutate({
                  name: newCallType.name,
                  code: newCallType.code,
                  description: newCallType.description || undefined,
                  rubricId: newCallType.rubricId ? parseInt(newCallType.rubricId) : undefined,
                })}
                disabled={addMutation.isPending || !newCallType.name || !newCallType.code}
              >
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Add Call Type
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ TERMINOLOGY SECTION ============

function TerminologySection({ terminology, isAdmin, onRefetch }: { 
  terminology: any; isAdmin: boolean; onRefetch: () => void 
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    contactLabel: terminology?.contactLabel || "Seller",
    contactLabelPlural: terminology?.contactLabelPlural || "Sellers",
    dealLabel: terminology?.dealLabel || "Deal",
    dealLabelPlural: terminology?.dealLabelPlural || "Deals",
    assetLabel: terminology?.assetLabel || "Property",
    assetLabelPlural: terminology?.assetLabelPlural || "Properties",
  });

  const updateMutation = trpc.playbook.updateTerminology.useMutation({
    onSuccess: () => { toast.success("Terminology updated"); setEditing(false); onRefetch(); },
    onError: (err) => toast.error(err.message),
  });

  const terminologyItems = [
    { label: "Contact Label", key: "contactLabel", pluralKey: "contactLabelPlural", example: "What you call the people you're contacting" },
    { label: "Deal Label", key: "dealLabel", pluralKey: "dealLabelPlural", example: "What you call a deal or opportunity" },
    { label: "Asset Label", key: "assetLabel", pluralKey: "assetLabelPlural", example: "What you call the property/product/asset" },
  ];

  return (
    <div className="space-y-4">
      <div className="obs-panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="obs-section-title flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Terminology
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Customize the labels used throughout the app to match your team's language.
            </p>
          </div>
          {isAdmin && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Edit className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </div>

        {!editing ? (
          <div className="space-y-3">
            {terminologyItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="font-medium">{(terminology as any)?.[item.key] || "—"}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Plural: {(terminology as any)?.[item.pluralKey] || "—"}
                </Badge>
              </div>
            ))}

            {/* Role Labels */}
            {terminology?.roleLabels && Object.keys(terminology.roleLabels).length > 0 && (
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Role Display Names</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(terminology.roleLabels).map(([code, label]) => (
                    <Badge key={code} variant="outline" className="text-xs">
                      {code}: {label as string}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Call Type Labels */}
            {terminology?.callTypeLabels && Object.keys(terminology.callTypeLabels).length > 0 && (
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Call Type Display Names</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(terminology.callTypeLabels).map(([code, label]) => (
                    <Badge key={code} variant="outline" className="text-xs">
                      {code.replace(/_/g, " ")}: {label as string}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {terminologyItems.map((item) => (
              <div key={item.key} className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{item.label} (Singular)</Label>
                  <Input
                    value={(form as any)[item.key]}
                    onChange={(e) => setForm({ ...form, [item.key]: e.target.value })}
                    placeholder={item.example}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{item.label} (Plural)</Label>
                  <Input
                    value={(form as any)[item.pluralKey]}
                    onChange={(e) => setForm({ ...form, [item.pluralKey]: e.target.value })}
                  />
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button
                onClick={() => updateMutation.mutate(form)}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save Terminology
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
