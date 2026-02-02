import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  BookOpen, 
  Plus, 
  FileText, 
  Edit, 
  Trash2, 
  Users,
  Target,
  MessageSquare,
  Lightbulb,
  CheckCircle,
  AlertTriangle,
  Scale,
  Sparkles,
  RefreshCw,
  Bot,
  Trophy,
  Calendar,
  Check
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "script", label: "Script", icon: FileText },
  { value: "objection_handling", label: "Objection Handling", icon: MessageSquare },
  { value: "methodology", label: "Methodology", icon: Target },
  { value: "best_practices", label: "Best Practices", icon: Lightbulb },
  { value: "examples", label: "Examples", icon: CheckCircle },
  { value: "other", label: "Other", icon: BookOpen },
];

const APPLICABLE_TO = [
  { value: "all", label: "All Team Members" },
  { value: "lead_manager", label: "Lead Managers (Chris & Daniel)" },
  { value: "acquisition_manager", label: "Acquisition Manager (Kyle)" },
];

function getCategoryIcon(category: string) {
  const cat = CATEGORIES.find(c => c.value === category);
  return cat?.icon || BookOpen;
}

function getCategoryLabel(category: string) {
  const cat = CATEGORIES.find(c => c.value === category);
  return cat?.label || category;
}

function getApplicableLabel(applicableTo: string) {
  const app = APPLICABLE_TO.find(a => a.value === applicableTo);
  return app?.label || applicableTo;
}

// ============ TEAM TRAINING COMPONENTS ============

type ItemType = "skill" | "issue" | "win" | "agenda";
type Priority = "low" | "medium" | "high" | "urgent";

interface TrainingItem {
  id: number;
  itemType: ItemType;
  title: string;
  description: string | null;
  targetBehavior: string | null;
  priority: Priority | null;
  teamMemberName: string | null;
  teamMemberId: number | null;
  status: string | null;
  sortOrder: number | null;
  isAiGenerated: string | null;
  createdAt: Date;
}

