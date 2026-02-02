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
  Scale
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

export default function Training() {
  const [mainTab, setMainTab] = useState("materials");
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

      {/* Main Tabs - Materials vs Methodology */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="materials" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Training Materials
          </TabsTrigger>
          <TabsTrigger value="methodology" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Methodology
          </TabsTrigger>
        </TabsList>

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
