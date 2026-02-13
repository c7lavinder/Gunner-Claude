import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  Scale, 
  Plus, 
  Edit, 
  Trash2, 
  Users,
  ArrowUpDown,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const APPLICABLE_TO = [
  { value: "all", label: "All Team Members" },
  { value: "lead_manager", label: "Lead Managers" },
  { value: "acquisition_manager", label: "Acquisition Managers" },
  { value: "lead_generator", label: "Lead Generators" },
];

function getApplicableLabel(applicableTo: string) {
  const app = APPLICABLE_TO.find(a => a.value === applicableTo);
  return app?.label || applicableTo;
}

export default function GradingRules() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    ruleText: "",
    priority: 0,
    applicableTo: "all" as string,
  });

  const { data: rules, isLoading, refetch } = trpc.rules.list.useQuery({});
  const createMutation = trpc.rules.create.useMutation({
    onSuccess: () => {
      toast.success("Grading rule added successfully");
      setIsAddDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to add grading rule: " + error.message);
    },
  });
  const updateMutation = trpc.rules.update.useMutation({
    onSuccess: () => {
      toast.success("Grading rule updated successfully");
      setEditingRule(null);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to update grading rule: " + error.message);
    },
  });
  const deleteMutation = trpc.rules.delete.useMutation({
    onSuccess: () => {
      toast.success("Grading rule deleted");
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to delete grading rule: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      ruleText: "",
      priority: 0,
      applicableTo: "all",
    });
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.ruleText.trim()) {
      toast.error("Rule text is required");
      return;
    }

    if (editingRule) {
      updateMutation.mutate({
        id: editingRule.id,
        ...formData,
        applicableTo: formData.applicableTo as any,
      });
    } else {
      createMutation.mutate({
        ...formData,
        applicableTo: formData.applicableTo as any,
      });
    }
  };

  const openEditDialog = (rule: any) => {
    setEditingRule(rule);
    setFormData({
      title: rule.title,
      description: rule.description || "",
      ruleText: rule.ruleText || "",
      priority: rule.priority || 0,
      applicableTo: rule.applicableTo || "all",
    });
  };

  const toggleRuleActive = (rule: any) => {
    updateMutation.mutate({
      id: rule.id,
      isActive: rule.isActive === "true" ? "false" : "true",
    });
  };

  const sortedRules = rules?.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Grading Rules</h1>
          <p className="text-muted-foreground">
            Custom rules that override or supplement default grading criteria
          </p>
        </div>
        <Dialog open={isAddDialogOpen || !!editingRule} onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingRule(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingRule ? "Edit Grading Rule" : "Add Grading Rule"}
              </DialogTitle>
              <DialogDescription>
                Create a custom rule that the AI will follow when grading calls.
                Higher priority rules take precedence.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Rule Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Always mention price anchoring"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Brief description of what this rule does"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher priority rules are applied first (0-100)
                  </p>
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
                <Label htmlFor="ruleText">Rule Instructions *</Label>
                <Textarea
                  id="ruleText"
                  placeholder="Write the rule in natural language. For example: 'Deduct 10 points if the rep does not ask about the seller's timeline within the first 2 minutes of the call.'"
                  className="min-h-[150px]"
                  value={formData.ruleText}
                  onChange={(e) => setFormData({ ...formData, ruleText: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Write clear instructions for the AI. Be specific about what to look for and how it should affect the grade.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddDialogOpen(false);
                setEditingRule(null);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Rule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="flex items-start gap-4 pt-6">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100">How Grading Rules Work</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Custom rules are applied on top of the base grading rubrics. They can add specific requirements,
              adjust scoring for particular behaviors, or flag issues that are important to your team.
              Rules with higher priority are considered first.
            </p>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : sortedRules?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Scale className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Custom Rules Yet</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Add custom grading rules to fine-tune how calls are evaluated.
              Rules can add specific requirements or adjust scoring criteria.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedRules?.map((rule) => (
            <Card key={rule.id} className={rule.isActive === "false" ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {rule.priority || 0}
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {rule.title}
                        {rule.isActive === "false" && (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </CardTitle>
                      {rule.description && (
                        <CardDescription>{rule.description}</CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.isActive === "true"}
                      onCheckedChange={() => toggleRuleActive(rule)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4 mb-4">
                  <p className="text-sm whitespace-pre-wrap">{rule.ruleText}</p>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">
                    <Users className="h-3 w-3 mr-1" />
                    {getApplicableLabel(rule.applicableTo || "all")}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(rule)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Grading Rule</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{rule.title}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteMutation.mutate({ id: rule.id })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
