import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Target, AlertTriangle, Trophy, Calendar, Plus, Check, Trash2, 
  ChevronUp, ChevronDown, GripVertical, Users, Clock
} from "lucide-react";
import { toast } from "sonner";

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

function AddItemDialog({ 
  itemType, 
  onSuccess 
}: { 
  itemType: ItemType; 
  onSuccess: () => void;
}) {
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
      resetForm();
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setTargetBehavior("");
    setPriority("medium");
    setTeamMemberName("");
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    const selectedMember = teamMembers?.find(m => m.name === teamMemberName);

    createMutation.mutate({
      itemType,
      title: title.trim(),
      description: description.trim() || undefined,
      targetBehavior: targetBehavior.trim() || undefined,
      priority,
      teamMemberName: teamMemberName || undefined,
      teamMemberId: selectedMember?.id,
    });
  };

  const getDialogTitle = () => {
    switch (itemType) {
      case "skill": return "Add Long-Term Skill";
      case "issue": return "Add Issue to Address";
      case "win": return "Add Win to Celebrate";
      case "agenda": return "Add Agenda Item";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>
            {itemType === "skill" && "Add a long-term skill the team is working on developing."}
            {itemType === "issue" && "Add an urgent issue or incompetency that needs to be addressed."}
            {itemType === "win" && "Add a small win to celebrate with the team."}
            {itemType === "agenda" && "Add an item to the weekly team call agenda."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                itemType === "skill" ? "e.g., Price Anchoring Technique" :
                itemType === "issue" ? "e.g., Giving price before seller" :
                itemType === "win" ? "e.g., Chris closed 3 appointments today" :
                "e.g., Review last week's call grades"
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
            />
          </div>

          {itemType === "skill" && (
            <div className="space-y-2">
              <Label htmlFor="targetBehavior">Target Behavior</Label>
              <Textarea
                id="targetBehavior"
                value={targetBehavior}
                onChange={(e) => setTargetBehavior(e.target.value)}
                placeholder="What does success look like? What should they be doing?"
                rows={2}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Team Member (Optional)</Label>
              <Select value={teamMemberName} onValueChange={setTeamMemberName}>
                <SelectTrigger>
                  <SelectValue placeholder="Whole team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Whole Team</SelectItem>
                  {teamMembers?.map((member) => (
                    <SelectItem key={member.id} value={member.name}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding..." : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrainingItemCard({ 
  item, 
  onComplete, 
  onDelete,
  showPriority = true,
}: { 
  item: TrainingItem; 
  onComplete: () => void;
  onDelete: () => void;
  showPriority?: boolean;
}) {
  const completeMutation = trpc.teamTraining.complete.useMutation({
    onSuccess: () => {
      toast.success("Item marked as complete");
      onComplete();
    },
  });

  const deleteMutation = trpc.teamTraining.delete.useMutation({
    onSuccess: () => {
      toast.success("Item deleted");
      onDelete();
    },
  });

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium">{item.title}</h4>
          {showPriority && item.priority && (
            <Badge variant="secondary" className={`${priorityColors[item.priority]} text-white text-xs`}>
              {priorityLabels[item.priority]}
            </Badge>
          )}
          {item.teamMemberName && (
            <Badge variant="outline" className="text-xs">
              {item.teamMemberName}
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
        )}
        {item.targetBehavior && (
          <div className="text-sm bg-muted/50 p-2 rounded mt-2">
            <span className="font-medium text-xs text-muted-foreground">Target: </span>
            {item.targetBehavior}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={() => completeMutation.mutate({ id: item.id })}
          disabled={completeMutation.isPending}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => deleteMutation.mutate({ id: item.id })}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SkillsSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ 
    itemType: "skill", 
    status: "active" 
  });

  const handleRefresh = () => {
    utils.teamTraining.list.invalidate();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Long-Term Skills</CardTitle>
            <CardDescription>Skills the team is actively developing</CardDescription>
          </div>
        </div>
        <AddItemDialog itemType="skill" onSuccess={handleRefresh} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : items && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => (
              <TrainingItemCard 
                key={item.id} 
                item={item as TrainingItem}
                onComplete={handleRefresh}
                onDelete={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No skills being tracked</p>
            <p className="text-sm">Add skills your team is working on</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IssuesSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ 
    itemType: "issue", 
    status: "active" 
  });

  const handleRefresh = () => {
    utils.teamTraining.list.invalidate();
  };

  // Sort by priority (urgent first)
  const sortedItems = items?.sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (priorityOrder[a.priority as Priority] || 3) - (priorityOrder[b.priority as Priority] || 3);
  });

  return (
    <Card className="border-red-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Issues to Address</CardTitle>
            <CardDescription>Urgent incompetencies from call analysis</CardDescription>
          </div>
        </div>
        <AddItemDialog itemType="issue" onSuccess={handleRefresh} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : sortedItems && sortedItems.length > 0 ? (
          <div className="space-y-3">
            {sortedItems.map((item) => (
              <TrainingItemCard 
                key={item.id} 
                item={item as TrainingItem}
                onComplete={handleRefresh}
                onDelete={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No issues to address</p>
            <p className="text-sm">Great job! Keep up the good work</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WinsSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ 
    itemType: "win", 
    status: "active" 
  });

  const handleRefresh = () => {
    utils.teamTraining.list.invalidate();
  };

  return (
    <Card className="border-green-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 text-green-600">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Wins to Celebrate</CardTitle>
            <CardDescription>Small victories to recognize</CardDescription>
          </div>
        </div>
        <AddItemDialog itemType="win" onSuccess={handleRefresh} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : items && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => (
              <TrainingItemCard 
                key={item.id} 
                item={item as TrainingItem}
                onComplete={handleRefresh}
                onDelete={handleRefresh}
                showPriority={false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No wins recorded yet</p>
            <p className="text-sm">Add wins to celebrate with the team</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgendaSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ 
    itemType: "agenda", 
    status: "active" 
  });

  const handleRefresh = () => {
    utils.teamTraining.list.invalidate();
  };

  // Sort by sortOrder
  const sortedItems = items?.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  return (
    <Card className="border-purple-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Weekly Team Call Agenda</CardTitle>
            <CardDescription>Items to cover in the next team meeting</CardDescription>
          </div>
        </div>
        <AddItemDialog itemType="agenda" onSuccess={handleRefresh} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : sortedItems && sortedItems.length > 0 ? (
          <div className="space-y-2">
            {sortedItems.map((item, index) => (
              <div 
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium">{item.title}</h4>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={() => {
                      trpc.teamTraining.complete.useMutation().mutate({ id: item.id });
                      handleRefresh();
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No agenda items</p>
            <p className="text-sm">Add items for the next team call</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeamTraining() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Training</h1>
        <p className="text-muted-foreground mt-1">
          Manage ongoing team development, track issues, and plan weekly calls
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agenda">Meeting Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <SkillsSection />
            <IssuesSection />
          </div>
          <WinsSection />
        </TabsContent>

        <TabsContent value="agenda">
          <AgendaSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
