import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Check,
  Upload,
  File,
  Play,
  MessageCircle,
  HelpCircle,
  Send,
  X,
  SkipForward,
  PhoneCall,
  ChevronDown,
  ChevronUp,
  Save,
  Copy,
  Undo2,
  GripVertical,
  PenLine
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

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
  { value: "lead_manager", label: "Lead Managers" },
  { value: "acquisition_manager", label: "Acquisition Managers" },
  { value: "lead_generator", label: "Lead Generators" },
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

function TeamItemCard({ item, onComplete, onDelete, showPriority = true, isAdmin = false }: { item: TrainingItem; onComplete: () => void; onDelete: () => void; showPriority?: boolean; isAdmin?: boolean; }) {
  const completeMutation = trpc.teamTraining.complete.useMutation({ onSuccess: () => { toast.success("Item marked as complete"); onComplete(); } });
  const deleteMutation = trpc.teamTraining.delete.useMutation({ onSuccess: () => { toast.success("Item deleted"); onDelete(); } });
  const isAiGenerated = item.isAiGenerated === "true";

  return (
    <div className={`flex items-start gap-2 py-2 px-3 rounded-md border bg-card ${isAiGenerated ? "border-l-2 border-l-purple-500" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h4 className="font-medium text-sm truncate max-w-[200px] sm:max-w-none">{item.title}</h4>
          {isAiGenerated && <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0"><Bot className="h-2.5 w-2.5 mr-0.5" />AI</Badge>}
          {showPriority && item.priority && <Badge variant="secondary" className={`${priorityColors[item.priority]} text-white text-[10px] px-1.5 py-0`}>{priorityLabels[item.priority]}</Badge>}
          {item.teamMemberName && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.teamMemberName}</Badge>}
        </div>
        {item.description && <p className="text-xs text-muted-foreground line-clamp-10 mt-0.5">{item.description}</p>}
      </div>
      {isAdmin && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => completeMutation.mutate({ id: item.id })} disabled={completeMutation.isPending}><Check className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => deleteMutation.mutate({ id: item.id })} disabled={deleteMutation.isPending}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
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

function TeamSkillsSection({ roleFilter }: { roleFilter?: "all" | "lead_manager" | "acquisition_manager" | "lead_generator" }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.teamRole === 'admin' || user?.isTenantAdmin === 'true';
  const [showAll, setShowAll] = useState(false);
  const DISPLAY_LIMIT = 3;
  
  let teamRole: "lead_manager" | "acquisition_manager" | "lead_generator" | undefined;
  if (isAdmin && roleFilter && roleFilter !== "all") {
    teamRole = roleFilter;
  } else if (!isAdmin && user?.teamRole && user.teamRole !== 'admin') {
    teamRole = user.teamRole as "lead_manager" | "acquisition_manager" | "lead_generator";
  }
  
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ itemType: "skill", status: "active", teamRole });
  const handleRefresh = () => utils.teamTraining.list.invalidate();

  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortedItems = [...(items || [])].sort((a, b) => 
    (priorityOrder[a.priority || 'medium'] || 2) - (priorityOrder[b.priority || 'medium'] || 2)
  );
  const displayItems = showAll ? sortedItems : sortedItems.slice(0, DISPLAY_LIMIT);
  const totalCount = sortedItems.length;
  const hasMore = totalCount > DISPLAY_LIMIT;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600"><Target className="h-5 w-5" /></div>
          <div><CardTitle className="text-lg">Long-Term Skills {totalCount > 0 && <span className="text-sm font-normal text-muted-foreground">({totalCount})</span>}</CardTitle><CardDescription>Top development areas · Refreshes every Monday</CardDescription></div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div> : displayItems.length > 0 ? (
          <div className="space-y-1.5">
            {displayItems.map((item) => <TeamItemCard key={item.id} item={item as TrainingItem} onComplete={handleRefresh} onDelete={handleRefresh} isAdmin={isAdmin} />)}
            {hasMore && (
              <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowAll(!showAll)}>
                {showAll ? <><ChevronUp className="h-4 w-4 mr-2" /> Show less</> : <><ChevronDown className="h-4 w-4 mr-2" /> Show {totalCount - DISPLAY_LIMIT} more</>}
              </Button>
            )}
          </div>
        ) : <div className="text-center py-8 text-muted-foreground"><Target className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No skills being tracked</p></div>}
      </CardContent>
    </Card>
  );
}

function TeamIssuesSection({ roleFilter }: { roleFilter?: "all" | "lead_manager" | "acquisition_manager" | "lead_generator" }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.teamRole === 'admin' || user?.isTenantAdmin === 'true';
  const [showAll, setShowAll] = useState(false);
  const DISPLAY_LIMIT = 3;
  
  let teamRole: "lead_manager" | "acquisition_manager" | "lead_generator" | undefined;
  if (isAdmin && roleFilter && roleFilter !== "all") {
    teamRole = roleFilter;
  } else if (!isAdmin && user?.teamRole && user.teamRole !== 'admin') {
    teamRole = user.teamRole as "lead_manager" | "acquisition_manager" | "lead_generator";
  }
  
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ itemType: "issue", status: "active", teamRole });
  const handleRefresh = () => utils.teamTraining.list.invalidate();
  const sortedItems = items?.sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (priorityOrder[a.priority as Priority] || 3) - (priorityOrder[b.priority as Priority] || 3);
  });

  const displayItems = showAll ? sortedItems : sortedItems?.slice(0, DISPLAY_LIMIT);
  const totalCount = sortedItems?.length || 0;
  const hasMore = totalCount > DISPLAY_LIMIT;

  return (
    <Card className="border-red-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></div>
          <div><CardTitle className="text-lg">Issues to Address {totalCount > 0 && <span className="text-sm font-normal text-muted-foreground">({totalCount})</span>}</CardTitle><CardDescription>Urgent incompetencies from call analysis</CardDescription></div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : displayItems && displayItems.length > 0 ? (
          <div className="space-y-1.5">
            {displayItems.map((item) => <TeamItemCard key={item.id} item={item as TrainingItem} onComplete={handleRefresh} onDelete={handleRefresh} isAdmin={isAdmin} />)}
            {hasMore && (
              <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowAll(!showAll)}>
                {showAll ? <><ChevronUp className="h-4 w-4 mr-2" /> Show less</> : <><ChevronDown className="h-4 w-4 mr-2" /> Show {totalCount - DISPLAY_LIMIT} more</>}
              </Button>
            )}
          </div>
        ) : <div className="text-center py-8 text-muted-foreground"><AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No issues to address</p></div>}
      </CardContent>
    </Card>
  );
}

function TeamWinsSection({ roleFilter }: { roleFilter?: "all" | "lead_manager" | "acquisition_manager" | "lead_generator" }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.teamRole === 'admin' || user?.isTenantAdmin === 'true';
  const [showAll, setShowAll] = useState(false);
  const DISPLAY_LIMIT = 3;
  
  let teamRole: "lead_manager" | "acquisition_manager" | "lead_generator" | undefined;
  if (isAdmin && roleFilter && roleFilter !== "all") {
    teamRole = roleFilter;
  } else if (!isAdmin && user?.teamRole && user.teamRole !== 'admin') {
    teamRole = user.teamRole as "lead_manager" | "acquisition_manager" | "lead_generator";
  }
  
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ itemType: "win", status: "active", teamRole });
  const handleRefresh = () => utils.teamTraining.list.invalidate();

  const displayItems = showAll ? items : items?.slice(0, DISPLAY_LIMIT);
  const totalCount = items?.length || 0;
  const hasMore = totalCount > DISPLAY_LIMIT;

  return (
    <Card className="border-green-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 text-green-600"><Trophy className="h-5 w-5" /></div>
          <div><CardTitle className="text-lg">Wins to Celebrate {totalCount > 0 && <span className="text-sm font-normal text-muted-foreground">({totalCount})</span>}</CardTitle><CardDescription>Small victories to recognize</CardDescription></div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div> : displayItems && displayItems.length > 0 ? (
          <div className="space-y-1.5">
            {displayItems.map((item) => <TeamItemCard key={item.id} item={item as TrainingItem} onComplete={handleRefresh} onDelete={handleRefresh} showPriority={false} isAdmin={isAdmin} />)}
            {hasMore && (
              <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowAll(!showAll)}>
                {showAll ? <><ChevronUp className="h-4 w-4 mr-2" /> Show less</> : <><ChevronDown className="h-4 w-4 mr-2" /> Show {totalCount - DISPLAY_LIMIT} more</>}
              </Button>
            )}
          </div>
        ) : <div className="text-center py-8 text-muted-foreground"><Trophy className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No wins recorded yet</p></div>}
      </CardContent>
    </Card>
  );
}

type MeetingMode = "facilitate" | "roleplay" | "example" | "qa";
type ChatMessage = { role: "user" | "assistant"; content: string; mode?: MeetingMode };

const SELLER_PERSONALITIES = [
  { value: "skeptical", label: "Skeptical Seller", desc: "Doubtful about investors, questions everything" },
  { value: "motivated", label: "Motivated Seller", desc: "Eager to sell, has clear timeline" },
  { value: "price_focused", label: "Price-Focused", desc: "Only cares about getting top dollar" },
  { value: "emotional", label: "Emotional Seller", desc: "Attached to property, needs empathy" },
];

const ROLEPLAY_SCENARIOS = [
  { value: "first_call", label: "First Qualification Call", desc: "Initial contact with new lead" },
  { value: "follow_up", label: "Follow-Up Call", desc: "Second touch after initial interest" },
  { value: "offer_presentation", label: "Offer Presentation", desc: "Presenting numbers to seller" },
  { value: "closing", label: "Closing Call", desc: "Getting commitment to move forward" },
];

function MeetingFacilitator({ agendaItems, onClose }: { agendaItems: Array<{ id: number; title: string; description: string | null }>; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<MeetingMode>("facilitate");
  const [currentAgendaIndex, setCurrentAgendaIndex] = useState(0);
  const [roleplayPersonality, setRoleplayPersonality] = useState("skeptical");
  const [roleplayScenario, setRoleplayScenario] = useState("first_call");
  const [roleplayCount, setRoleplayCount] = useState(0);
  const [isStarted, setIsStarted] = useState(false);

  const chatMutation = trpc.meeting.chat.useMutation({
    onSuccess: (data) => setMessages(prev => [...prev, { role: "assistant", content: data.answer, mode: data.mode }]),
    onError: () => toast.error("Failed to get response"),
  });

  const summaryMutation = trpc.meeting.generateSummary.useMutation({
    onSuccess: (data) => setMessages(prev => [...prev, { role: "assistant", content: `📋 **Meeting Summary**\n\n${data.summary}`, mode: "facilitate" }]),
  });

  const currentAgenda = agendaItems[currentAgendaIndex];

  const startMeeting = () => {
    setIsStarted(true);
    setMessages([{ role: "assistant", content: `🎯 **Welcome to your team training session!**\n\nToday's agenda has ${agendaItems.length} items. Let's start with:\n\n**${currentAgenda?.title || "General Discussion"}**\n${currentAgenda?.description ? `\n${currentAgenda.description}` : ""}\n\nUse the mode buttons below to:\n- 💬 **Facilitate** - Guide discussion\n- 🎭 **Role-Play** - Practice with AI seller\n- 📄 **Examples** - See real call clips\n- ❓ **Q&A** - Ask coaching questions\n\nWhat would you like to focus on first?`, mode: "facilitate" }]);
  };

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    if (mode === "roleplay") setRoleplayCount(prev => prev + 1);
    chatMutation.mutate({
      message: userMessage,
      mode,
      currentAgendaItem: currentAgenda ? { id: currentAgenda.id, title: currentAgenda.title, description: currentAgenda.description || undefined } : undefined,
      roleplayContext: mode === "roleplay" ? { scenario: ROLEPLAY_SCENARIOS.find(s => s.value === roleplayScenario)?.desc, sellerPersonality: SELLER_PERSONALITIES.find(p => p.value === roleplayPersonality)?.desc } : undefined,
      conversationHistory: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
    });
  };

  const nextAgendaItem = () => {
    if (currentAgendaIndex < agendaItems.length - 1) {
      const nextIndex = currentAgendaIndex + 1;
      setCurrentAgendaIndex(nextIndex);
      const nextItem = agendaItems[nextIndex];
      setMessages(prev => [...prev, { role: "assistant", content: `⏭️ **Moving to next agenda item:**\n\n**${nextItem.title}**\n${nextItem.description ? `\n${nextItem.description}` : ""}\n\nHow would you like to approach this topic?`, mode: "facilitate" }]);
    } else {
      summaryMutation.mutate({ agendaItems: agendaItems.map((item, i) => ({ title: item.title, discussed: i <= currentAgendaIndex })), roleplayCount });
    }
  };

  const getModeIcon = (m: MeetingMode) => {
    switch (m) {
      case "facilitate": return <MessageCircle className="h-4 w-4" />;
      case "roleplay": return <Users className="h-4 w-4" />;
      case "example": return <FileText className="h-4 w-4" />;
      case "qa": return <HelpCircle className="h-4 w-4" />;
    }
  };

  if (!isStarted) {
    return (
      <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white"><Bot className="h-6 w-6" /></div>
                <div><CardTitle>AI Meeting Facilitator</CardTitle><CardDescription>Your AI-powered training session guide</CardDescription></div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4">
              <h3 className="font-semibold mb-2">Today's Agenda ({agendaItems.length} items)</h3>
              <div className="space-y-2">
                {agendaItems.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="w-6 h-6 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg"><div className="flex items-center gap-2 mb-2"><Users className="h-5 w-5 text-purple-600" /><span className="font-medium">Role-Play Practice</span></div><p className="text-sm text-muted-foreground">AI plays the seller so your team can practice</p></div>
              <div className="p-4 border rounded-lg"><div className="flex items-center gap-2 mb-2"><FileText className="h-5 w-5 text-purple-600" /><span className="font-medium">Real Examples</span></div><p className="text-sm text-muted-foreground">Pull clips from actual calls</p></div>
              <div className="p-4 border rounded-lg"><div className="flex items-center gap-2 mb-2"><HelpCircle className="h-5 w-5 text-purple-600" /><span className="font-medium">Q&A Coaching</span></div><p className="text-sm text-muted-foreground">Get instant coaching answers</p></div>
              <div className="p-4 border rounded-lg"><div className="flex items-center gap-2 mb-2"><MessageCircle className="h-5 w-5 text-purple-600" /><span className="font-medium">Guided Discussion</span></div><p className="text-sm text-muted-foreground">AI guides you through each topic</p></div>
            </div>
            <Button className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700" size="lg" onClick={startMeeting}><Play className="h-5 w-5 mr-2" />Start Meeting</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex flex-col">
      <div className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white"><Bot className="h-5 w-5" /></div>
            <div><h2 className="font-semibold">AI Meeting Facilitator</h2><p className="text-xs text-muted-foreground">Item {currentAgendaIndex + 1} of {agendaItems.length}: {currentAgenda?.title}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={nextAgendaItem} disabled={summaryMutation.isPending}><SkipForward className="h-4 w-4 mr-1" />{currentAgendaIndex < agendaItems.length - 1 ? "Next Item" : "End Meeting"}</Button>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden max-w-4xl mx-auto w-full">
        <ScrollArea className="h-full p-4">
          <div className="space-y-4 pb-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {msg.role === "assistant" && msg.mode && <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">{getModeIcon(msg.mode)}<span className="capitalize">{msg.mode}</span></div>}
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {chatMutation.isPending && <div className="flex justify-start"><div className="bg-muted rounded-lg p-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Thinking...</div></div></div>}
          </div>
        </ScrollArea>
      </div>
      <div className="border-t bg-card p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex items-center gap-2">
            {(["facilitate", "roleplay", "example", "qa"] as MeetingMode[]).map((m) => (
              <Button key={m} variant={mode === m ? "default" : "outline"} size="sm" onClick={() => setMode(m)} className={mode === m ? "bg-purple-600 hover:bg-purple-700" : ""}>{getModeIcon(m)}<span className="ml-1 capitalize">{m === "qa" ? "Q&A" : m === "roleplay" ? "Role-Play" : m}</span></Button>
            ))}
          </div>
          {mode === "roleplay" && (
            <div className="flex items-center gap-2 text-sm">
              <Select value={roleplayPersonality} onValueChange={setRoleplayPersonality}><SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger><SelectContent>{SELLER_PERSONALITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select>
              <Select value={roleplayScenario} onValueChange={setRoleplayScenario}><SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger><SelectContent>{ROLEPLAY_SCENARIOS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          <div className="flex gap-2">
            <Input placeholder={mode === "roleplay" ? "Practice your response to the seller..." : mode === "example" ? "What technique would you like to see examples of?" : mode === "qa" ? "Ask a coaching question..." : "Type your message..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()} disabled={chatMutation.isPending} />
            <Button onClick={handleSend} disabled={!input.trim() || chatMutation.isPending} className="bg-purple-600 hover:bg-purple-700"><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamAgendaSection({ roleFilter }: { roleFilter?: "all" | "lead_manager" | "acquisition_manager" | "lead_generator" }) {
  const utils = trpc.useUtils();
  const [showFacilitator, setShowFacilitator] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.teamRole === 'admin' || user?.isTenantAdmin === 'true';
  
  let teamRole: "lead_manager" | "acquisition_manager" | "lead_generator" | undefined;
  if (isAdmin && roleFilter && roleFilter !== "all") {
    teamRole = roleFilter;
  } else if (!isAdmin && user?.teamRole && user.teamRole !== 'admin') {
    teamRole = user.teamRole as "lead_manager" | "acquisition_manager" | "lead_generator";
  }
  
  const { data: items, isLoading } = trpc.teamTraining.list.useQuery({ itemType: "agenda", status: "active", teamRole });
  const handleRefresh = () => utils.teamTraining.list.invalidate();
  const completeMutation = trpc.teamTraining.complete.useMutation({ onSuccess: () => { toast.success("Agenda item completed"); handleRefresh(); } });
  const sortedItems = items?.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const agendaForFacilitator = sortedItems?.map(item => ({ id: item.id, title: item.title, description: item.description })) || [];

  return (
    <>
      {showFacilitator && agendaForFacilitator.length > 0 && <MeetingFacilitator agendaItems={agendaForFacilitator} onClose={() => setShowFacilitator(false)} />}
      <Card className="border-purple-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 text-purple-600"><Calendar className="h-5 w-5" /></div>
            <div><CardTitle className="text-lg">Weekly Team Call Agenda</CardTitle><CardDescription>AI-suggested topics based on call analysis</CardDescription></div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowFacilitator(true)} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700" disabled={!sortedItems || sortedItems.length === 0}><Play className="h-4 w-4 mr-2" />Start Meeting</Button>
          </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-1.5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : sortedItems && sortedItems.length > 0 ? (
          <div className="space-y-1.5">
            {sortedItems.map((item, index) => (
              <div key={item.id} className={`flex items-center gap-2 py-2 px-3 rounded-md border bg-card ${item.isAiGenerated === "true" ? "border-l-2 border-l-purple-500" : ""}`}>
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600 font-bold text-xs shrink-0">{index + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-medium text-sm truncate">{item.title}</h4>
                    {item.isAiGenerated === "true" && <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0"><Bot className="h-2.5 w-2.5 mr-0.5" />AI</Badge>}
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0" onClick={() => completeMutation.mutate({ id: item.id })} disabled={completeMutation.isPending}><Check className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        ) : <div className="text-center py-8 text-muted-foreground"><Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No agenda items</p></div>}
      </CardContent>
    </Card>
    </>
  );
}

function TeamTrainingContent() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.teamRole === 'admin' || user?.isTenantAdmin === 'true';
  const [selectedRole, setSelectedRole] = useState<"all" | "lead_manager" | "acquisition_manager" | "lead_generator">("all");
  const handleInsightsGenerated = () => utils.teamTraining.list.invalidate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4 flex-1 mr-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-100 text-purple-600"><Sparkles className="h-5 w-5" /></div>
            <div>
              <h3 className="font-medium text-purple-900">AI-Powered Insights</h3>
              <p className="text-sm text-purple-700 mt-1">
                {isAdmin 
                  ? 'Click "Generate AI Insights" to analyze your team\'s recent calls and automatically identify issues, wins, skills to develop, and meeting agenda items.'
                  : 'AI-generated insights from team calls are automatically refreshed weekly. Review the issues, wins, and skills below to improve your performance.'}
              </p>
            </div>
          </div>
        </div>
        {isAdmin && <GenerateInsightsBtn onSuccess={handleInsightsGenerated} />}
      </div>

      {isAdmin && (
        <Card>
          <CardContent className="pt-6">
            <Tabs value={selectedRole} onValueChange={(value) => setSelectedRole(value as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all"><Users className="h-4 w-4 mr-2" />All Roles</TabsTrigger>
                <TabsTrigger value="lead_manager">Lead Manager</TabsTrigger>
                <TabsTrigger value="acquisition_manager">Acquisition Manager</TabsTrigger>
                <TabsTrigger value="lead_generator">Lead Generator</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agenda">Meeting Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <TeamIssuesSection roleFilter={selectedRole} />
            <TeamWinsSection roleFilter={selectedRole} />
          </div>
          <TeamSkillsSection roleFilter={selectedRole} />
        </TabsContent>

        <TabsContent value="agenda">
          <TeamAgendaSection roleFilter={selectedRole} />
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
    fileName: "" as string,
    fileType: "" as string,
    fileData: "" as string,
  });
  const [isUploading, setIsUploading] = useState(false);

  const { data: materials, isLoading, refetch } = trpc.training.list.useQuery({});
  const { data: rubrics, isLoading: rubricsLoading } = trpc.rubrics.getAll.useQuery();
  const { data: qualificationContext } = trpc.rubrics.getContext.useQuery({ callType: "qualification" });
  const { data: offerContext } = trpc.rubrics.getContext.useQuery({ callType: "offer" });
  const { data: leadGenContext } = trpc.rubrics.getContext.useQuery({ callType: "lead_generation" });
  const { data: followUpContext } = trpc.rubrics.getContext.useQuery({ callType: "follow_up" });
  const { data: sellerCallbackContext } = trpc.rubrics.getContext.useQuery({ callType: "seller_callback" });
  const { data: adminCallbackContext } = trpc.rubrics.getContext.useQuery({ callType: "admin_callback" });

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
      fileName: "",
      fileType: "",
      fileData: "",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
      "text/markdown",
    ];
    const validExtensions = [".pdf", ".docx", ".doc", ".txt", ".md"];
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      toast.error("Please upload a PDF, DOCX, DOC, TXT, or MD file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setIsUploading(true);
    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setFormData(prev => ({
          ...prev,
          fileName: file.name,
          fileType: file.type || `application/${fileExtension.slice(1)}`,
          fileData: base64,
          title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
        }));
        toast.success(`File "${file.name}" ready for upload`);
        setIsUploading(false);
      };
      reader.onerror = () => {
        toast.error("Failed to read file");
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Failed to process file");
      setIsUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    // Content is required unless a file is being uploaded
    if (!formData.content.trim() && !formData.fileData) {
      toast.error("Content or file upload is required");
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
      fileName: material.fileName || "",
      fileType: material.fileType || "",
      fileData: "", // Don't reload file data on edit
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
                {/* File Upload Section */}
                <div className="space-y-2">
                  <Label>Upload Document (Optional)</Label>
                  <div className="border-2 border-dashed rounded-lg p-4 hover:border-primary/50 transition-colors">
                    {formData.fileName ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <File className="h-5 w-5 text-blue-500" />
                          <span className="text-sm font-medium">{formData.fileName}</span>
                          <Badge variant="secondary" className="text-xs">
                            {formData.fileType.includes('pdf') ? 'PDF' : 
                             formData.fileType.includes('word') || formData.fileType.includes('docx') ? 'DOCX' :
                             formData.fileType.includes('doc') ? 'DOC' :
                             formData.fileType.includes('text') || formData.fileType.includes('txt') ? 'TXT' : 'File'}
                          </Badge>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setFormData({ ...formData, fileName: '', fileType: '', fileData: '' })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center cursor-pointer">
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <span className="text-sm text-muted-foreground">Click to upload PDF, DOCX, DOC, TXT, or MD</span>
                        <span className="text-xs text-muted-foreground mt-1">Max file size: 10MB</span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,text/markdown"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                        />
                      </label>
                    )}
                    {isUploading && (
                      <div className="flex items-center justify-center mt-2">
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm">Processing file...</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload a document to automatically extract its text content. The extracted text will be used for AI grading.
                  </p>
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or paste content directly</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Content {!formData.fileData && '*'}</Label>
                  <Textarea
                    id="content"
                    placeholder="Paste your training content here..."
                    className="min-h-[200px] font-mono text-sm"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  />
                  {formData.fileData && (
                    <p className="text-xs text-muted-foreground">
                      A file has been uploaded. You can add additional content here or leave it empty to use only the uploaded file.
                    </p>
                  )}
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
          <MethodologyTab 
            rubrics={rubrics}
            rubricsLoading={rubricsLoading}
            qualificationContext={qualificationContext}
            offerContext={offerContext}
            leadGenContext={leadGenContext}
            followUpContext={followUpContext}
            sellerCallbackContext={sellerCallbackContext}
            adminCallbackContext={adminCallbackContext}
          />
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


// ============ CALL TYPE CONFIG FOR METHODOLOGY TAB ============
const CALL_TYPE_CONFIG = [
  { callType: "qualification", tabValue: "lead_manager", label: "Qualification", icon: Users, rubricKey: "leadManager", contextKey: "qualification" as const, title: "Lead Manager \u2014 Qualification Rubric", description: "First-touch qualification calls to qualify leads and set appointments. Used by Lead Managers." },
  { callType: "offer", tabValue: "acquisition_manager", label: "Offer", icon: Target, rubricKey: "acquisitionManager", contextKey: "offer" as const, title: "Acquisition Manager \u2014 Offer Rubric", description: "Offer presentation calls where numbers are presented to the seller. Used by Acquisition Managers." },
  { callType: "follow_up", tabValue: "follow_up", label: "Follow-Up", icon: PhoneCall, rubricKey: "followUp", contextKey: "follow_up" as const, title: "Follow-Up Call Rubric", description: "Second and subsequent touches after initial qualification. Focuses on re-engagement, urgency building, and appointment setting." },
  { callType: "seller_callback", tabValue: "seller_callback", label: "Seller Callback", icon: PhoneCall, rubricKey: "sellerCallback", contextKey: "seller_callback" as const, title: "Seller Callback Rubric", description: "Inbound calls where the seller is calling back. Focuses on capitalizing on seller initiative, qualifying motivation, and locking in next steps." },
  { callType: "admin_callback", tabValue: "admin_callback", label: "Admin Callback", icon: PhoneCall, rubricKey: "adminCallback", contextKey: "admin_callback" as const, title: "Admin Callback Rubric", description: "Administrative follow-up calls for scheduling, document collection, and process management. Focuses on professionalism and task completion." },
  { callType: "cold_call", tabValue: "lead_generator", label: "Lead Generator", icon: Users, rubricKey: "leadGenerator", contextKey: "lead_generation" as const, title: "Lead Generator Rubric", description: "Cold calls to generate seller interest \u2014 Lead Generators do NOT set appointments." },
];

interface CriterionEdit {
  name: string;
  maxPoints: number;
  description: string;
  keyPhrases?: string[];
}

interface RubricEditState {
  id?: number; // tenant_rubrics.id if editing existing
  name: string;
  description: string;
  callType: string;
  criteria: CriterionEdit[];
  redFlags: string[];
}

function MethodologyTab({ rubrics, rubricsLoading, qualificationContext, offerContext, leadGenContext, followUpContext, sellerCallbackContext, adminCallbackContext }: {
  rubrics: any;
  rubricsLoading: boolean;
  qualificationContext: any;
  offerContext: any;
  leadGenContext: any;
  followUpContext: any;
  sellerCallbackContext: any;
  adminCallbackContext: any;
}) {
  const { user } = useAuth();
  const isAdmin = user?.teamRole === 'admin' || user?.isTenantAdmin === 'true';
  const utils = trpc.useUtils();

  // Fetch tenant-specific rubrics
  const { data: tenantRubrics, isLoading: tenantRubricsLoading } = trpc.rubrics.getTenantRubrics.useQuery(undefined, {
    enabled: !!user?.tenantId,
  });

  const hasCustomRubrics = tenantRubrics && tenantRubrics.length > 0;

  // Editing state
  const [editingCallType, setEditingCallType] = useState<string | null>(null);
  const [editState, setEditState] = useState<RubricEditState | null>(null);
  const [newRedFlag, setNewRedFlag] = useState("");

  // Mutations
  const seedMutation = trpc.rubrics.seedDefaults.useMutation({
    onSuccess: () => {
      toast.success("Default rubrics copied to your account. You can now customize them.");
      utils.rubrics.getTenantRubrics.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.rubrics.updateTenantRubric.useMutation({
    onSuccess: () => {
      toast.success("Rubric saved successfully");
      setEditingCallType(null);
      setEditState(null);
      utils.rubrics.getTenantRubrics.invalidate();
    },
    onError: (err) => toast.error("Failed to save: " + err.message),
  });

  const createMutation = trpc.rubrics.createTenantRubric.useMutation({
    onSuccess: () => {
      toast.success("Rubric created successfully");
      setEditingCallType(null);
      setEditState(null);
      utils.rubrics.getTenantRubrics.invalidate();
    },
    onError: (err) => toast.error("Failed to create: " + err.message),
  });

  const deleteMutation = trpc.rubrics.deleteTenantRubric.useMutation({
    onSuccess: () => {
      toast.success("Custom rubric removed. Default rubric will be used for grading.");
      utils.rubrics.getTenantRubrics.invalidate();
    },
    onError: (err) => toast.error("Failed to delete: " + err.message),
  });

  // Get the rubric to display for a given call type
  const getRubricForCallType = useCallback((callType: string, rubricKey: string) => {
    if (hasCustomRubrics) {
      const custom = tenantRubrics.find((r: any) => r.callType === callType);
      if (custom) {
        try {
          return {
            id: custom.id,
            name: custom.name,
            description: custom.description,
            criteria: JSON.parse(custom.criteria),
            redFlags: custom.redFlags ? JSON.parse(custom.redFlags) : [],
            isCustom: true,
          };
        } catch { /* fall through to default */ }
      }
    }
    // Fall back to hardcoded defaults
    const defaultRubric = (rubrics as any)?.[rubricKey];
    return defaultRubric ? { ...defaultRubric, isCustom: false } : null;
  }, [hasCustomRubrics, tenantRubrics, rubrics]);

  const getContextForCallType = useCallback((contextKey: string) => {
    const contextMap: Record<string, any> = {
      qualification: qualificationContext,
      offer: offerContext,
      lead_generation: leadGenContext,
      follow_up: followUpContext,
      seller_callback: sellerCallbackContext,
      admin_callback: adminCallbackContext,
    };
    return contextMap[contextKey];
  }, [qualificationContext, offerContext, leadGenContext, followUpContext, sellerCallbackContext, adminCallbackContext]);

  // Start editing a rubric
  const startEditing = useCallback((callType: string, rubricKey: string, config: typeof CALL_TYPE_CONFIG[0]) => {
    const rubric = getRubricForCallType(callType, rubricKey);
    if (!rubric) return;
    setEditingCallType(callType);
    setEditState({
      id: rubric.isCustom ? rubric.id : undefined,
      name: rubric.name || config.title,
      description: rubric.description || config.description,
      callType,
      criteria: (rubric.criteria || []).map((c: any) => ({
        name: c.name,
        maxPoints: c.maxPoints,
        description: c.description,
        keyPhrases: c.keyPhrases || [],
      })),
      redFlags: rubric.redFlags || [],
    });
  }, [getRubricForCallType]);

  const cancelEditing = () => {
    setEditingCallType(null);
    setEditState(null);
    setNewRedFlag("");
  };

  const saveEditing = () => {
    if (!editState) return;
    const criteriaJson = JSON.stringify(editState.criteria);
    const redFlagsJson = JSON.stringify(editState.redFlags);

    if (editState.id) {
      // Update existing tenant rubric
      updateMutation.mutate({
        id: editState.id,
        name: editState.name,
        description: editState.description,
        callType: editState.callType,
        criteria: criteriaJson,
        redFlags: redFlagsJson,
      });
    } else {
      // Create new tenant rubric (customizing from default)
      createMutation.mutate({
        name: editState.name,
        description: editState.description,
        callType: editState.callType,
        criteria: criteriaJson,
        redFlags: redFlagsJson,
      });
    }
  };

  // Criterion editing helpers
  const updateCriterion = (index: number, field: keyof CriterionEdit, value: any) => {
    if (!editState) return;
    const newCriteria = [...editState.criteria];
    newCriteria[index] = { ...newCriteria[index], [field]: value };
    setEditState({ ...editState, criteria: newCriteria });
  };

  const addCriterion = () => {
    if (!editState) return;
    setEditState({
      ...editState,
      criteria: [...editState.criteria, { name: "New Criterion", maxPoints: 10, description: "Describe what this criterion evaluates" }],
    });
  };

  const removeCriterion = (index: number) => {
    if (!editState) return;
    const newCriteria = editState.criteria.filter((_, i) => i !== index);
    setEditState({ ...editState, criteria: newCriteria });
  };

  // Red flag helpers
  const addRedFlag = () => {
    if (!editState || !newRedFlag.trim()) return;
    setEditState({ ...editState, redFlags: [...editState.redFlags, newRedFlag.trim()] });
    setNewRedFlag("");
  };

  const removeRedFlag = (index: number) => {
    if (!editState) return;
    const newFlags = editState.redFlags.filter((_, i) => i !== index);
    setEditState({ ...editState, redFlags: newFlags });
  };

  const updateRedFlag = (index: number, value: string) => {
    if (!editState) return;
    const newFlags = [...editState.redFlags];
    newFlags[index] = value;
    setEditState({ ...editState, redFlags: newFlags });
  };

  if (rubricsLoading || tenantRubricsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Customization Banner for Admins */}
      {isAdmin && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400">
                <PenLine className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-blue-900 dark:text-blue-100">Customize Your Grading Rubrics</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  {hasCustomRubrics
                    ? "You have custom rubrics. Click the edit button on any rubric below to modify criteria, point values, and red flags. Changes affect future call grades only."
                    : "Your calls are graded using the default rubrics. Click \"Customize Rubrics\" to copy the defaults into your account so you can edit them."}
                </p>
              </div>
              {!hasCustomRubrics && (
                <Button
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                >
                  {seedMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Copying...</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-2" />Customize Rubrics</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Call Type Tabs */}
      <Tabs defaultValue="lead_manager" className="space-y-6">
        <TabsList className="flex flex-wrap gap-1 w-full max-w-4xl">
          {CALL_TYPE_CONFIG.map((config) => {
            const IconComponent = config.icon;
            return (
              <TabsTrigger key={config.tabValue} value={config.tabValue} className="flex items-center gap-2">
                <IconComponent className="h-4 w-4" />
                {config.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {CALL_TYPE_CONFIG.map((config) => {
          const rubric = getRubricForCallType(config.callType, config.rubricKey);
          const context = getContextForCallType(config.contextKey);
          const isEditing = editingCallType === config.callType;

          return (
            <TabsContent key={config.tabValue} value={config.tabValue} className="space-y-6">
              {isEditing && editState ? (
                // ============ EDIT MODE ============
                <div className="space-y-6">
                  {/* Edit Header */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <PenLine className="h-5 w-5 text-blue-500" />
                            Editing: {config.label} Rubric
                          </CardTitle>
                          <CardDescription>Modify criteria, point values, descriptions, and red flags</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={cancelEditing}>
                            <Undo2 className="h-4 w-4 mr-1" />Cancel
                          </Button>
                          <Button size="sm" onClick={saveEditing} disabled={updateMutation.isPending || createMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
                            <Save className="h-4 w-4 mr-1" />{updateMutation.isPending || createMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Rubric Name</Label>
                            <Input
                              value={editState.name}
                              onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                              placeholder="e.g., Qualification Call Rubric"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Total Points</Label>
                            <div className="p-2 bg-muted/50 rounded-md text-center font-bold text-lg">
                              {editState.criteria.reduce((sum, c) => sum + c.maxPoints, 0)}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Textarea
                            value={editState.description}
                            onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                            placeholder="Describe when this rubric is used..."
                            rows={2}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Editable Criteria */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            Grading Criteria ({editState.criteria.length})
                          </CardTitle>
                          <CardDescription>Each call is scored on these criteria. Drag to reorder.</CardDescription>
                        </div>
                        <Button size="sm" variant="outline" onClick={addCriterion}>
                          <Plus className="h-4 w-4 mr-1" />Add Criterion
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {editState.criteria.map((criterion, index) => (
                          <div key={index} className="p-4 border rounded-lg bg-card hover:border-blue-300 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="flex items-center gap-1 pt-2 text-muted-foreground">
                                <GripVertical className="h-4 w-4" />
                                <span className="text-xs font-mono w-4 text-center">{index + 1}</span>
                              </div>
                              <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-3">
                                  <Input
                                    value={criterion.name}
                                    onChange={(e) => updateCriterion(index, "name", e.target.value)}
                                    className="font-medium"
                                    placeholder="Criterion name"
                                  />
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Input
                                      type="number"
                                      value={criterion.maxPoints}
                                      onChange={(e) => updateCriterion(index, "maxPoints", parseInt(e.target.value) || 0)}
                                      className="w-20 text-center"
                                      min={0}
                                      max={100}
                                    />
                                    <span className="text-sm text-muted-foreground">pts</span>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                                    onClick={() => removeCriterion(index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                <Textarea
                                  value={criterion.description}
                                  onChange={(e) => updateCriterion(index, "description", e.target.value)}
                                  placeholder="Describe what this criterion evaluates..."
                                  rows={2}
                                  className="text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        {editState.criteria.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p>No criteria yet. Click "Add Criterion" to start building your rubric.</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Editable Red Flags */}
                  <Card className="border-red-200 dark:border-red-900">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2 text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-5 w-5" />
                        Red Flags ({editState.redFlags.length})
                      </CardTitle>
                      <CardDescription>Issues that will be flagged during grading</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {editState.redFlags.map((flag, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="text-red-500 shrink-0">&bull;</span>
                            <Input
                              value={flag}
                              onChange={(e) => updateRedFlag(index, e.target.value)}
                              className="text-sm"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                              onClick={() => removeRedFlag(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 mt-3">
                          <Input
                            value={newRedFlag}
                            onChange={(e) => setNewRedFlag(e.target.value)}
                            placeholder="Add a new red flag..."
                            className="text-sm"
                            onKeyDown={(e) => e.key === "Enter" && addRedFlag()}
                          />
                          <Button size="sm" variant="outline" onClick={addRedFlag} disabled={!newRedFlag.trim()}>
                            <Plus className="h-4 w-4 mr-1" />Add
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Bottom Save Bar */}
                  <div className="flex items-center justify-end gap-2 sticky bottom-4 bg-background/95 backdrop-blur-sm p-4 rounded-lg border shadow-lg">
                    <Button variant="outline" onClick={cancelEditing}>Cancel</Button>
                    <Button onClick={saveEditing} disabled={updateMutation.isPending || createMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
                      <Save className="h-4 w-4 mr-2" />{updateMutation.isPending || createMutation.isPending ? "Saving..." : "Save Rubric Changes"}
                    </Button>
                  </div>
                </div>
              ) : (
                // ============ VIEW MODE ============
                <div className="space-y-6">
                  {/* Rubric Overview */}
                  {rubric && (
                    <>
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="flex items-center gap-2">
                                <Scale className="h-5 w-5" />
                                {rubric.name || config.title}
                                {rubric.isCustom && (
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                                    <PenLine className="h-3 w-3 mr-1" />Custom
                                  </Badge>
                                )}
                              </CardTitle>
                              <CardDescription>{rubric.description || config.description}</CardDescription>
                            </div>
                            {isAdmin && (hasCustomRubrics || rubric.isCustom) && (
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => startEditing(config.callType, config.rubricKey, config)}>
                                  <Edit className="h-4 w-4 mr-1" />Edit
                                </Button>
                                {rubric.isCustom && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300">
                                        <Undo2 className="h-4 w-4 mr-1" />Reset to Default
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Reset to Default Rubric?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will remove your custom {config.label} rubric and revert to the built-in default. Future calls will be graded using the default criteria. This cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Keep Custom</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => rubric.id && deleteMutation.mutate({ id: rubric.id })}
                                          className="bg-red-600 text-white hover:bg-red-700"
                                        >
                                          Reset to Default
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid gap-4 sm:grid-cols-3">
                            <div className="p-4 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold">{rubric.criteria?.length || 0}</p>
                              <p className="text-sm text-muted-foreground">Grading Criteria</p>
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold">{rubric.criteria?.reduce((sum: number, c: any) => sum + c.maxPoints, 0) || 100}</p>
                              <p className="text-sm text-muted-foreground">Total Points</p>
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold">{context?.trainingMaterials?.length || 0}</p>
                              <p className="text-sm text-muted-foreground">Training Materials</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Criteria List */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            Grading Criteria
                          </CardTitle>
                          <CardDescription>Each call is evaluated on these criteria</CardDescription>
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
                            <CardDescription>Issues that will be flagged during grading</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-2">
                              {rubric.redFlags.map((flag: string, index: number) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                  <span className="text-red-500 mt-0.5">&bull;</span>
                                  {flag}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
