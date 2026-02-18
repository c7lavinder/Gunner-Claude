import { useState, useMemo, useCallback } from "react";
import { Streamdown } from "streamdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import {
  ArrowLeft,
  Bot,
  MessageSquare,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Search,
  Filter,
  StickyNote,
  Send,
  Tag,
  ArrowRightLeft,
  ListTodo,
  FileEdit,
  Loader2,
  CalendarDays,
  ChevronDown,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect } from "wouter";

const ACTION_TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  add_note: { label: "Add Note", icon: StickyNote, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  add_note_contact: { label: "Add Note", icon: StickyNote, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  add_note_opportunity: { label: "Add Note", icon: StickyNote, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  change_pipeline_stage: { label: "Move Stage", icon: ArrowRightLeft, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  send_sms: { label: "Send SMS", icon: Send, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  create_task: { label: "Create Task", icon: ListTodo, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  add_tag: { label: "Add Tag", icon: Tag, color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  remove_tag: { label: "Remove Tag", icon: Tag, color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  update_field: { label: "Update Field", icon: FileEdit, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  confirmed: { label: "Confirmed", icon: CheckCircle, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  executed: { label: "Executed", icon: CheckCircle, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  failed: { label: "Failed", icon: AlertTriangle, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400" },
};

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function CoachActivityLog() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.isTenantAdmin === 'true';

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<string>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: today, to: now };
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const applyPreset = useCallback((preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (preset) {
      case "today": {
        setDateRange({ from: today, to: now });
        break;
      }
      case "this_week": {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        setDateRange({ from: startOfWeek, to: now });
        break;
      }
      case "last_week": {
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay());
        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(thisWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(thisWeekStart);
        lastWeekEnd.setMilliseconds(-1);
        setDateRange({ from: lastWeekStart, to: lastWeekEnd });
        break;
      }
      case "this_month": {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        setDateRange({ from: startOfMonth, to: now });
        break;
      }
      case "last_month": {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        setDateRange({ from: startOfLastMonth, to: endOfLastMonth });
        break;
      }
      case "last_30": {
        const thirtyAgo = new Date(today);
        thirtyAgo.setDate(today.getDate() - 30);
        setDateRange({ from: thirtyAgo, to: now });
        break;
      }
      case "all": {
        setDateRange(undefined);
        break;
      }
    }
    setCalendarOpen(false);
  }, []);

  const dateFromStr = dateRange?.from ? dateRange.from.toISOString() : undefined;
  const dateToStr = dateRange?.to ? dateRange.to.toISOString() : undefined;

  const { data, isLoading } = trpc.coachActions.adminActivityLog.useQuery(
    {
      limit: 200,
      ...(dateFromStr ? { dateFrom: dateFromStr } : {}),
      ...(dateToStr ? { dateTo: dateToStr } : {}),
    },
    { enabled: isAdmin }
  );

  // Redirect non-admins
  if (!isAdmin) {
    return <Redirect to="/calls" />;
  }

  // Combine actions and questions into a unified timeline
  const timelineItems = useMemo(() => {
    if (!data) return [];

    const items: Array<{
      type: "action" | "question";
      id: string;
      userName: string;
      content: string;
      timestamp: Date;
      // Action-specific
      actionType?: string;
      status?: string;
      contactName?: string;
      payload?: any;
      error?: string | null;
      // Question-specific
      aiResponse?: string | null;
    }> = [];

    // Add actions
    for (const action of data.actions) {
      items.push({
        type: "action",
        id: `action-${action.id}`,
        userName: action.requestedByName || "Unknown",
        content: action.requestText,
        timestamp: new Date(action.createdAt),
        actionType: action.actionType,
        status: action.status,
        contactName: action.targetContactName || undefined,
        payload: action.payload,
        error: action.error,
      });
    }

    // Add questions
    for (const q of data.questions) {
      items.push({
        type: "question",
        id: `question-${q.id}`,
        userName: q.userName,
        content: q.content,
        timestamp: new Date(q.createdAt),
        aiResponse: q.aiResponse,
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return items;
  }, [data]);

  // Apply filters
  const filteredItems = useMemo(() => {
    let items = timelineItems;

    // Tab filter
    if (activeTab === "actions") {
      items = items.filter(i => i.type === "action");
    } else if (activeTab === "questions") {
      items = items.filter(i => i.type === "question");
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.userName.toLowerCase().includes(q) ||
        i.content.toLowerCase().includes(q) ||
        (i.contactName && i.contactName.toLowerCase().includes(q))
      );
    }

    // Action type filter
    if (actionTypeFilter !== "all") {
      items = items.filter(i => i.type === "question" || i.actionType === actionTypeFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      items = items.filter(i => i.type === "question" || i.status === statusFilter);
    }

    return items;
  }, [timelineItems, activeTab, searchQuery, actionTypeFilter, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    if (!data) return { totalActions: 0, totalQuestions: 0, executed: 0, failed: 0 };
    return {
      totalActions: data.totalActions,
      totalQuestions: data.totalQuestions,
      executed: data.actions.filter(a => a.status === "executed").length,
      failed: data.actions.filter(a => a.status === "failed").length,
    };
  }, [data]);

  // Get unique team members for display
  const teamMembers = useMemo(() => {
    const names = new Set<string>();
    for (const item of timelineItems) {
      if (item.userName && item.userName !== "Unknown") {
        names.add(item.userName);
      }
    }
    return Array.from(names).sort();
  }, [timelineItems]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/calls">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Bot className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              AI Coach Activity Log
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Everything your team has asked the AI Coach
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Actions</p>
                <p className="text-lg font-bold">{stats.totalActions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
                <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Questions</p>
                <p className="text-lg font-bold">{stats.totalQuestions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Executed</p>
                <p className="text-lg font-bold">{stats.executed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-lg font-bold">{stats.failed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Date range presets */}
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {[
              { key: "today", label: "Today" },
              { key: "all", label: "All Time" },
            ].map(({ key, label }) => (
              <Button
                key={key}
                variant={datePreset === key ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => applyPreset(key)}
              >
                {label}
              </Button>
            ))}

          </div>
          {/* Search and type/status filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, message, or contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-9">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(ACTION_TYPE_LABELS).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[140px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs + Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all" className="text-xs sm:text-sm">
            All Activity
            {timelineItems.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{timelineItems.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs sm:text-sm">
            <Zap className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
            Actions
            {(stats.totalActions || 0) > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{stats.totalActions}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="questions" className="text-xs sm:text-sm">
            <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
            Questions
            {(stats.totalQuestions || 0) > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{stats.totalQuestions}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bot className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No activity found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {searchQuery ? "Try adjusting your search or filters" : "Coach interactions will appear here as your team uses the AI Coach"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <Card key={item.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    {item.type === "action" ? (
                      <ActionItem item={item} />
                    ) : (
                      <QuestionItem item={item} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Team member breakdown */}
      {teamMembers.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Team Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {teamMembers.map(name => {
                const memberActions = timelineItems.filter(i => i.userName === name && i.type === "action").length;
                const memberQuestions = timelineItems.filter(i => i.userName === name && i.type === "question").length;
                return (
                  <div key={name} className="p-2.5 rounded-lg border bg-card">
                    <p className="font-medium text-sm truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{memberActions} actions</span>
                      <span className="text-xs text-muted-foreground/50">|</span>
                      <span className="text-xs text-muted-foreground">{memberQuestions} questions</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Action item component
function ActionItem({ item }: { item: any }) {
  const actionConfig = ACTION_TYPE_LABELS[item.actionType] || { label: item.actionType, icon: Zap, color: "bg-gray-100 text-gray-700" };
  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const ActionIcon = actionConfig.icon;
  const StatusIcon = statusConfig.icon;

  // Extract useful payload info
  const payloadSummary = useMemo(() => {
    if (!item.payload) return null;
    const parts: string[] = [];
    if (item.payload.noteBody) parts.push(`Note: "${item.payload.noteBody.substring(0, 80)}${item.payload.noteBody.length > 80 ? "..." : ""}"`);
    if (item.payload.message) parts.push(`SMS: "${item.payload.message.substring(0, 80)}${item.payload.message.length > 80 ? "..." : ""}"`);
    if (item.payload.title) parts.push(`Task: "${item.payload.title}"`);
    if (item.payload.stageName) parts.push(`Stage: ${item.payload.stageName}`);
    if (item.payload.tags) parts.push(`Tag: ${item.payload.tags}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [item.payload]);

  return (
    <div className="flex gap-3">
      <div className={`p-1.5 rounded-md h-fit mt-0.5 ${actionConfig.color}`}>
        <ActionIcon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{item.userName}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${actionConfig.color} border-0`}>
                {actionConfig.label}
              </Badge>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusConfig.color} border-0`}>
                <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                {statusConfig.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 break-words">
              "{item.content}"
            </p>
            {item.contactName && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Contact: <span className="font-medium text-foreground/70">{item.contactName}</span>
              </p>
            )}
            {payloadSummary && (
              <p className="text-xs text-muted-foreground/60 mt-1 italic break-words">
                {payloadSummary}
              </p>
            )}
            {item.error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Error: {item.error}
              </p>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0" title={formatDateTime(item.timestamp)}>
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Question item component
function QuestionItem({ item }: { item: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-3">
      <div className="p-1.5 rounded-md h-fit mt-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <MessageSquare className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{item.userName}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
                Question
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 break-words">
              "{item.content}"
            </p>
            {item.aiResponse && (
              <div className="mt-1.5">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  {expanded ? "Hide AI response" : "Show AI response"}
                </button>
                {expanded && (
                  <div className="mt-1.5 p-2.5 rounded-md bg-muted/50 text-xs text-muted-foreground break-words prose prose-xs max-w-none dark:prose-invert">
                    <Streamdown>{item.aiResponse}</Streamdown>
                  </div>
                )}
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0" title={formatDateTime(item.timestamp)}>
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
