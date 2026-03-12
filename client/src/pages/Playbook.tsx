import { useState, useRef } from "react";
import { Pencil, Sparkles, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/layout/PageShell";

const GRADE_COLORS: Record<string, string> = {
  emerald: "bg-[var(--g-grade-a)]/20 text-[var(--g-grade-a)]",
  blue: "bg-[var(--g-grade-b)]/20 text-[var(--g-grade-b)]",
  amber: "bg-[var(--g-grade-c)]/20 text-[var(--g-grade-c)]",
  orange: "bg-[var(--g-grade-d)]/20 text-[var(--g-grade-d)]",
  red: "bg-[var(--g-grade-f)]/20 text-[var(--g-grade-f)]",
};

export function Playbook() {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const [termDirty, setTermDirty] = useState(false);
  const terminologyRef = useRef<Record<string, HTMLInputElement | null>>({});
  const { data: software } = trpc.playbook.getSoftware.useQuery();
  const { data: config } = trpc.playbook.getConfig.useQuery();
  const { data: tenant } = trpc.playbook.getTenant.useQuery();
  const { data: industry } = trpc.playbook.getIndustry.useQuery(
    { code: tenant?.industryCode ?? "" },
    { enabled: !!tenant?.industryCode }
  );
  const { data: userPlaybook } = trpc.playbook.getUser.useQuery();
  const { data: roles } = trpc.playbook.getRoles.useQuery();
  const { data: callTypes } = trpc.playbook.getCallTypes.useQuery();
  const { data: rubrics } = trpc.playbook.getRubrics.useQuery();
  const aiChat = trpc.ai.chat.useMutation();
  const saveInstruction = trpc.ai.saveInstruction.useMutation();
  const updateTenant = trpc.playbook.updateTenantConfig.useMutation();
  const upsertRole = trpc.playbook.upsertRole.useMutation();
  const deleteRole = trpc.playbook.deleteRole.useMutation();
  const upsertCallType = trpc.playbook.upsertCallType.useMutation();
  const upsertRubric = trpc.playbook.upsertRubric.useMutation();
  const utils = trpc.useUtils();

  const [roleDialog, setRoleDialog] = useState<{ id?: number; name: string; code: string; description: string } | null>(null);
  const [callTypeDialog, setCallTypeDialog] = useState<{ id?: number; name: string; code: string; description: string } | null>(null);
  const [rubricDialog, setRubricDialog] = useState<{ id?: number; name: string; callType: string; criteria: string; redFlags: string } | null>(null);

  const handleSaveTenant = () => {
    const updatedTerminology: Record<string, string> = {};
    for (const [key, ref] of Object.entries(terminologyRef.current)) {
      if (ref) updatedTerminology[key] = ref.value;
    }
    updateTenant.mutate(
      { terminology: JSON.stringify(updatedTerminology) },
      {
        onSuccess: () => {
          toast.success("Changes saved");
          setTermDirty(false);
          void utils.playbook.getConfig.invalidate();
          void utils.playbook.getTenant.invalidate();
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleAiSend = () => {
    if (!aiInput.trim() || aiChat.isPending) return;
    aiChat.mutate(
      {
        message: aiInput.trim(),
        page: "playbook",
        pageContext: { config, tenant },
      },
      {
        onSuccess: () => setAiInput(""),
      }
    );
  };

  const handleAddInstruction = () => {
    if (!newInstruction.trim() || saveInstruction.isPending) return;
    saveInstruction.mutate(
      { instruction: newInstruction.trim(), category: "general" },
      {
        onSuccess: () => {
          toast.success("Instruction added");
          setNewInstruction("");
          void utils.playbook.getUser.invalidate();
        },
      }
    );
  };

  const handleSaveRole = () => {
    if (!roleDialog || !roleDialog.name.trim() || !roleDialog.code.trim()) return;
    upsertRole.mutate(
      { id: roleDialog.id, name: roleDialog.name.trim(), code: roleDialog.code.trim(), description: roleDialog.description.trim() },
      {
        onSuccess: () => { toast.success("Role saved"); setRoleDialog(null); void utils.playbook.getRoles.invalidate(); void utils.playbook.getConfig.invalidate(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleDeleteRole = (id: number) => {
    deleteRole.mutate({ id }, {
      onSuccess: () => { toast.success("Role deleted"); void utils.playbook.getRoles.invalidate(); void utils.playbook.getConfig.invalidate(); },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleSaveCallType = () => {
    if (!callTypeDialog || !callTypeDialog.name.trim() || !callTypeDialog.code.trim()) return;
    upsertCallType.mutate(
      { id: callTypeDialog.id, name: callTypeDialog.name.trim(), code: callTypeDialog.code.trim(), description: callTypeDialog.description.trim() },
      {
        onSuccess: () => { toast.success("Call type saved"); setCallTypeDialog(null); void utils.playbook.getCallTypes.invalidate(); void utils.playbook.getConfig.invalidate(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleSaveRubric = () => {
    if (!rubricDialog || !rubricDialog.name.trim() || !rubricDialog.callType.trim() || !rubricDialog.criteria.trim()) return;
    upsertRubric.mutate(
      { id: rubricDialog.id, name: rubricDialog.name.trim(), callType: rubricDialog.callType.trim(), criteria: rubricDialog.criteria.trim(), redFlags: rubricDialog.redFlags.trim() || undefined },
      {
        onSuccess: () => { toast.success("Rubric saved"); setRubricDialog(null); void utils.playbook.getRubrics.invalidate(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <PageShell title="Playbook">
      <Tabs defaultValue="software">
        <TabsList>
          <TabsTrigger value="software">Software</TabsTrigger>
          <TabsTrigger value="industry">Industry</TabsTrigger>
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="user">User</TabsTrigger>
        </TabsList>

        <TabsContent value="software" className="mt-4 space-y-4">
          {!software ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
            <>
              <Card className="bg-[var(--g-bg-surface)]">
                <CardHeader className="pb-2">Action Types & Grade Scale</CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {software.actionTypes.map((t) => (
                      <Badge key={t} variant="secondary">{t}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(software.gradeScale).map(([grade, { min, color }]) => (
                      <Badge key={grade} className={cn(GRADE_COLORS[color] ?? "")}>
                        {grade}: {min}+
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[var(--g-bg-surface)]">
                <CardHeader className="pb-2">XP Rewards & Level Titles</CardHeader>
                <CardContent className="space-y-3">
                  <pre className="text-xs overflow-auto rounded bg-[var(--g-bg-inset)] p-3">
                    {JSON.stringify(software.xpRewards, null, 2)}
                  </pre>
                  <div className="flex flex-wrap gap-1">
                    {software.levelTitles.map((t, i) => (
                      <Badge key={i} variant="outline">{t}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[var(--g-bg-surface)]">
                <CardHeader className="pb-2">Algorithm Framework</CardHeader>
                <CardContent>
                  <pre className="text-xs overflow-auto rounded bg-[var(--g-bg-inset)] p-3">
                    {JSON.stringify(software.algorithmFramework, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="industry" className="mt-4 space-y-4">
          {!tenant?.industryCode ? (
            <Card className="bg-[var(--g-bg-surface)]">
              <CardContent className="py-12 text-center text-[var(--g-text-tertiary)]">
                Select your industry in Settings
              </CardContent>
            </Card>
          ) : !industry ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
            <>
              <Card className="bg-[var(--g-bg-surface)]">
                <CardHeader className="pb-2">Terminology</CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(industry.terminology).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-[var(--g-text-tertiary)]">{k}:</span> {v}
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-[var(--g-bg-surface)]">
                <CardHeader className="pb-2">Roles, Stages & Call Types</CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {industry.roles.map((r) => (
                      <Badge key={r.code} style={{ borderColor: r.color }}>{r.name}</Badge>
                    ))}
                    {industry.stages.map((s) => (
                      <Badge key={s.code} variant="outline">{s.name}</Badge>
                    ))}
                    {industry.callTypes.map((c) => (
                      <Badge key={c.code} variant="secondary">{c.name}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[var(--g-bg-surface)]">
                <CardHeader className="pb-2">Rubrics</CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--g-text-tertiary)]">
                    {industry.rubrics?.length ?? 0} rubric(s) defined
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="tenant" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2 items-center">
            {termDirty && <Badge variant="outline" className="text-[var(--g-warning-text)] border-[var(--g-warning-border)] text-xs">Unsaved changes</Badge>}
            <Button variant="outline" onClick={() => setAiOpen(true)}>
              <Sparkles className="size-4 mr-2" />
              Ask AI to Help
            </Button>
            <Button onClick={handleSaveTenant} disabled={updateTenant.isPending}>
              {updateTenant.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              Terminology <Pencil className="size-4 text-[var(--g-text-tertiary)]" />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {config &&
                Object.entries(config.terminology).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <Label className="w-24 shrink-0 text-[var(--g-text-tertiary)]">{k}</Label>
                    <Input
                      defaultValue={v}
                      className="h-8"
                      ref={(el) => { terminologyRef.current[k] = el; }}
                      onChange={() => setTermDirty(true)}
                    />
                  </div>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <span className="flex items-center gap-2">Roles <Pencil className="size-4 text-[var(--g-text-tertiary)]" /></span>
              <Button size="sm" variant="outline" onClick={() => setRoleDialog({ name: "", code: "", description: "" })}>
                <Plus className="size-4 mr-1" />Add
              </Button>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(roles ?? config?.roles ?? []).map((r) => (
                <Badge key={r.code} variant="secondary" className="gap-1 cursor-pointer group"
                  onClick={() => setRoleDialog({ id: "id" in r ? (r as { id: number }).id : undefined, name: r.name, code: r.code, description: ("description" in r ? (r as { description?: string | null }).description : "") ?? "" })}
                >
                  {r.name}
                  {"id" in r && (
                    <button aria-label="Delete role" className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleDeleteRole((r as { id: number }).id); }}>
                      <X className="size-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              Stages <Pencil className="size-4 text-[var(--g-text-tertiary)]" />
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {config?.stages.map((s) => (
                <Badge key={s.code} variant="outline">
                  {s.name}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <span className="flex items-center gap-2">Call Types <Pencil className="size-4 text-[var(--g-text-tertiary)]" /></span>
              <Button size="sm" variant="outline" onClick={() => setCallTypeDialog({ name: "", code: "", description: "" })}>
                <Plus className="size-4 mr-1" />Add
              </Button>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(callTypes ?? []).map((ct) => (
                <Badge key={ct.code} variant="secondary" className="cursor-pointer"
                  onClick={() => setCallTypeDialog({ id: ct.id, name: ct.name, code: ct.code, description: ct.description ?? "" })}
                >
                  {ct.name}
                </Badge>
              ))}
              {!(callTypes?.length) && config?.callTypes.map((ct) => (
                <Badge key={ct.code} variant="outline">{ct.name}</Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <span className="flex items-center gap-2">Rubrics <Pencil className="size-4 text-[var(--g-text-tertiary)]" /></span>
              <Button size="sm" variant="outline" onClick={() => setRubricDialog({ name: "", callType: "", criteria: "", redFlags: "" })}>
                <Plus className="size-4 mr-1" />Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {(rubrics ?? []).map((rb) => (
                <div key={rb.id} className="flex items-center justify-between p-2 rounded-lg border cursor-pointer hover:bg-[var(--g-bg-surface)]"
                  onClick={() => setRubricDialog({ id: rb.id, name: rb.name, callType: rb.callType ?? "", criteria: rb.criteria ?? "", redFlags: rb.redFlags ?? "" })}
                >
                  <div>
                    <p className="text-sm font-medium">{rb.name}</p>
                    <p className="text-xs text-[var(--g-text-tertiary)]">{rb.callType}</p>
                  </div>
                  <Pencil className="size-4 text-[var(--g-text-tertiary)]" />
                </div>
              ))}
              {!(rubrics?.length) && <p className="text-sm text-[var(--g-text-tertiary)]">No custom rubrics — using industry defaults</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">Algorithm Weights</CardHeader>
            <CardContent>
              <pre className="text-xs overflow-auto rounded bg-[var(--g-bg-inset)] p-3">
                {JSON.stringify(config?.algorithm ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="user" className="mt-4 space-y-4">
          {!userPlaybook ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
            <>
              <Card className="bg-[var(--g-bg-surface)]">
                <CardHeader className="pb-2">Strengths & Growth Areas</CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {userPlaybook.strengths.map((s) => (
                      <Badge key={s} className="bg-[var(--g-grade-a)]/20 text-[var(--g-grade-a)]">{s}</Badge>
                    ))}
                    {userPlaybook.growthAreas.map((g) => (
                      <Badge key={g} className="bg-[var(--g-warning-text)]/20 text-[var(--g-warning-text)]">{g}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[var(--g-bg-surface)]">
                <CardHeader className="pb-2">Communication Style & Grade Trend</CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm space-y-1">
                    {Object.entries(userPlaybook.communicationStyle || {}).map(
                      ([k, v]) => v && (
                        <div key={k}><span className="text-[var(--g-text-tertiary)]">{k}:</span> {v}</div>
                      )
                    )}
                  </div>
                  <Badge
                    variant={
                      userPlaybook.gradeTrend === "improving"
                        ? "default"
                        : userPlaybook.gradeTrend === "declining"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {userPlaybook.gradeTrend}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">Custom Instructions</CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(userPlaybook.instructions || {}).map(([k, v]) => (
                    <div key={k} className="text-sm">
                      <span className="font-medium text-[var(--g-text-tertiary)]">{k}:</span> {v}
                    </div>
                  ))}
                  <Separator />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add instruction..."
                      value={newInstruction}
                      onChange={(e) => setNewInstruction(e.target.value)}
                    />
                    <Button onClick={handleAddInstruction} disabled={saveInstruction.isPending}>
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ask AI to Help</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Describe what you want to change..."
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            rows={4}
          />
          {aiChat.data?.response && (
            <div className="rounded-lg bg-[var(--g-bg-inset)] p-3 text-sm text-[var(--g-text-secondary)]">{aiChat.data.response}</div>
          )}
          <DialogFooter>
            <Button onClick={handleAiSend} disabled={aiChat.isPending}>
              {aiChat.isPending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {roleDialog && (
        <Dialog open onOpenChange={(o) => !o && setRoleDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{roleDialog.id ? "Edit" : "Add"} Role</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <Input placeholder="Name" value={roleDialog.name} onChange={(e) => setRoleDialog({ ...roleDialog, name: e.target.value })} />
              <Input placeholder="Code (e.g. acquisitions_manager)" value={roleDialog.code} onChange={(e) => setRoleDialog({ ...roleDialog, code: e.target.value })} />
              <Input placeholder="Description" value={roleDialog.description} onChange={(e) => setRoleDialog({ ...roleDialog, description: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleDialog(null)}>Cancel</Button>
              <Button onClick={handleSaveRole} disabled={upsertRole.isPending}>{upsertRole.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {callTypeDialog && (
        <Dialog open onOpenChange={(o) => !o && setCallTypeDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{callTypeDialog.id ? "Edit" : "Add"} Call Type</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <Input placeholder="Name" value={callTypeDialog.name} onChange={(e) => setCallTypeDialog({ ...callTypeDialog, name: e.target.value })} />
              <Input placeholder="Code (e.g. qualification)" value={callTypeDialog.code} onChange={(e) => setCallTypeDialog({ ...callTypeDialog, code: e.target.value })} />
              <Input placeholder="Description" value={callTypeDialog.description} onChange={(e) => setCallTypeDialog({ ...callTypeDialog, description: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCallTypeDialog(null)}>Cancel</Button>
              <Button onClick={handleSaveCallType} disabled={upsertCallType.isPending}>{upsertCallType.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {rubricDialog && (
        <Dialog open onOpenChange={(o) => !o && setRubricDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{rubricDialog.id ? "Edit" : "Add"} Rubric</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <Input placeholder="Rubric name" value={rubricDialog.name} onChange={(e) => setRubricDialog({ ...rubricDialog, name: e.target.value })} />
              <Input placeholder="Call type code (e.g. qualification)" value={rubricDialog.callType} onChange={(e) => setRubricDialog({ ...rubricDialog, callType: e.target.value })} />
              <div>
                <Label className="text-sm text-[var(--g-text-tertiary)] mb-1 block">Criteria (JSON array of name/maxPoints/description)</Label>
                <Textarea rows={6} value={rubricDialog.criteria} onChange={(e) => setRubricDialog({ ...rubricDialog, criteria: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm text-[var(--g-text-tertiary)] mb-1 block">Red flags (comma-separated)</Label>
                <Input value={rubricDialog.redFlags} onChange={(e) => setRubricDialog({ ...rubricDialog, redFlags: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRubricDialog(null)}>Cancel</Button>
              <Button onClick={handleSaveRubric} disabled={upsertRubric.isPending}>{upsertRubric.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
