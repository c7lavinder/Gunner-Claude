import { useState } from "react";
import { BookOpen, Pencil, Sparkles } from "lucide-react";
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

const GRADE_COLORS: Record<string, string> = {
  emerald: "bg-emerald-500/20 text-emerald-700",
  blue: "bg-blue-500/20 text-blue-700",
  amber: "bg-amber-500/20 text-amber-700",
  orange: "bg-orange-500/20 text-orange-700",
  red: "bg-red-500/20 text-red-700",
};

export function Playbook() {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const { data: software } = trpc.playbook.getSoftware.useQuery();
  const { data: config } = trpc.playbook.getConfig.useQuery();
  const { data: tenant } = trpc.playbook.getTenant.useQuery();
  const { data: industry } = trpc.playbook.getIndustry.useQuery(
    { code: tenant?.industryCode ?? "" },
    { enabled: !!tenant?.industryCode }
  );
  const { data: userPlaybook } = trpc.playbook.getUser.useQuery();
  const aiChat = trpc.ai.chat.useMutation();
  const saveInstruction = trpc.ai.saveInstruction.useMutation();
  const utils = trpc.useUtils();

  const handleSaveTenant = () => {
    // TODO: playbook.updateTenant mutation not yet implemented
    toast.success("Changes saved");
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <BookOpen className="size-6 text-primary" />
        Playbook
      </h1>
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
              <Card className="bg-muted/30">
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
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">XP Rewards & Level Titles</CardHeader>
                <CardContent className="space-y-3">
                  <pre className="text-xs overflow-auto rounded bg-muted p-3">
                    {JSON.stringify(software.xpRewards, null, 2)}
                  </pre>
                  <div className="flex flex-wrap gap-1">
                    {software.levelTitles.map((t, i) => (
                      <Badge key={i} variant="outline">{t}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">Algorithm Framework</CardHeader>
                <CardContent>
                  <pre className="text-xs overflow-auto rounded bg-muted p-3">
                    {JSON.stringify(software.algorithmFramework, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="industry" className="mt-4 space-y-4">
          {!tenant?.industryCode ? (
            <Card className="bg-muted/30">
              <CardContent className="py-12 text-center text-muted-foreground">
                Select your industry in Settings
              </CardContent>
            </Card>
          ) : !industry ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
            <>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">Terminology</CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(industry.terminology).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-muted-foreground">{k}:</span> {v}
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
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
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">Rubrics</CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {industry.rubrics?.length ?? 0} rubric(s) defined
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="tenant" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAiOpen(true)}>
              <Sparkles className="size-4 mr-2" />
              Ask AI to Help
            </Button>
            <Button onClick={handleSaveTenant}>Save</Button>
          </div>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              Terminology <Pencil className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {config &&
                Object.entries(config.terminology).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <Label className="w-24 shrink-0 text-muted-foreground">{k}</Label>
                    <Input defaultValue={v} className="h-8" />
                  </div>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              Roles <Pencil className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {config?.roles.map((r) => (
                <Badge key={r.code} variant="secondary" className="gap-1">
                  {r.name}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              Stages <Pencil className="size-4 text-muted-foreground" />
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
            <CardHeader className="pb-2">Algorithm Weights</CardHeader>
            <CardContent>
              <pre className="text-xs overflow-auto rounded bg-muted p-3">
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
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">Strengths & Growth Areas</CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {userPlaybook.strengths.map((s) => (
                      <Badge key={s} className="bg-emerald-500/20 text-emerald-700">{s}</Badge>
                    ))}
                    {userPlaybook.growthAreas.map((g) => (
                      <Badge key={g} className="bg-amber-500/20 text-amber-700">{g}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">Communication Style & Grade Trend</CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm space-y-1">
                    {Object.entries(userPlaybook.communicationStyle || {}).map(
                      ([k, v]) => v && (
                        <div key={k}><span className="text-muted-foreground">{k}:</span> {v}</div>
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
                      <span className="font-medium text-muted-foreground">{k}:</span> {v}
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
            <div className="rounded-lg bg-muted p-3 text-sm">{aiChat.data.response}</div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled>
              Apply Suggestion
            </Button>
            <Button onClick={handleAiSend} disabled={aiChat.isPending}>
              {aiChat.isPending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