const priorityColors: Record<Priority, string> = {
  low: "bg-slate-500",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

const priorityLabels: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function AddTeamItemDialog({ itemType, onSuccess }: { itemType: ItemType; onSuccess: () => void; }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetBehavior, setTargetBehavior] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [teamMemberName, setTeamMemberName] = useState("");

  const { data: teamMembers } = trpc.team.list.useQuery();
  const createMutation = trpc.teamTraining.create.useMutation({
    onSuccess: () => {
      toast.success(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} added successfully`);
      setOpen(false);
      setTitle(""); setDescription(""); setTargetBehavior(""); setPriority("medium"); setTeamMemberName("");
      onSuccess();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    const selectedMember = teamMembers?.find(m => m.name === teamMemberName);
    createMutation.mutate({
      itemType, title: title.trim(), description: description.trim() || undefined,
      targetBehavior: targetBehavior.trim() || undefined, priority,
      teamMemberName: teamMemberName || undefined, teamMemberId: selectedMember?.id,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Add Manual</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {itemType === "skill" ? "Add Long-Term Skill" : itemType === "issue" ? "Add Issue to Address" : itemType === "win" ? "Add Win to Celebrate" : "Add Agenda Item"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter title..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add more details..." rows={3} />
          </div>
          {itemType === "skill" && (
            <div className="space-y-2">
              <Label htmlFor="targetBehavior">Target Behavior</Label>
              <Textarea id="targetBehavior" value={targetBehavior} onChange={(e) => setTargetBehavior(e.target.value)} placeholder="What does success look like?" rows={2} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Team Member</Label>
              <Select value={teamMemberName} onValueChange={setTeamMemberName}>
                <SelectTrigger><SelectValue placeholder="Whole team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Whole Team</SelectItem>
                  {teamMembers?.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>{createMutation.isPending ? "Adding..." : "Add Item"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamItemCard({ item, onComplete, onDelete, showPriority = true }: { item: TrainingItem; onComplete: () => void; onDelete: () => void; showPriority?: boolean; }) {
  const completeMutation = trpc.teamTraining.complete.useMutation({ onSuccess: () => { toast.success("Item marked as complete"); onComplete(); } });
  const deleteMutation = trpc.teamTraining.delete.useMutation({ onSuccess: () => { toast.success("Item deleted"); onDelete(); } });
  const isAiGenerated = item.isAiGenerated === "true";

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border bg-card ${isAiGenerated ? "border-l-4 border-l-purple-500" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h4 className="font-medium">{item.title}</h4>
          {isAiGenerated && <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs"><Bot className="h-3 w-3 mr-1" />AI Generated</Badge>}
          {showPriority && item.priority && <Badge variant="secondary" className={`${priorityColors[item.priority]} text-white text-xs`}>{priorityLabels[item.priority]}</Badge>}
          {item.teamMemberName && <Badge variant="outline" className="text-xs">{item.teamMemberName}</Badge>}
        </div>
        {item.description && <p className="text-sm text-muted-foreground mb-2">{item.description}</p>}
        {item.targetBehavior && <div className="text-sm bg-muted/50 p-2 rounded mt-2"><span className="font-medium text-xs text-muted-foreground">Target: </span>{item.targetBehavior}</div>}
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => completeMutation.mutate({ id: item.id })} disabled={completeMutation.isPending}><Check className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => deleteMutation.mutate({ id: item.id })} disabled={deleteMutation.isPending}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function GenerateInsightsBtn({ onSuccess }: { onSuccess: () => void }) {
  const generateMutation = trpc.teamTraining.generateInsights.useMutation({
    onSuccess: (data) => {
      const total = data.generated.issues + data.generated.wins + data.generated.skills + data.generated.agenda;
      toast.success(`Generated ${total} insights from recent calls`);
      onSuccess();
    },
    onError: (error) => toast.error("Failed to generate insights: " + error.message),
  });

  return (
    <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
      {generateMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Analyzing...</> : <><Sparkles className="h-4 w-4 mr-2" />Generate AI Insights</>}
    </Button>
  );
}

function TeamSkillsSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ itemType: "skill", status: "active" });
  const handleRefresh = () => utils.teamTraining.list.invalidate();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600"><Target className="h-5 w-5" /></div>
          <div><CardTitle className="text-lg">Long-Term Skills</CardTitle><CardDescription>Skills the team is actively developing</CardDescription></div>
        </div>
        <AddTeamItemDialog itemType="skill" onSuccess={handleRefresh} />
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div> : items && items.length > 0 ? (
          <div className="space-y-3">{items.map((item) => <TeamItemCard key={item.id} item={item as TrainingItem} onComplete={handleRefresh} onDelete={handleRefresh} />)}</div>
        ) : <div className="text-center py-8 text-muted-foreground"><Target className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No skills being tracked</p></div>}
      </CardContent>
    </Card>
  );
}

function TeamIssuesSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ itemType: "issue", status: "active" });
  const handleRefresh = () => utils.teamTraining.list.invalidate();
  const sortedItems = items?.sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (priorityOrder[a.priority as Priority] || 3) - (priorityOrder[b.priority as Priority] || 3);
  });

  return (
    <Card className="border-red-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></div>
          <div><CardTitle className="text-lg">Issues to Address</CardTitle><CardDescription>Urgent incompetencies from call analysis</CardDescription></div>
        </div>
        <AddTeamItemDialog itemType="issue" onSuccess={handleRefresh} />
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : sortedItems && sortedItems.length > 0 ? (
          <div className="space-y-3">{sortedItems.map((item) => <TeamItemCard key={item.id} item={item as TrainingItem} onComplete={handleRefresh} onDelete={handleRefresh} />)}</div>
        ) : <div className="text-center py-8 text-muted-foreground"><AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No issues to address</p></div>}
      </CardContent>
    </Card>
  );
}

function TeamWinsSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ itemType: "win", status: "active" });
  const handleRefresh = () => utils.teamTraining.list.invalidate();

  return (
    <Card className="border-green-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 text-green-600"><Trophy className="h-5 w-5" /></div>
          <div><CardTitle className="text-lg">Wins to Celebrate</CardTitle><CardDescription>Small victories to recognize</CardDescription></div>
        </div>
        <AddTeamItemDialog itemType="win" onSuccess={handleRefresh} />
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div> : items && items.length > 0 ? (
          <div className="space-y-3">{items.map((item) => <TeamItemCard key={item.id} item={item as TrainingItem} onComplete={handleRefresh} onDelete={handleRefresh} showPriority={false} />)}</div>
        ) : <div className="text-center py-8 text-muted-foreground"><Trophy className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No wins recorded yet</p></div>}
      </CardContent>
    </Card>
  );
}

function TeamAgendaSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ itemType: "agenda", status: "active" });
  const handleRefresh = () => utils.teamTraining.list.invalidate();
  const completeMutation = trpc.teamTraining.complete.useMutation({ onSuccess: () => { toast.success("Agenda item completed"); handleRefresh(); } });
  const sortedItems = items?.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  return (
    <Card className="border-purple-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-600"><Calendar className="h-5 w-5" /></div>
          <div><CardTitle className="text-lg">Weekly Team Call Agenda</CardTitle><CardDescription>AI-suggested topics based on call analysis</CardDescription></div>
        </div>
        <AddTeamItemDialog itemType="agenda" onSuccess={handleRefresh} />
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div> : sortedItems && sortedItems.length > 0 ? (
          <div className="space-y-2">
            {sortedItems.map((item, index) => (
              <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${item.isAiGenerated === "true" ? "border-l-4 border-l-purple-500" : ""}`}>
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 font-bold text-sm">{index + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{item.title}</h4>
                    {item.isAiGenerated === "true" && <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs"><Bot className="h-3 w-3 mr-1" />AI</Badge>}
                  </div>
                  {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => completeMutation.mutate({ id: item.id })} disabled={completeMutation.isPending}><Check className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        ) : <div className="text-center py-8 text-muted-foreground"><Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No agenda items</p></div>}
      </CardContent>
    </Card>
  );
}

function TeamTrainingContent() {
  const utils = trpc.useUtils();
  const handleInsightsGenerated = () => utils.teamTraining.list.invalidate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4 flex-1 mr-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-100 text-purple-600"><Sparkles className="h-5 w-5" /></div>
            <div>
              <h3 className="font-medium text-purple-900">AI-Powered Insights</h3>
              <p className="text-sm text-purple-700 mt-1">Click "Generate AI Insights" to analyze your team's recent calls and automatically identify issues, wins, skills to develop, and meeting agenda items.</p>
            </div>
          </div>
        </div>
        <GenerateInsightsBtn onSuccess={handleInsightsGenerated} />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agenda">Meeting Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <TeamIssuesSection />
            <TeamWinsSection />
          </div>
          <TeamSkillsSection />
        </TabsContent>

        <TabsContent value="agenda">
          <TeamAgendaSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Training() {
  const [mainTab, setMainTab] = useState("team");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    content: "",
    category: "other" as string,
    applicableTo: "all" as string,
  });

  const { data: materials, isLoading, refetch } = trpc.training.list.useQuery({});
  const { data: rubrics, isLoading: rubricsLoading } = trpc.rubrics.getAll.useQuery();
  const { data: qualificationContext } = trpc.rubrics.getContext.useQuery({ callType: "qualification" });
  const { data: offerContext } = trpc.rubrics.getContext.useQuery({ callType: "offer" });

  const createMutation = trpc.training.create.useMutation({
    onSuccess: () => {
      toast.success("Training material added successfully");
      setIsAddDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to add training material: " + error.message);
    },
  });
  const updateMutation = trpc.training.update.useMutation({
    onSuccess: () => {
      toast.success("Training material updated successfully");
      setEditingMaterial(null);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to update training material: " + error.message);
    },
  });
  const deleteMutation = trpc.training.delete.useMutation({
    onSuccess: () => {
      toast.success("Training material deleted");
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to delete training material: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      content: "",
      category: "other",
      applicableTo: "all",
    });
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.content.trim()) {
      toast.error("Content is required");
      return;
    }

    if (editingMaterial) {
      updateMutation.mutate({
        id: editingMaterial.id,
        ...formData,
        category: formData.category as any,
        applicableTo: formData.applicableTo as any,
      });
    } else {
      createMutation.mutate({
        ...formData,
        category: formData.category as any,
        applicableTo: formData.applicableTo as any,
      });
    }
  };

  const openEditDialog = (material: any) => {
    setEditingMaterial(material);
    setFormData({
      title: material.title,
      description: material.description || "",
      content: material.content || "",
      category: material.category || "other",
      applicableTo: material.applicableTo || "all",
    });
  };

  const groupedMaterials = materials?.reduce((acc, material) => {
    const category = material.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(material);
    return acc;
  }, {} as Record<string, typeof materials>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Training & Methodology</h1>
          <p className="text-muted-foreground">
            Manage training materials and view grading criteria
          </p>
        </div>
        {mainTab === "materials" && (
          <Dialog open={isAddDialogOpen || !!editingMaterial} onOpenChange={(open) => {
            if (!open) {
              setIsAddDialogOpen(false);
              setEditingMaterial(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Material
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingMaterial ? "Edit Training Material" : "Add Training Material"}
                </DialogTitle>
                <DialogDescription>
                  Add training content that will be used to evaluate and grade calls.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Script Mastery - Introduction"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Brief description of this material"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Applies To</Label>
                    <Select
                      value={formData.applicableTo}
                      onValueChange={(value) => setFormData({ ...formData, applicableTo: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {APPLICABLE_TO.map((app) => (
                          <SelectItem key={app.value} value={app.value}>
                            {app.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Content *</Label>
                  <Textarea
                    id="content"
                    placeholder="Paste your training content here..."
                    className="min-h-[300px] font-mono text-sm"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setIsAddDialogOpen(false);
                  setEditingMaterial(null);
                  resetForm();
                }}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Material"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Main Tabs - Team Training, Materials, Methodology */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Team Training
          </TabsTrigger>
          <TabsTrigger value="materials" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Materials
          </TabsTrigger>
          <TabsTrigger value="methodology" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Methodology
          </TabsTrigger>
        </TabsList>

        {/* Team Training Tab */}
        <TabsContent value="team" className="space-y-6">
          <TeamTrainingContent />
        </TabsContent>

        {/* Training Materials Tab */}
        <TabsContent value="materials" className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : materials?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Training Materials Yet</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Add your training scripts, methodology, and best practices to help the AI 
                  grade calls according to your standards.
                </p>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Material
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="all" className="space-y-4">
              <TabsList>
                <TabsTrigger value="all">All ({materials?.length || 0})</TabsTrigger>
                {CATEGORIES.map((cat) => {
                  const count = groupedMaterials?.[cat.value]?.length || 0;
                  if (count === 0) return null;
                  return (
                    <TabsTrigger key={cat.value} value={cat.value}>
                      {cat.label} ({count})
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value="all" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {materials?.map((material) => (
                    <MaterialCard
                      key={material.id}
                      material={material}
                      onEdit={() => openEditDialog(material)}
                      onDelete={() => deleteMutation.mutate({ id: material.id })}
                    />
                  ))}
                </div>
              </TabsContent>

              {CATEGORIES.map((cat) => (
                <TabsContent key={cat.value} value={cat.value} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {groupedMaterials?.[cat.value]?.map((material) => (
                      <MaterialCard
                        key={material.id}
                        material={material}
                        onEdit={() => openEditDialog(material)}
                        onDelete={() => deleteMutation.mutate({ id: material.id })}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </TabsContent>

        {/* Methodology Tab */}
        <TabsContent value="methodology" className="space-y-6">
          {rubricsLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-48" />
              <Skeleton className="h-96" />
            </div>
          ) : (
            <Tabs defaultValue="lead_manager" className="space-y-6">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="lead_manager" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Lead Manager
                </TabsTrigger>
                <TabsTrigger value="acquisition_manager" className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Acquisition Manager
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lead_manager" className="space-y-6">
                <RubricDisplay 
                  rubric={rubrics?.leadManager} 
                  context={qualificationContext}
                  title="Lead Manager Rubric"
                  description="Used for qualification calls by Chris and Daniel"
                />
              </TabsContent>

              <TabsContent value="acquisition_manager" className="space-y-6">
                <RubricDisplay 
                  rubric={rubrics?.acquisitionManager} 
                  context={offerContext}
                  title="Acquisition Manager Rubric"
                  description="Used for offer calls by Kyle"
                />
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MaterialCard({ 
  material, 
  onEdit, 
  onDelete 
}: { 
  material: any; 
  onEdit: () => void; 
  onDelete: () => void;
}) {
  const Icon = getCategoryIcon(material.category);
  
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{material.title}</CardTitle>
              <CardDescription className="text-xs">
                {getCategoryLabel(material.category)}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {material.description && (
          <p className="text-sm text-muted-foreground mb-3">{material.description}</p>
        )}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="text-xs">
            <Users className="h-3 w-3 mr-1" />
            {getApplicableLabel(material.applicableTo)}
          </Badge>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 flex-1 max-h-32 overflow-hidden">
          <p className="text-xs text-muted-foreground line-clamp-5 whitespace-pre-wrap">
            {material.content?.substring(0, 300)}
            {material.content?.length > 300 && "..."}
          </p>
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            {new Date(material.createdAt).toLocaleDateString()}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Training Material</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{material.title}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RubricDisplay({ 
  rubric, 
  context,
  title, 
  description 
}: { 
  rubric: any; 
  context: any;
  title: string; 
  description: string;
}) {
  if (!rubric) return null;

  const totalPoints = rubric.criteria?.reduce((sum: number, c: any) => sum + c.maxPoints, 0) || 100;

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{rubric.criteria?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Grading Criteria</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{totalPoints}</p>
              <p className="text-sm text-muted-foreground">Total Points</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{context?.trainingMaterials?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Training Materials</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Criteria */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Grading Criteria
          </CardTitle>
          <CardDescription>
            Each call is evaluated on these criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {rubric.criteria?.map((criterion: any, index: number) => (
              <div key={index} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium">{criterion.name}</h4>
                  <Badge variant="secondary">{criterion.maxPoints} pts</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{criterion.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Red Flags */}
      {rubric.redFlags && rubric.redFlags.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Red Flags
            </CardTitle>
            <CardDescription>
              Issues that will be flagged during grading
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {rubric.redFlags.map((flag: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-red-500 mt-0.5">•</span>
                  {flag}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
