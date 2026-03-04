import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import {
  CheckCircle2,
  Phone,
  MessageSquare,
  Zap,
  StickyNote,
  Clock,
  AlertTriangle,
  CalendarDays,
  RefreshCw,
  Users,
  Search,
  FileText,
  ExternalLink,
  Pencil,
  Trash2,
  CalendarPlus,
  Plus,
  Minus,
  ArrowRight,
  ChevronsUpDown,
  Check,
  GitBranch,
  Mail,
  Timer,
  PhoneIncoming,
  PhoneMissed,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingUp,
  Send,
  MapPin,
  Star,
  Flame,
  ArrowUpRight,
  Sun,
  Moon,
  Bot,
  Loader2,
  Sparkles,
  XCircle,
  CheckCircle,
  Tag,
  X,
} from "lucide-react";
import { useDemo } from "@/hooks/useDemo";

// ─── HELPERS ────────────────────────────────────────────

function stripHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}

function formatPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── TYPES ──────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  body?: string;
  assignedTo: string;
  dueDate: string;
  completed: boolean;
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  overdueDays: number;
  group: "overdue" | "today" | "upcoming";
  assignedMemberName?: string;
  // Day Hub priority fields
  priorityScore?: number;
  category?: "new_lead" | "reschedule" | "admin" | "follow_up";
  amCallMade?: boolean;
  pmCallMade?: boolean;
}

interface TeamMember {
  id: number;
  name: string;
  ghlUserId: string | null;
  teamRole?: string;
  lcPhones?: string | null; // JSON array of LC phone numbers
}

type RoleTab = "admin" | "lm" | "am";

const LM_KPI_PER_PERSON = { calls: 150, convos: 20, apts: 4, offers: 0, contracts: 0 };
const AM_KPI_PER_PERSON = { calls: 40, convos: 0, apts: 0, offers: 2, contracts: 1 };

const ROLE_TAB_CONFIG: Record<RoleTab, { label: string; description: string; kpiTargets: { calls: number; convos: number; apts: number; offers: number; contracts: number }; teamRoles: string[] }> = {
  admin: {
    label: "Admin",
    description: "Full team overview — all tasks, KPIs, and inbox",
    kpiTargets: { calls: 150, convos: 20, apts: 4, offers: 2, contracts: 1 }, // default, overridden dynamically
    teamRoles: [],
  },
  lm: {
    label: "LM",
    description: "Lead Manager view — qualification & appointment setting",
    kpiTargets: LM_KPI_PER_PERSON,
    teamRoles: ["lead_manager"],
  },
  am: {
    label: "AM",
    description: "Acquisition Manager view — offers & contracts",
    kpiTargets: AM_KPI_PER_PERSON,
    teamRoles: ["acquisition_manager"],
  },
};

// ─── KPI BAR ────────────────────────────────────────────

function KpiBar({ roleTab, teamMembers }: { roleTab: RoleTab; teamMembers?: TeamMember[] }) {
  const { data: kpi, isLoading } = trpc.taskCenter.getKpiSummary.useQuery(undefined, {
    refetchInterval: 120000,
  });

  const addKpiMutation = trpc.taskCenter.addKpiEntry.useMutation({
    onSuccess: () => {
      toast.success("KPI entry added");
    },
  });

  // IMPORTANT: useMemo must be called before any early returns to satisfy React's Rules of Hooks (fix for error #310)
  const targets = useMemo(() => {
    if (roleTab !== "admin" || !teamMembers || teamMembers.length === 0) {
      return ROLE_TAB_CONFIG[roleTab].kpiTargets;
    }
    const lmCount = teamMembers.filter(m => m.teamRole === "lead_manager" && m.ghlUserId).length || 1;
    const amCount = teamMembers.filter(m => m.teamRole === "acquisition_manager" && m.ghlUserId).length || 1;
    return {
      calls: (lmCount * LM_KPI_PER_PERSON.calls) + (amCount * AM_KPI_PER_PERSON.calls),
      convos: lmCount * LM_KPI_PER_PERSON.convos,
      apts: lmCount * LM_KPI_PER_PERSON.apts,
      offers: amCount * AM_KPI_PER_PERSON.offers,
      contracts: amCount * AM_KPI_PER_PERSON.contracts,
    };
  }, [roleTab, teamMembers]);

  if (isLoading) {
    return (
      <div className="flex gap-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!kpi) return null;

  const kpiItems = [
    {
      label: "Calls",
      value: kpi.calls,
      target: targets.calls,
      icon: Phone,
      type: "call" as const,
    },
    {
      label: "Convos",
      value: kpi.conversations,
      target: targets.convos,
      icon: MessageCircle,
      type: "conversation" as const,
    },
    {
      label: "Apts",
      value: kpi.appointments,
      target: targets.apts,
      icon: CalendarDays,
      type: "appointment" as const,
    },
    {
      label: "Offers",
      value: kpi.offers,
      target: targets.offers,
      icon: Target,
      type: "offer" as const,
    },
    {
      label: "Contracts",
      value: kpi.contracts,
      target: targets.contracts,
      icon: FileText,
      type: "contract" as const,
    },
  ].filter(item => item.target > 0 || roleTab === "admin");

  const colorMap = {
    green: { bg: "rgba(22,163,74,0.12)", text: "#22c55e", border: "rgba(22,163,74,0.25)" },
    yellow: { bg: "rgba(234,179,8,0.12)", text: "#eab308", border: "rgba(234,179,8,0.25)" },
    red: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", border: "rgba(239,68,68,0.25)" },
  };

  function getColor(current: number, target: number): "green" | "yellow" | "red" {
    if (target === 0) return current > 0 ? "green" : "yellow";
    if (current >= target) return "green";
    const ratio = current / target;
    if (ratio >= 0.5) return "yellow";
    return "red";
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {kpiItems.map((item) => {
        const c = colorMap[getColor(item.value, item.target)];
        const Icon = item.icon;
        const pct = item.target > 0 ? Math.min(100, Math.round((item.value / item.target) * 100)) : 0;
        return (
          <div
            key={item.label}
            className="flex-1 min-w-[100px] rounded-lg px-3 py-2.5 relative overflow-hidden group cursor-pointer"
            style={{
              background: "var(--g-bg-card)",
              border: `1px solid ${c.border}`,
            }}
            onClick={() => {
              if (!kpi.date) return;
              addKpiMutation.mutate({
                date: kpi.date,
                kpiType: item.type,
              });
            }}
          >
            {/* Progress bar background */}
            <div
              className="absolute bottom-0 left-0 h-1 transition-all duration-500"
              style={{ width: `${pct}%`, background: c.text, opacity: 0.6 }}
            />
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" style={{ color: c.text }} />
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--g-text-tertiary)" }}>
                  {item.label}
                </span>
              </div>
              <Plus className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--g-text-tertiary)" }} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums" style={{ color: c.text }}>
                {item.value}
              </span>
              <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                / {item.target}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── LEFT PANEL: MISSED/UNREAD + APPOINTMENTS ───────────

function LeftPanel({ roleTab, roleFilteredGhlUserIds, teamMembers: teamMembersList }: { roleTab: RoleTab; roleFilteredGhlUserIds: string[] | null; teamMembers?: TeamMember[] }) {
  const [activeTab, setActiveTab] = useState<"unread" | "appointments">("unread");

  // ─── Inbox SMS Modal State ───
  const [inboxSmsOpen, setInboxSmsOpen] = useState(false);
  const [inboxSmsContact, setInboxSmsContact] = useState<{ contactId: string; contactName: string; contactPhone: string } | null>(null);
  const [inboxSmsMessage, setInboxSmsMessage] = useState("");
  const [inboxSmsFromGhlUserId, setInboxSmsFromGhlUserId] = useState("");
  const [inboxSmsFromOpen, setInboxSmsFromOpen] = useState(false);
  const [inboxSmsScheduleMode, setInboxSmsScheduleMode] = useState<"now" | "later">("now");
  const [inboxSmsScheduleDate, setInboxSmsScheduleDate] = useState("");
  const [inboxSmsScheduleTime, setInboxSmsScheduleTime] = useState("");

  const { data: userPhoneInfo } = trpc.taskCenter.getUserPhoneInfo.useQuery();

  const sendSmsMutation = trpc.taskCenter.sendSms.useMutation({
    onSuccess: (data: any) => {
      if (data?.scheduled) {
        toast.success(`SMS scheduled for ${new Date(data.scheduledAt).toLocaleString()}`);
      } else {
        toast.success(`SMS sent to ${inboxSmsContact?.contactName || "contact"}`);
      }
      setInboxSmsOpen(false);
      setInboxSmsMessage("");
      setInboxSmsFromGhlUserId("");
      setInboxSmsScheduleMode("now");
      setInboxSmsScheduleDate("");
      setInboxSmsScheduleTime("");
    },
    onError: (err) => toast.error("Failed to send SMS", { description: err.message }),
  });

  const getSenderInfo = (ghlUserId: string) => {
    if (!ghlUserId || !userPhoneInfo?.teamMembers) {
      return { name: userPhoneInfo?.userName || "You", phone: userPhoneInfo?.userPhone || null };
    }
    const member = userPhoneInfo.teamMembers.find((m: any) => m.ghlUserId === ghlUserId);
    if (member) return { name: member.name, phone: member.lcPhone };
    return { name: userPhoneInfo?.userName || "You", phone: userPhoneInfo?.userPhone || null };
  };

  const handleTextContact = (contactId: string, contactName: string, contactPhone: string) => {
    setInboxSmsContact({ contactId, contactName, contactPhone });
    setInboxSmsMessage("");
    setInboxSmsFromGhlUserId("");
    setInboxSmsScheduleMode("now");
    setInboxSmsOpen(true);
  };

  // Fetch all unread conversations (we filter client-side for multi-user role tabs)
  const { data: allUnreadConvos, isLoading: unreadLoading } = trpc.taskCenter.getUnreadConversations.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );

  const { data: allAppointments, isLoading: aptsLoading } = trpc.taskCenter.getTodayAppointments.useQuery(
    undefined,
    { refetchInterval: 120000 }
  );

  // Build a set of phone numbers for the selected role tab
  const rolePhoneNumbers = useMemo(() => {
    if (roleTab === "admin" || !teamMembersList) return null; // null = show all
    const allowedRoles = ROLE_TAB_CONFIG[roleTab].teamRoles;
    const phones = new Set<string>();
    for (const m of teamMembersList) {
      if (!m.teamRole || !allowedRoles.includes(m.teamRole)) continue;
      // Parse lcPhones JSON array
      if (m.lcPhones) {
        try {
          const parsed = JSON.parse(m.lcPhones) as string[];
          parsed.forEach(p => phones.add(p));
        } catch { /* skip */ }
      }
    }
    return phones;
  }, [roleTab, teamMembersList]);

  // Filter by role tab — admin sees all, LM/AM sees only conversations matching their team phones
  const unreadConvos = useMemo(() => {
    if (!allUnreadConvos) return [];
    if (!rolePhoneNumbers) return allUnreadConvos; // admin = show all
    return allUnreadConvos.filter(c => {
      // Primary filter: match by teamPhone (the LC phone the lead contacted)
      if (c.teamPhone && rolePhoneNumbers.has(c.teamPhone)) return true;
      // Fallback: if no teamPhone data, use assignedTo
      if (!c.teamPhone && c.assignedTo && roleFilteredGhlUserIds) {
        return roleFilteredGhlUserIds.includes(c.assignedTo);
      }
      return false;
    });
  }, [allUnreadConvos, rolePhoneNumbers, roleFilteredGhlUserIds]);
  const appointments = useMemo(() => {
    if (!allAppointments) return [];
    if (!roleFilteredGhlUserIds) return allAppointments; // admin = show all
    return allAppointments.filter(apt => {
      if (!apt.assignedUserId) return true; // show unassigned to everyone
      return roleFilteredGhlUserIds.includes(apt.assignedUserId);
    });
  }, [allAppointments, roleFilteredGhlUserIds]);

  const missedCalls = useMemo(() => (unreadConvos || []).filter(c => c.isMissedCall), [unreadConvos]);
  const unreadMessages = useMemo(() => (unreadConvos || []).filter(c => !c.isMissedCall), [unreadConvos]);

  // Build phone → member first name mapping for inbox labels
  const phoneToMemberName = useMemo(() => {
    const map = new Map<string, string>();
    if (!teamMembersList) return map;
    for (const m of teamMembersList) {
      if (!m.lcPhones) continue;
      try {
        const parsed = JSON.parse(m.lcPhones) as string[];
        const firstName = m.name.split(" ")[0];
        parsed.forEach(p => map.set(p, firstName));
      } catch { /* skip */ }
    }
    return map;
  }, [teamMembersList]);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: "var(--g-bg-card)",
        border: "1px solid var(--g-border-subtle)",
        boxShadow: "var(--g-shadow-card)",
        height: "100%",
      }}
    >
      {/* Tab header */}
      <div className="flex border-b" style={{ borderColor: "var(--g-border-subtle)" }}>
        <button
          className="flex-1 px-3 py-2.5 text-xs font-semibold transition-all relative"
          style={{
            color: activeTab === "unread" ? "var(--g-accent-text)" : "var(--g-text-tertiary)",
            background: activeTab === "unread" ? "var(--g-accent-soft)" : "transparent",
          }}
          onClick={() => setActiveTab("unread")}
        >
          <div className="flex items-center justify-center gap-1.5">
            <PhoneIncoming className="h-3.5 w-3.5" />
            Inbox
            {(unreadConvos?.length || 0) > 0 && (
              <Badge className="h-4 px-1 text-[10px] font-bold" style={{ background: "var(--g-accent)", color: "white", border: "none" }}>
                {unreadConvos?.length}
              </Badge>
            )}
          </div>
        </button>
        <button
          className="flex-1 px-3 py-2.5 text-xs font-semibold transition-all"
          style={{
            color: activeTab === "appointments" ? "var(--g-accent-text)" : "var(--g-text-tertiary)",
            background: activeTab === "appointments" ? "var(--g-accent-soft)" : "transparent",
          }}
          onClick={() => setActiveTab("appointments")}
        >
          <div className="flex items-center justify-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Today
            {(appointments?.length || 0) > 0 && (
              <Badge className="h-4 px-1 text-[10px] font-bold" style={{ background: "oklch(0.65 0.15 250)", color: "white", border: "none" }}>
                {appointments?.length}
              </Badge>
            )}
          </div>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {activeTab === "unread" ? (
          unreadLoading ? (
            <div className="space-y-2 p-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
            </div>
          ) : (
            <>
              {/* Missed calls section */}
              {missedCalls.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <PhoneMissed className="h-3 w-3" style={{ color: "var(--g-accent)" }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--g-accent)" }}>
                      Missed Calls ({missedCalls.length})
                    </span>
                  </div>
                  {missedCalls.map((conv) => (
                    <UnreadConvoItem key={conv.conversationId} conv={conv} onTextContact={handleTextContact} phoneToMemberName={phoneToMemberName} />
                  ))}
                </div>
              )}
              {/* Unread messages */}
              {unreadMessages.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <MessageSquare className="h-3 w-3" style={{ color: "oklch(0.65 0.15 250)" }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "oklch(0.65 0.15 250)" }}>
                      Unread ({unreadMessages.length})
                    </span>
                  </div>
                  {unreadMessages.map((conv) => (
                    <UnreadConvoItem key={conv.conversationId} conv={conv} onTextContact={handleTextContact} phoneToMemberName={phoneToMemberName} />
                  ))}
                </div>
              )}
              {missedCalls.length === 0 && unreadMessages.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-grade-a)", opacity: 0.5 }} />
                  <p className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>
                    All caught up
                  </p>
                </div>
              )}
            </>
          )
        ) : (
          aptsLoading ? (
            <div className="space-y-2 p-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
            </div>
          ) : appointments && appointments.length > 0 ? (
            appointments.map((apt) => (
              <AppointmentItem key={apt.id} apt={apt} />
            ))
          ) : (
            <div className="text-center py-8">
              <CalendarDays className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-text-tertiary)", opacity: 0.4 }} />
              <p className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>
                No appointments today
              </p>
            </div>
          )
        )}
      </div>
      {/* Inbox SMS Dialog */}
      <Dialog open={inboxSmsOpen} onOpenChange={(open) => {
        setInboxSmsOpen(open);
        if (!open) { setInboxSmsFromGhlUserId(""); setInboxSmsFromOpen(false); setInboxSmsScheduleMode("now"); setInboxSmsScheduleDate(""); setInboxSmsScheduleTime(""); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send SMS to {inboxSmsContact?.contactName || "Contact"}</DialogTitle>
            <DialogDescription>Choose sender, recipient, and when to send.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
              <div>
                <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>From</Label>
                <Popover open={inboxSmsFromOpen} onOpenChange={setInboxSmsFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-auto py-2 text-left">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{getSenderInfo(inboxSmsFromGhlUserId).name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--g-text-secondary)" }}>
                          {getSenderInfo(inboxSmsFromGhlUserId).phone ? formatPhone(getSenderInfo(inboxSmsFromGhlUserId).phone!) : "No phone on file"}
                        </div>
                      </div>
                      <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search team members..." />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No team members found.</CommandEmpty>
                        <CommandGroup>
                          {(userPhoneInfo?.teamMembers || []).map((m: any) => (
                            <CommandItem key={m.ghlUserId} value={m.name} onSelect={() => { setInboxSmsFromGhlUserId(m.ghlUserId); setInboxSmsFromOpen(false); }}>
                              <Check className={`mr-2 h-4 w-4 ${inboxSmsFromGhlUserId === m.ghlUserId ? "opacity-100" : "opacity-0"}`} />
                              <div>
                                <div className="text-sm">{m.name}</div>
                                <div className="text-xs" style={{ color: "var(--g-text-secondary)" }}>{m.lcPhone ? formatPhone(m.lcPhone) : "No phone"}</div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center pt-6">
                <ArrowRight className="h-5 w-5" style={{ color: "var(--g-text-tertiary)" }} />
              </div>
              <div>
                <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>To</Label>
                <div className="rounded-lg p-2 h-auto" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <div className="font-semibold text-sm truncate" style={{ color: "var(--g-text-primary)" }}>{inboxSmsContact?.contactName || "Contact"}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--g-text-secondary)" }}>
                    {inboxSmsContact?.contactPhone ? formatPhone(inboxSmsContact.contactPhone) : "No phone on file"}
                  </div>
                </div>
              </div>
            </div>
            <Textarea placeholder="Type your message..." value={inboxSmsMessage} onChange={(e) => setInboxSmsMessage(e.target.value)} rows={3} />
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant={inboxSmsScheduleMode === "now" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setInboxSmsScheduleMode("now")}>Send Now</Button>
                <Button variant={inboxSmsScheduleMode === "later" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setInboxSmsScheduleMode("later")}>
                  <Clock className="h-3.5 w-3.5 mr-1.5" /> Schedule for Later
                </Button>
              </div>
              {inboxSmsScheduleMode === "later" && (
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs mb-1 block">Date</Label><Input type="date" value={inboxSmsScheduleDate} onChange={(e) => setInboxSmsScheduleDate(e.target.value)} /></div>
                  <div><Label className="text-xs mb-1 block">Time</Label><Input type="time" value={inboxSmsScheduleTime} onChange={(e) => setInboxSmsScheduleTime(e.target.value)} /></div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInboxSmsOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!inboxSmsContact) return;
              const mutationInput: any = { contactId: inboxSmsContact.contactId, message: inboxSmsMessage };
              if (inboxSmsFromGhlUserId) mutationInput.fromGhlUserId = inboxSmsFromGhlUserId;
              if (inboxSmsScheduleMode === "later" && inboxSmsScheduleDate && inboxSmsScheduleTime) {
                mutationInput.scheduledAt = new Date(`${inboxSmsScheduleDate}T${inboxSmsScheduleTime}`).toISOString();
              }
              sendSmsMutation.mutate(mutationInput);
            }} disabled={!inboxSmsMessage.trim() || sendSmsMutation.isPending || (inboxSmsScheduleMode === "later" && (!inboxSmsScheduleDate || !inboxSmsScheduleTime))}>
              {sendSmsMutation.isPending ? "Sending..." : inboxSmsScheduleMode === "later" ? "Schedule SMS" : "Send Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnreadConvoItem({ conv, onTextContact, phoneToMemberName }: { conv: any; onTextContact: (contactId: string, contactName: string, contactPhone: string) => void; phoneToMemberName?: Map<string, string> }) {
  const memberName = phoneToMemberName && conv.teamPhone ? phoneToMemberName.get(conv.teamPhone) : undefined;
  const [expanded, setExpanded] = useState(false);

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (conv.contactPhone) {
      window.open(`tel:${conv.contactPhone}`, "_self");
    } else {
      toast.info("No phone number available");
    }
  };

  const handleText = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (conv.contactId) {
      onTextContact(conv.contactId, conv.contactName || "Unknown", conv.contactPhone || "");
    } else {
      toast.info("No contact ID available");
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(false);
    toast.success(`Dismissed ${conv.contactName || "conversation"}`);
  };

  return (
    <div
      className="rounded-md px-2.5 py-2 transition-colors cursor-pointer"
      style={{ background: expanded ? "var(--g-bg-card-hover)" : "transparent" }}
      onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = "var(--g-bg-card-hover)"; }}
      onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <div
          className="shrink-0 mt-0.5 rounded-full p-1"
          style={{
            background: conv.isMissedCall
              ? "rgba(239,68,68,0.15)"
              : conv.type === "sms"
              ? "rgba(59,130,246,0.12)"
              : "rgba(34,197,94,0.12)",
          }}
        >
          {conv.isMissedCall ? (
            <PhoneMissed className="h-3 w-3" style={{ color: "#ef4444" }} />
          ) : conv.type === "sms" ? (
            <MessageSquare className="h-3 w-3" style={{ color: "oklch(0.65 0.15 250)" }} />
          ) : (
            <Phone className="h-3 w-3" style={{ color: "#22c55e" }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold truncate" style={{ color: "var(--g-text-primary)" }}>
              {conv.contactName || "Unknown"}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              {memberName && (
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "rgba(139, 92, 246, 0.12)",
                    color: "oklch(0.7 0.15 290)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {memberName}'s line
                </span>
              )}
              <span className="text-[10px]" style={{ color: "var(--g-text-tertiary)" }}>
                {timeAgo(conv.lastMessageAt)}
              </span>
            </div>
          </div>
          {conv.lastMessage && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--g-text-secondary)" }}>
              {conv.lastMessage.length > 60 ? conv.lastMessage.slice(0, 60) + "..." : conv.lastMessage}
            </p>
          )}
        </div>
      </div>
      {/* Quick actions on click */}
      {expanded && (
        <div className="flex items-center gap-1.5 mt-2 ml-7">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            style={{ borderColor: "#22c55e", color: "#22c55e" }}
            onClick={handleCall}
          >
            <Phone className="h-2.5 w-2.5" /> Call
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            style={{ borderColor: "oklch(0.65 0.15 250)", color: "oklch(0.65 0.15 250)" }}
            onClick={handleText}
          >
            <MessageSquare className="h-2.5 w-2.5" /> Text
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={handleDismiss}
          >
            <X className="h-2.5 w-2.5" /> Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

function AppointmentItem({ apt }: { apt: any }) {
  const startTime = new Date(apt.startTime);
  const endTime = new Date(apt.endTime);
  const timeStr = startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const endTimeStr = endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const isPast = startTime.getTime() < Date.now();
  const statusColor = apt.status === "confirmed" ? "#22c55e" : apt.status === "showed" ? "#3b82f6" : "#eab308";

  return (
    <div
      className="rounded-md px-2.5 py-2.5 transition-colors"
      style={{
        background: "transparent",
        opacity: isPast ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 text-center min-w-[50px]">
          <div className="text-xs font-bold tabular-nums" style={{ color: "var(--g-text-primary)" }}>
            {timeStr}
          </div>
          <div className="text-[9px]" style={{ color: "var(--g-text-tertiary)" }}>
            {endTimeStr}
          </div>
          <div
            className="text-[9px] font-semibold uppercase mt-0.5 rounded px-1 py-0.5"
            style={{ background: `${statusColor}20`, color: statusColor }}
          >
            {apt.status}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold block truncate" style={{ color: "var(--g-text-primary)" }}>
            {apt.contactName || apt.title}
          </span>
          {apt.contactPhone && (
            <span className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: "var(--g-text-secondary)" }}>
              <Phone className="h-2 w-2 shrink-0" />
              {apt.contactPhone}
            </span>
          )}
          {apt.address && (
            <span className="text-[10px] flex items-center gap-1 mt-0.5 truncate" style={{ color: "var(--g-text-tertiary)" }}>
              <MapPin className="h-2 w-2 shrink-0" />
              {apt.address}
            </span>
          )}
          {apt.calendarName && (
            <span className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>
              <CalendarDays className="h-2 w-2 shrink-0" />
              {apt.calendarName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CATEGORY BADGE ─────────────────────────────────────

const CATEGORY_CONFIG = {
  new_lead: { label: "New Lead", color: "#22c55e", bg: "rgba(34,197,94,0.12)", icon: Star },
  reschedule: { label: "Reschedule", color: "#f97316", bg: "rgba(249,115,22,0.12)", icon: RefreshCw },
  admin: { label: "Admin", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", icon: FileText },
  follow_up: { label: "Follow-Up", color: "#3b82f6", bg: "rgba(59,130,246,0.12)", icon: ArrowUpRight },
};

function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.follow_up;
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: config.bg, color: config.color }}
    >
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}

// ─── AM/PM CALL INDICATORS ──────────────────────────────

function AmPmIndicator({ amDone, pmDone }: { amDone: boolean; pmDone: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5"
              style={{
                background: amDone ? "#22c55e" : "var(--g-bg-inset)",
                border: `1px solid ${amDone ? "#16a34a" : "var(--g-border-subtle)"}`,
              }}
            >
              <Sun className="h-2.5 w-2.5" style={{ color: amDone ? "#fff" : "var(--g-text-tertiary)" }} />
              <span className="text-[9px] font-bold" style={{ color: amDone ? "#fff" : "var(--g-text-tertiary)" }}>AM</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{amDone ? "AM call made \u2705" : "No AM call yet"}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5"
              style={{
                background: pmDone ? "#22c55e" : "var(--g-bg-inset)",
                border: `1px solid ${pmDone ? "#16a34a" : "var(--g-border-subtle)"}`,
              }}
            >
              <Moon className="h-2.5 w-2.5" style={{ color: pmDone ? "#fff" : "var(--g-text-tertiary)" }} />
              <span className="text-[9px] font-bold" style={{ color: pmDone ? "#fff" : "var(--g-text-tertiary)" }}>PM</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{pmDone ? "PM call made \u2705" : "No PM call yet"}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

// ─── AM/PM INDICATOR FROM CACHE ─────────────────────────
// Reads AM/PM data from the tRPC query cache (populated when the task is expanded).
// Falls back to server-provided values (from DB). No extra API calls.

function AmPmIndicatorFromCache({ contactId, fallbackAm, fallbackPm, batchData }: { contactId: string; fallbackAm: boolean; fallbackPm: boolean; batchData?: Record<string, { amCallMade: boolean; pmCallMade: boolean }> }) {
  // Subscribe to the activity cache (populated when task is expanded).
  // enabled: false means we never fire a fetch — we only read from cache.
  const { data: cached } = trpc.taskCenter.getContactActivity.useQuery(
    { contactId },
    { enabled: false }
  );

  // Check batch pre-fetched data (loaded on page load via single DB query)
  const batch = batchData?.[contactId];

  // OR together all sources: if ANY source says a call was made, light up.
  // 1. fallbackAm/Pm = from getPriorityTasks server response (DB query at load time)
  // 2. batch = from batchAmPmStatus (dedicated DB query on page load)
  // 3. cached = from getContactActivity (when task is expanded)
  const amDone = fallbackAm || (batch?.amCallMade ?? false) || (cached?.amCallMade ?? false);
  const pmDone = fallbackPm || (batch?.pmCallMade ?? false) || (cached?.pmCallMade ?? false);
  return <AmPmIndicator amDone={amDone} pmDone={pmDone} />;
}

// ─── PRIORITY TASK ROW ──────────────────────────────────

function PriorityTaskRow({
  task,
  onComplete,
  onEdit,
  onDelete,
  onExpand,
  isExpanded,
  isCompleting,
  allTasks,
  rank,
  batchAmPm,
}: {
  task: Task;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExpand: () => void;
  isExpanded: boolean;
  isCompleting: boolean;
  allTasks: Task[];
  rank: number;
  batchAmPm?: Record<string, { amCallMade: boolean; pmCallMade: boolean }>;
}) {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const dueLabel = (() => {
    if (!dueDate) return "No date";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return "Due Today";
    return `${diffDays}d til due`;
  })();
  const dueLabelColor = task.group === "overdue"
    ? "var(--g-accent)"
    : task.group === "today"
    ? "oklch(0.75 0.15 85)"
    : "var(--g-text-tertiary)";

  const scoreColor = (task.priorityScore || 0) >= 700
    ? "#ef4444"
    : (task.priorityScore || 0) >= 400
    ? "#f97316"
    : (task.priorityScore || 0) >= 200
    ? "#eab308"
    : "var(--g-text-tertiary)";

  return (
    <div
      className="rounded-lg transition-all duration-200"
      style={{
        border: `1px solid ${task.group === "overdue" ? "var(--g-accent)" : "var(--g-border-subtle)"}`,
        background: task.group === "overdue"
          ? "oklch(0.25 0.03 25 / 0.15)"
          : "var(--g-bg-card)",
      }}
    >
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer group"
        onClick={onExpand}
      >
        {/* Rank number */}
        <div
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
          style={{
            background: rank <= 3 ? "var(--g-accent-soft)" : "var(--g-bg-inset)",
            color: rank <= 3 ? "var(--g-accent-text)" : "var(--g-text-tertiary)",
            border: rank <= 3 ? "1px solid var(--g-accent-medium)" : "1px solid var(--g-border-subtle)",
          }}
        >
          {rank}
        </div>

        {/* Complete button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all group/check"
                style={{
                  borderColor: isCompleting ? "oklch(0.7 0.15 150)" : "var(--g-text-tertiary)",
                  background: isCompleting ? "oklch(0.7 0.15 150 / 0.15)" : "transparent",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isCompleting) onComplete();
                }}
                disabled={isCompleting}
                onMouseEnter={(e) => {
                  if (!isCompleting) {
                    e.currentTarget.style.borderColor = "oklch(0.7 0.15 150)";
                    e.currentTarget.style.background = "oklch(0.7 0.15 150 / 0.15)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCompleting) {
                    e.currentTarget.style.borderColor = "var(--g-text-tertiary)";
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                {isCompleting ? (
                  <RefreshCw className="h-3 w-3 animate-spin text-white" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 opacity-0 group-hover/check:opacity-60 transition-opacity" style={{ color: "oklch(0.7 0.15 150)" }} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Mark as complete</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Task info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {task.category && <CategoryBadge category={task.category} />}
            <span className="font-medium text-sm truncate" style={{ color: "var(--g-text-primary)" }}>
              {task.title}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "var(--g-text-secondary)" }}>
            {task.contactId && (
              <span className="font-medium" style={{ color: "var(--g-text-primary)", opacity: 0.7 }}>
                {task.contactName || "Contact"}
              </span>
            )}
            {task.contactAddress && (
              <span className="truncate max-w-[200px]" title={task.contactAddress}>
                {task.contactAddress}
              </span>
            )}
            {task.assignedMemberName && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {task.assignedMemberName}
              </span>
            )}
          </div>
        </div>

        {/* AM/PM indicators — uses cached activity data from tRPC query cache */}
        <AmPmIndicatorFromCache contactId={task.contactId} fallbackAm={task.amCallMade || false} fallbackPm={task.pmCallMade || false} batchData={batchAmPm} />

        {/* Priority score */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="shrink-0 text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
                style={{ color: scoreColor, background: `${scoreColor}15` }}
              >
                {task.priorityScore || 0}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Priority score — higher = work first</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Due label */}
        <div className="shrink-0 w-[90px] text-right">
          <span
            className="text-xs font-semibold"
            style={{ color: dueLabelColor }}
          >
            {dueLabel}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
                  style={{ color: "var(--g-text-tertiary)" }}
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--g-bg-card)"; e.currentTarget.style.color = "var(--g-text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--g-text-tertiary)"; }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Edit task</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
                  style={{ color: "var(--g-text-tertiary)" }}
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(0.25 0.03 25 / 0.5)"; e.currentTarget.style.color = "var(--g-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--g-text-tertiary)"; }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Delete task</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Expanded section */}
      {isExpanded && <TaskExpandedSection task={task} allTasks={allTasks} />}
    </div>
  );
}

// ─── EXPANDED SECTION ───────────────────────────────────

function TaskExpandedSection({ task, allTasks }: { task: Task; allTasks: Task[] }) {
  const utils = trpc.useUtils();

  const { data: context, isLoading: contextLoading } = trpc.taskCenter.getTaskContext.useQuery(
    { contactId: task.contactId },
    { enabled: !!task.contactId }
  );

  const { data: userPhoneInfo } = trpc.taskCenter.getUserPhoneInfo.useQuery();

  const { data: todayActivity, isLoading: activityLoading } = trpc.taskCenter.getContactActivity.useQuery(
    { contactId: task.contactId },
    { enabled: !!task.contactId }
  );

  const { data: workflowHistory } = trpc.taskCenter.getContactWorkflowHistory.useQuery(
    { contactId: task.contactId },
    { enabled: !!task.contactId }
  );

  const { data: upcomingActions, isLoading: upcomingLoading } = trpc.taskCenter.getContactUpcomingActions.useQuery(
    { contactId: task.contactId },
    { enabled: !!task.contactId }
  );

  const [activeTab, setActiveTab] = useState<"activity" | "upcoming" | "notes">("activity");

  const contactUpcomingTasks = useMemo(() => {
    if (!task.contactId || !allTasks) return [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return allTasks
      .filter(t =>
        t.contactId === task.contactId &&
        t.id !== task.id &&
        t.dueDate &&
        new Date(t.dueDate) >= now
      )
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 3);
  }, [task.contactId, task.id, allTasks]);

  const allUpcomingItems = useMemo(() => {
    const items: Array<{ id: string; type: string; label: string; detail: string; icon: string }> = [];
    if (upcomingActions) {
      for (const action of upcomingActions) {
        items.push(action);
      }
    }
    for (const upTask of contactUpcomingTasks) {
      const dueDate = upTask.dueDate ? new Date(upTask.dueDate) : null;
      items.push({
        id: `task-${upTask.id}`,
        type: "task",
        label: upTask.title,
        detail: dueDate
          ? `Due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}${upTask.assignedMemberName ? ` · ${upTask.assignedMemberName}` : ""}`
          : upTask.assignedMemberName || "No date",
        icon: "task",
      });
    }
    return items;
  }, [upcomingActions, contactUpcomingTasks]);

  // Quick action states
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showSmsDialog, setShowSmsDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [showAptDialog, setShowAptDialog] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const [smsFromGhlUserId, setSmsFromGhlUserId] = useState<string>("");
  const [smsFromOpen, setSmsFromOpen] = useState(false);
  const [callFromGhlUserId, setCallFromGhlUserId] = useState<string>("");
  const [callFromOpen, setCallFromOpen] = useState(false);
  const [smsToPhone, setSmsToPhone] = useState("");
  const [callToPhone, setCallToPhone] = useState("");
  const [smsScheduleMode, setSmsScheduleMode] = useState<"now" | "later">("now");
  const [smsScheduleDate, setSmsScheduleDate] = useState("");
  const [smsScheduleTime, setSmsScheduleTime] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [workflowAction, setWorkflowAction] = useState<"add" | "remove">("add");
  const [workflowSearchOpen, setWorkflowSearchOpen] = useState(false);
  const [calendarSearchOpen, setCalendarSearchOpen] = useState(false);

  const [aptTitle, setAptTitle] = useState("");
  const [aptDate, setAptDate] = useState("");
  const [aptTime, setAptTime] = useState("");
  const [aptCalendar, setAptCalendar] = useState("");
  const [aptNotes, setAptNotes] = useState("");

  const contactPhone = task.contactPhone || context?.contactPhone || "";

  const getSenderInfo = (ghlUserId: string) => {
    if (!ghlUserId || !userPhoneInfo?.teamMembers) {
      return { name: userPhoneInfo?.userName || "You", phone: userPhoneInfo?.userPhone || null };
    }
    const member = userPhoneInfo.teamMembers.find((m: any) => m.ghlUserId === ghlUserId);
    if (member) return { name: member.name, phone: member.lcPhone };
    return { name: userPhoneInfo?.userName || "You", phone: userPhoneInfo?.userPhone || null };
  };

  const enrolledWorkflows = useMemo(() => {
    if (!workflowHistory || workflowHistory.length === 0) return [];
    const workflowMap = new Map<string, { workflowId: string; workflowName: string; addedAt: string }>();
    const sorted = [...workflowHistory].reverse();
    for (const entry of sorted) {
      if (entry.action === "added") {
        workflowMap.set(entry.workflowId, { workflowId: entry.workflowId, workflowName: entry.workflowName, addedAt: entry.addedAt });
      } else if (entry.action === "removed") {
        workflowMap.delete(entry.workflowId);
      }
    }
    return Array.from(workflowMap.values());
  }, [workflowHistory]);

  // Mutations
  const sendSmsMutation = trpc.taskCenter.sendSms.useMutation({
    onSuccess: (data: any) => {
      if (data?.scheduled) {
        toast.success(`SMS scheduled for ${new Date(data.scheduledAt).toLocaleString()}`);
      } else {
        toast.success(`SMS sent to ${task.contactName || "contact"}`);
      }
      setShowSmsDialog(false);
      setSmsMessage("");
      setSmsFromGhlUserId("");
      setSmsScheduleMode("now");
      setSmsScheduleDate("");
      setSmsScheduleTime("");
    },
    onError: (err) => toast.error("Failed to send SMS", { description: err.message }),
  });

  const addNoteMutation = trpc.taskCenter.addNote.useMutation({
    onSuccess: () => {
      toast.success(`Note added to ${task.contactName || "contact"}`);
      setShowNoteDialog(false);
      setNoteBody("");
      utils.taskCenter.getTaskContext.invalidate({ contactId: task.contactId });
    },
    onError: (err) => toast.error("Failed to add note", { description: err.message }),
  });

  const startWorkflowMutation = trpc.taskCenter.startWorkflow.useMutation({
    onSuccess: () => {
      toast.success(`Workflow started for ${task.contactName || "contact"}`);
      setShowWorkflowDialog(false);
      setSelectedWorkflow("");
      utils.taskCenter.getContactUpcomingActions.invalidate({ contactId: task.contactId });
      utils.taskCenter.getContactWorkflowHistory.invalidate({ contactId: task.contactId });
    },
    onError: (err) => toast.error("Failed to start workflow", { description: err.message }),
  });

  const removeWorkflowMutation = trpc.taskCenter.removeFromWorkflow.useMutation({
    onSuccess: () => {
      toast.success(`Removed from workflow`);
      setShowWorkflowDialog(false);
      setSelectedWorkflow("");
      utils.taskCenter.getContactUpcomingActions.invalidate({ contactId: task.contactId });
      utils.taskCenter.getContactWorkflowHistory.invalidate({ contactId: task.contactId });
    },
    onError: (err) => toast.error("Failed to remove from workflow", { description: err.message }),
  });

  const createAptMutation = trpc.taskCenter.createAppointment.useMutation({
    onSuccess: () => {
      toast.success(`Appointment created for ${task.contactName || "contact"}`);
      setShowAptDialog(false);
      setAptTitle("");
      setAptDate("");
      setAptTime("");
      setAptCalendar("");
      setAptNotes("");
    },
    onError: (err) => toast.error("Failed to create appointment", { description: err.message }),
  });

  const { data: workflows } = trpc.taskCenter.getWorkflows.useQuery(undefined, {
    enabled: showWorkflowDialog,
  });

  const { data: calendars } = trpc.taskCenter.getCalendars.useQuery(undefined, {
    enabled: showAptDialog,
  });

  return (
    <div className="px-4 py-3 space-y-3" style={{ borderTop: "1px solid var(--g-border-subtle)" }}>
      {/* Task description */}
      {task.body && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
          {stripHtml(task.body)}
        </p>
      )}

      {/* Quick Actions Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
          if (task.contactPhone) { setShowCallDialog(true); } else { toast.error("No phone number on file for this contact"); }
        }}>
          <Phone className="h-3.5 w-3.5 mr-1.5" /> Call
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowSmsDialog(true)}>
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Text
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
          setWorkflowAction("add"); setSelectedWorkflow(""); setShowWorkflowDialog(true);
        }}>
          <Zap className="h-3.5 w-3.5 mr-1.5" /> Update Workflow
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
          setAptTitle(`Appointment with ${task.contactName || "Contact"}`);
          setAptDate(""); setAptTime(""); setAptCalendar(""); setAptNotes(""); setShowAptDialog(true);
        }}>
          <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Create Apt
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowNoteDialog(true)}>
          <StickyNote className="h-3.5 w-3.5 mr-1.5" /> Add Note
        </Button>
      </div>

      {/* Contact Info Line */}
      <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: "var(--g-text-tertiary)" }}>
        {contactPhone && (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {formatPhone(contactPhone)}
          </span>
        )}
        {(task.contactEmail || context?.contactEmail) && (
          <span>{task.contactEmail || context?.contactEmail}</span>
        )}
        {todayActivity?.contactTimezone && (
          <span className="flex items-center gap-1" title={`Contact timezone: ${todayActivity.contactTimezone}`}>
            <Clock className="h-3 w-3" />
            {(() => {
              try {
                const now = new Date();
                const localTime = now.toLocaleTimeString("en-US", {
                  timeZone: todayActivity.contactTimezone,
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true
                });
                const tzAbbr = now.toLocaleTimeString("en-US", {
                  timeZone: todayActivity.contactTimezone,
                  timeZoneName: "short"
                }).split(" ").pop();
                return `${localTime} ${tzAbbr}`;
              } catch {
                return todayActivity.contactTimezone;
              }
            })()}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--g-bg-inset)" }}>
        {(["activity", "upcoming", "notes"] as const).map((tab) => (
          <button
            key={tab}
            className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: activeTab === tab ? "var(--g-bg-card)" : "transparent",
              color: activeTab === tab ? "var(--g-text-primary)" : "var(--g-text-tertiary)",
              boxShadow: activeTab === tab ? "0 1px 2px rgba(0,0,0,0.15)" : "none",
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "activity" ? "Today's Activity" : tab === "upcoming" ? `Upcoming${allUpcomingItems.length > 0 ? ` (${allUpcomingItems.length})` : ""}` : "Notes & Calls"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "activity" ? (
        <div className="space-y-3">
          {activityLoading ? (
            <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
          ) : todayActivity ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <MessageSquare className="h-3 w-3" style={{ color: "oklch(0.65 0.15 250)" }} />
                  {todayActivity.smsSent} SMS
                </div>
                <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <Phone className="h-3 w-3" style={{ color: "oklch(0.7 0.15 150)" }} />
                  {todayActivity.callsMade} {todayActivity.callsMade === 1 ? "Call" : "Calls"}
                </div>
                <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <FileText className="h-3 w-3" style={{ color: "oklch(0.75 0.15 85)" }} />
                  {todayActivity.emailsSent} {todayActivity.emailsSent === 1 ? "Email" : "Emails"}
                </div>
              </div>
              {todayActivity.messages.length > 0 ? (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {todayActivity.messages.map((msg: any) => (
                    <div key={msg.id} className="rounded-md px-3 py-2 flex items-start gap-2" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                      <div className="shrink-0 mt-0.5">
                        {msg.type === "sms" ? <MessageSquare className="h-3 w-3" style={{ color: "oklch(0.65 0.15 250)" }} /> :
                         msg.type === "call" ? <Phone className="h-3 w-3" style={{ color: "oklch(0.7 0.15 150)" }} /> :
                         <FileText className="h-3 w-3" style={{ color: "oklch(0.75 0.15 85)" }} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: "var(--g-text-primary)" }}>
                            {msg.type.toUpperCase()} {msg.direction === "inbound" ? "↓" : "↑"}
                          </span>
                          <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                            {new Date(msg.dateAdded).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        {msg.body && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--g-text-secondary)" }}>
                            {msg.body.length > 120 ? msg.body.slice(0, 120) + "..." : msg.body}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: "var(--g-text-tertiary)" }}>
                  No activity recorded for this contact today.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-center py-4" style={{ color: "var(--g-text-tertiary)" }}>
              Unable to load activity data.
            </p>
          )}
        </div>
      ) : activeTab === "notes" ? (
        <div className="space-y-3">
          {contextLoading ? (
            <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
          ) : context ? (
            <>
              {context.lastCallSummary && (
                <div className="rounded-md p-3" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileText className="h-3.5 w-3.5" style={{ color: "oklch(0.65 0.15 250)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--g-text-primary)" }}>Last Call Summary</span>
                    {context.lastCallGrade && (
                      <Badge className="text-xs h-4" style={{ background: "var(--g-bg-card)", color: "var(--g-text-secondary)", border: "1px solid var(--g-border-subtle)" }}>
                        {context.lastCallGrade}
                      </Badge>
                    )}
                    {context.lastCallDate && (
                      <span className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                        {new Date(context.lastCallDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--g-text-secondary)" }}>
                    {context.lastCallSummary.length > 300 ? context.lastCallSummary.slice(0, 300) + "..." : context.lastCallSummary}
                  </p>
                  {context.lastCallId && (
                    <a href={`/calls/${context.lastCallId}`} className="text-xs mt-1.5 inline-flex items-center gap-1 hover:underline" style={{ color: "oklch(0.65 0.15 250)" }}>
                      View full call <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
              {context.recentNotes && context.recentNotes.length > 0 ? (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {context.recentNotes.slice(0, 5).map((note: { id: string; body: string; dateAdded: string }) => (
                    <div key={note.id} className="rounded-md px-3 py-2" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                      <p className="text-xs" style={{ color: "var(--g-text-secondary)" }}>
                        {note.body.length > 200 ? note.body.slice(0, 200) + "..." : note.body}
                      </p>
                      {note.dateAdded && (
                        <span className="text-xs mt-1 block" style={{ color: "var(--g-text-tertiary)" }}>
                          {new Date(note.dateAdded).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: "var(--g-text-tertiary)" }}>
                  No recent notes for this contact.
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : activeTab === "upcoming" ? (
        <div className="space-y-3">
          {upcomingLoading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : allUpcomingItems.length > 0 ? (
            <div className="space-y-1.5">
              {allUpcomingItems.map((item) => {
                const iconColor = item.icon === "workflow" ? "oklch(0.7 0.18 300)"
                  : item.icon === "sms" ? "oklch(0.65 0.15 250)"
                  : item.icon === "email" ? "oklch(0.75 0.15 85)"
                  : "oklch(0.7 0.15 150)";
                const IconComponent = item.icon === "workflow" ? GitBranch
                  : item.icon === "sms" ? MessageSquare
                  : item.icon === "email" ? Mail
                  : CalendarDays;
                const typeBadge = item.type === "workflow" ? "Workflow"
                  : item.type === "scheduled_sms" ? "SMS"
                  : item.type === "task" ? "Task"
                  : "Action";
                return (
                  <div key={item.id} className="rounded-md px-3 py-2.5 flex items-start gap-3" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                    <div className="shrink-0 mt-0.5 rounded-full p-1.5" style={{ background: `color-mix(in oklch, ${iconColor} 15%, transparent)` }}>
                      <IconComponent className="h-3.5 w-3.5" style={{ color: iconColor }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `color-mix(in oklch, ${iconColor} 12%, transparent)`, color: iconColor }}>
                        {typeBadge}
                      </span>
                      <p className="text-xs font-medium mt-1" style={{ color: "var(--g-text-primary)" }}>{item.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <Timer className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-text-tertiary)", opacity: 0.5 }} />
              <p className="text-xs font-medium" style={{ color: "var(--g-text-tertiary)" }}>No upcoming actions for this contact</p>
            </div>
          )}
        </div>
      ) : null}

      {/* Call Confirmation Dialog */}
      <Dialog open={showCallDialog} onOpenChange={(open) => {
        setShowCallDialog(open);
        if (!open) { setCallFromGhlUserId(""); setCallFromOpen(false); setCallToPhone(""); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Call {task.contactName || "Contact"}</DialogTitle>
            <DialogDescription>Confirm call details before dialing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>From</Label>
              <Popover open={callFromOpen} onOpenChange={setCallFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-auto py-2">
                    <div className="text-left">
                      <div className="font-semibold text-sm">{getSenderInfo(callFromGhlUserId).name}</div>
                      <div className="text-xs" style={{ color: "var(--g-text-secondary)" }}>
                        {getSenderInfo(callFromGhlUserId).phone ? formatPhone(getSenderInfo(callFromGhlUserId).phone!) : "No phone on file"}
                      </div>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search team members..." />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No team members found.</CommandEmpty>
                      <CommandGroup>
                        {(userPhoneInfo?.teamMembers || []).map((m: any) => (
                          <CommandItem key={m.ghlUserId} value={m.name} onSelect={() => { setCallFromGhlUserId(m.ghlUserId); setCallFromOpen(false); }}>
                            <Check className={`mr-2 h-4 w-4 ${callFromGhlUserId === m.ghlUserId ? "opacity-100" : "opacity-0"}`} />
                            <div>
                              <div className="text-sm">{m.name}</div>
                              <div className="text-xs" style={{ color: "var(--g-text-secondary)" }}>{m.lcPhone ? formatPhone(m.lcPhone) : "No phone"}</div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex justify-center">
              <ArrowRight className="h-5 w-5 rotate-90" style={{ color: "var(--g-text-tertiary)" }} />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>To</Label>
              <div className="rounded-lg p-2" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                <div className="font-semibold text-sm" style={{ color: "var(--g-text-primary)" }}>{task.contactName || "Contact"}</div>
                <Input className="mt-1 h-7 text-xs bg-transparent border-dashed" placeholder="Enter phone number..."
                  value={callToPhone || (contactPhone ? formatPhone(contactPhone) : "")}
                  onChange={(e) => setCallToPhone(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCallDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              const dialNumber = callToPhone || contactPhone;
              if (dialNumber) { window.open(`tel:${dialNumber.replace(/[^\d+]/g, "")}`, "_self"); }
              setShowCallDialog(false);
            }} disabled={!callToPhone && !contactPhone}>
              <Phone className="h-4 w-4 mr-1.5" /> Call Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <Dialog open={showSmsDialog} onOpenChange={(open) => {
        setShowSmsDialog(open);
        if (!open) { setSmsFromGhlUserId(""); setSmsFromOpen(false); setSmsToPhone(""); setSmsScheduleMode("now"); setSmsScheduleDate(""); setSmsScheduleTime(""); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send SMS to {task.contactName || "Contact"}</DialogTitle>
            <DialogDescription>Choose sender, recipient, and when to send.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
              <div>
                <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>From</Label>
                <Popover open={smsFromOpen} onOpenChange={setSmsFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-auto py-2 text-left">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{getSenderInfo(smsFromGhlUserId).name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--g-text-secondary)" }}>
                          {getSenderInfo(smsFromGhlUserId).phone ? formatPhone(getSenderInfo(smsFromGhlUserId).phone!) : "No phone on file"}
                        </div>
                      </div>
                      <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search team members..." />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No team members found.</CommandEmpty>
                        <CommandGroup>
                          {(userPhoneInfo?.teamMembers || []).map((m: any) => (
                            <CommandItem key={m.ghlUserId} value={m.name} onSelect={() => { setSmsFromGhlUserId(m.ghlUserId); setSmsFromOpen(false); }}>
                              <Check className={`mr-2 h-4 w-4 ${smsFromGhlUserId === m.ghlUserId ? "opacity-100" : "opacity-0"}`} />
                              <div>
                                <div className="text-sm">{m.name}</div>
                                <div className="text-xs" style={{ color: "var(--g-text-secondary)" }}>{m.lcPhone ? formatPhone(m.lcPhone) : "No phone"}</div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center pt-6">
                <ArrowRight className="h-5 w-5" style={{ color: "var(--g-text-tertiary)" }} />
              </div>
              <div>
                <Label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--g-text-tertiary)" }}>To</Label>
                <div className="rounded-lg p-2 h-auto" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                  <div className="font-semibold text-sm truncate" style={{ color: "var(--g-text-primary)" }}>{task.contactName || "Contact"}</div>
                  <Input className="mt-1 h-7 text-xs bg-transparent border-dashed" placeholder="Enter phone number..."
                    value={smsToPhone || (contactPhone ? formatPhone(contactPhone) : "")}
                    onChange={(e) => setSmsToPhone(e.target.value)} />
                </div>
              </div>
            </div>
            <Textarea placeholder="Type your message..." value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} rows={3} />
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant={smsScheduleMode === "now" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setSmsScheduleMode("now")}>Send Now</Button>
                <Button variant={smsScheduleMode === "later" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setSmsScheduleMode("later")}>
                  <Clock className="h-3.5 w-3.5 mr-1.5" /> Schedule for Later
                </Button>
              </div>
              {smsScheduleMode === "later" && (
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs mb-1 block">Date</Label><Input type="date" value={smsScheduleDate} onChange={(e) => setSmsScheduleDate(e.target.value)} /></div>
                  <div><Label className="text-xs mb-1 block">Time</Label><Input type="time" value={smsScheduleTime} onChange={(e) => setSmsScheduleTime(e.target.value)} /></div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmsDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              const mutationInput: any = { contactId: task.contactId, message: smsMessage };
              if (smsFromGhlUserId) mutationInput.fromGhlUserId = smsFromGhlUserId;
              if (smsScheduleMode === "later" && smsScheduleDate && smsScheduleTime) {
                mutationInput.scheduledAt = new Date(`${smsScheduleDate}T${smsScheduleTime}`).toISOString();
              }
              sendSmsMutation.mutate(mutationInput);
            }} disabled={!smsMessage.trim() || sendSmsMutation.isPending || (smsScheduleMode === "later" && (!smsScheduleDate || !smsScheduleTime))}>
              {sendSmsMutation.isPending ? "Sending..." : smsScheduleMode === "later" ? "Schedule SMS" : "Send Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Note to {task.contactName || "Contact"}</DialogTitle></DialogHeader>
          <Textarea placeholder="Write a note..." value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>Cancel</Button>
            <Button onClick={() => addNoteMutation.mutate({ contactId: task.contactId, body: noteBody })}
              disabled={!noteBody.trim() || addNoteMutation.isPending}>
              {addNoteMutation.isPending ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow Dialog */}
      <Dialog open={showWorkflowDialog} onOpenChange={setShowWorkflowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Workflow for {task.contactName || "Contact"}</DialogTitle>
            <DialogDescription>Add this contact to a workflow or remove them from one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={workflowAction === "add" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => { setWorkflowAction("add"); setSelectedWorkflow(""); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add to Workflow
              </Button>
              <Button variant={workflowAction === "remove" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => { setWorkflowAction("remove"); setSelectedWorkflow(""); }}>
                <Minus className="h-3.5 w-3.5 mr-1.5" /> Remove from Workflow
              </Button>
            </div>
            {workflowAction === "remove" && enrolledWorkflows.length === 0 ? (
              <div className="rounded-md p-4 text-center" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
                <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>No workflows found for this contact.</p>
              </div>
            ) : (
              <Popover open={workflowSearchOpen} onOpenChange={setWorkflowSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={workflowSearchOpen} className="w-full justify-between font-normal">
                    {selectedWorkflow
                      ? (workflowAction === "remove"
                          ? (enrolledWorkflows.find(w => w.workflowId === selectedWorkflow)?.workflowName || "Select a workflow...")
                          : (workflows?.find((w: { id: string; name: string }) => w.id === selectedWorkflow)?.name || "Select a workflow..."))
                      : "Select a workflow..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search workflows..." />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No workflows found.</CommandEmpty>
                      <CommandGroup>
                        {workflowAction === "remove" ? (
                          enrolledWorkflows.map(w => (
                            <CommandItem key={w.workflowId} value={w.workflowName} onSelect={() => { setSelectedWorkflow(w.workflowId); setWorkflowSearchOpen(false); }}>
                              <Check className={`mr-2 h-4 w-4 ${selectedWorkflow === w.workflowId ? "opacity-100" : "opacity-0"}`} />
                              {w.workflowName}
                            </CommandItem>
                          ))
                        ) : (
                          (workflows || []).map((w: { id: string; name: string }) => (
                            <CommandItem key={w.id} value={w.name} onSelect={() => { setSelectedWorkflow(w.id); setWorkflowSearchOpen(false); }}>
                              <Check className={`mr-2 h-4 w-4 ${selectedWorkflow === w.id ? "opacity-100" : "opacity-0"}`} />
                              {w.name}
                            </CommandItem>
                          ))
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkflowDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (workflowAction === "add") {
                const wfName = workflows?.find((w: { id: string; name: string }) => w.id === selectedWorkflow)?.name;
                startWorkflowMutation.mutate({ contactId: task.contactId, workflowId: selectedWorkflow, workflowName: wfName || undefined, contactName: task.contactName || undefined });
              } else {
                const wfName = enrolledWorkflows.find(w => w.workflowId === selectedWorkflow)?.workflowName;
                removeWorkflowMutation.mutate({ contactId: task.contactId, workflowId: selectedWorkflow, workflowName: wfName || undefined, contactName: task.contactName || undefined });
              }
            }} disabled={!selectedWorkflow || startWorkflowMutation.isPending || removeWorkflowMutation.isPending}
              variant={workflowAction === "remove" ? "destructive" : "default"}>
              {(startWorkflowMutation.isPending || removeWorkflowMutation.isPending)
                ? (workflowAction === "add" ? "Adding..." : "Removing...")
                : (workflowAction === "add" ? "Add to Workflow" : "Remove from Workflow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Appointment Dialog */}
      <Dialog open={showAptDialog} onOpenChange={setShowAptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Appointment</DialogTitle>
            <DialogDescription>Schedule a calendar appointment for {task.contactName || "this contact"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apt-title">Title</Label>
              <Input id="apt-title" value={aptTitle} onChange={(e) => setAptTitle(e.target.value)} placeholder="Appointment title..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="apt-date">Date</Label>
                <Input id="apt-date" type="date" value={aptDate} onChange={(e) => setAptDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-time">Time</Label>
                <Input id="apt-time" type="time" value={aptTime} onChange={(e) => setAptTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Calendar</Label>
              <Popover open={calendarSearchOpen} onOpenChange={setCalendarSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={calendarSearchOpen} className="w-full justify-between font-normal">
                    {aptCalendar && calendars
                      ? (calendars.find((c: { id: string; name: string }) => c.id === aptCalendar)?.name || "Select a calendar...")
                      : "Select a calendar..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search calendars..." />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No calendars found.</CommandEmpty>
                      <CommandGroup>
                        {(calendars || []).map((c: { id: string; name: string }) => (
                          <CommandItem key={c.id} value={c.name} onSelect={() => { setAptCalendar(c.id); setCalendarSearchOpen(false); }}>
                            <Check className={`mr-2 h-4 w-4 ${aptCalendar === c.id ? "opacity-100" : "opacity-0"}`} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apt-notes">Notes (optional)</Label>
              <Textarea id="apt-notes" value={aptNotes} onChange={(e) => setAptNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAptDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!aptDate || !aptTime) { toast.error("Please select a date and time"); return; }
              const startTime = new Date(`${aptDate}T${aptTime}:00`).toISOString();
              const endTime = new Date(new Date(`${aptDate}T${aptTime}:00`).getTime() + 60 * 60 * 1000).toISOString();
              createAptMutation.mutate({ contactId: task.contactId, calendarId: aptCalendar, title: aptTitle, startTime, endTime, notes: aptNotes || undefined });
            }} disabled={!aptTitle.trim() || !aptDate || !aptTime || !aptCalendar || createAptMutation.isPending}>
              {createAptMutation.isPending ? "Creating..." : "Create Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── AI COACH PANEL ────────────────────────────────────

type CoachConversationMessage = 
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "action_card"; actionId: number; actionType: string; summary: string; contactName: string; status: "pending" | "confirmed" | "cancelled" | "executed" | "failed"; result?: string; payload?: any; batchIndex?: number; batchTotal?: number; resolvedStage?: { pipelineName: string; stageName: string }; smsDeliveryStatus?: string; smsFromNumber?: string };

const ACTION_TYPE_LABELS: Record<string, string> = {
  add_note: "Add Note", add_note_contact: "Add Note", add_note_opportunity: "Add Note",
  change_pipeline_stage: "Change Pipeline Stage", send_sms: "Send SMS", create_task: "Create Task",
  add_tag: "Add Tag", remove_tag: "Remove Tag", update_field: "Update Field", update_task: "Update Task",
  add_to_workflow: "Add to Workflow", remove_from_workflow: "Remove from Workflow",
  create_appointment: "Create Appointment", update_appointment: "Update Appointment", cancel_appointment: "Cancel Appointment",
};

const ACTION_ICONS: Record<string, string> = {
  add_note: "\u{1F4DD}", add_note_contact: "\u{1F4DD}", add_note_opportunity: "\u{1F4DD}",
  change_pipeline_stage: "\u{1F504}", send_sms: "\u{1F4AC}", create_task: "\u2705",
  add_tag: "\u{1F3F7}\uFE0F", remove_tag: "\u{1F3F7}\uFE0F", update_field: "\u270F\uFE0F",
  update_task: "\u{1F504}", add_to_workflow: "\u26A1", remove_from_workflow: "\u{1F6AB}",
  create_appointment: "\u{1F4C5}", update_appointment: "\u{1F504}", cancel_appointment: "\u274C",
};

function DayHubCoach() {
  const { user: currentUser } = useAuth();
  const { guardAction: guardDemoAction } = useDemo();
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [conversation, setConversation] = useState<CoachConversationMessage[]>([]);
  const [contactSearchResults, setContactSearchResults] = useState<Array<{id: string; name: string; phone?: string; email?: string}>>([]);
  const [pendingAction, setPendingAction] = useState<{intent: any; message: string; remainingActions?: any[]; batchIndex?: number; batchTotal?: number} | null>(null);
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [senderOverrides, setSenderOverrides] = useState<Record<number, { ghlUserId: string; name: string } | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<string>("");

  const saveExchangeMutation = trpc.coach.saveExchange.useMutation();
  const { data: smsTeamSenders } = trpc.coachActions.smsTeamSenders.useQuery();
  const parseIntentMutation = trpc.coachActions.parseIntent.useMutation();
  const searchContactsMutation = trpc.coachActions.searchContacts.useMutation();
  const createPendingMutation = trpc.coachActions.createPending.useMutation();
  const confirmExecuteMutation = trpc.coachActions.confirmAndExecute.useMutation();
  const cancelActionMutation = trpc.coachActions.cancel.useMutation();
  const coachUtils = trpc.useUtils();

  const askCoachMutation = trpc.coach.askQuestion.useMutation({
    onSuccess: async (response) => {
      if (response.answer.includes("[ACTION_REDIRECT]")) {
        setConversation(prev => [...prev, { role: "assistant", content: "On it \u2014 creating that for you now..." }]);
        try {
          const historyForRedirect = conversation
            .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
              msg.role === "user" || msg.role === "assistant"
            )
            .slice(-10)
            .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
          const result = await parseIntentMutation.mutateAsync({ message: lastUserMessageRef.current, history: historyForRedirect });
          if ((result as any).instructionSaved) {
            setConversation(prev => [...prev, { role: "assistant", content: (result as any).instructionConfirmation || "Got it \u2014 I'll remember that preference!" }]);
            setIsAsking(false);
            return;
          }
          const actions = (result.actions || []).filter((a: any) => a && typeof a.actionType === "string" && a.actionType.trim() !== "");
          if (actions.length > 0) {
            await processActions(actions, lastUserMessageRef.current);
          } else {
            const cleanAnswer = response.answer.replace(/\[ACTION_REDIRECT\]/g, "").trim();
            if (cleanAnswer) {
              setConversation(prev => [...prev, { role: "assistant", content: cleanAnswer }]);
            }
          }
        } catch (error: any) {
          const errMsg = error.message || "Unknown error";
          if (errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("rate limit")) {
            toast.error("CRM is temporarily rate-limited. Please wait a moment and try again.");
          } else {
            toast.error("Failed to process action: " + errMsg);
          }
        }
        setIsAsking(false);
        return;
      }
      setConversation(prev => [...prev, { role: "assistant", content: response.answer }]);
      setIsAsking(false);
    },
    onError: (error) => {
      toast.error("Failed to get answer: " + error.message);
      setIsAsking(false);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, isAsking]);

  const processActions = async (actions: any[], userMessage: string) => {
    if (actions.length > 1) {
      setConversation(prev => [...prev, { role: "assistant", content: `I detected **${actions.length} actions** in your request. Creating each one for your review:` }]);
    }
    const resolvedContacts: Record<string, { id: string; name: string }> = {};
    const batchTotal = actions.length;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const batchIndex = i + 1;
      const needsSearch = (action.needsContactSearch || (!action.contactId || !action.contactId.trim())) && action.contactName;
      if (needsSearch) {
        const cached = resolvedContacts[action.contactName.toLowerCase()];
        if (cached) {
          action.contactId = cached.id;
          action.contactName = cached.name;
          await createActionCard(action, userMessage, batchIndex, batchTotal);
        } else {
          const contacts = await searchContactsMutation.mutateAsync({ query: action.contactName });
          if (contacts.length === 0) {
            setConversation(prev => [...prev, { role: "assistant", content: `I couldn't find a contact named "${action.contactName}" in CRM. Skipping action: ${action.summary}` }]);
            continue;
          } else if (contacts.length === 1) {
            action.contactId = contacts[0].id;
            action.contactName = contacts[0].name || action.contactName;
            resolvedContacts[action.contactName.toLowerCase()] = { id: contacts[0].id, name: contacts[0].name || action.contactName };
            await createActionCard(action, userMessage, batchIndex, batchTotal);
          } else {
            setContactSearchResults(contacts.map(c => ({ id: c.id, name: c.name || "Unknown", phone: c.phone || undefined, email: c.email || undefined })));
            setPendingAction({ intent: action, message: userMessage, remainingActions: actions.slice(i + 1), batchIndex, batchTotal });
            setConversation(prev => [...prev, { role: "assistant", content: `I found ${contacts.length} contacts matching "${action.contactName}". Please select the right one:` }]);
            setIsAsking(false);
            return;
          }
        }
      } else {
        await createActionCard(action, userMessage, batchIndex, batchTotal);
      }
    }
  };

  const createActionCard = async (intent: any, userMessage: string, batchIndex?: number, batchTotal?: number) => {
    try {
      if (!intent.actionType || typeof intent.actionType !== "string" || intent.actionType.trim() === "") {
        setConversation(prev => [...prev, { role: "assistant", content: `I couldn't determine the action type for: ${intent.summary || "unknown action"}. Please try rephrasing your request.` }]);
        return;
      }
      let resolvedStage: { pipelineName: string; stageName: string } | undefined;
      if (intent.actionType === "change_pipeline_stage" && intent.params?.stageName) {
        try {
          const stageResult = await coachUtils.coachActions.resolveStage.fetch({
            stageName: intent.params.stageName,
            pipelineName: intent.params.pipelineName || undefined,
            contactId: intent.contactId || undefined,
          });
          if (stageResult.resolved) {
            resolvedStage = { pipelineName: stageResult.pipelineName!, stageName: stageResult.stageName! };
          }
        } catch (e) {
          console.warn("Stage resolution failed:", e);
        }
      }
      const result = await createPendingMutation.mutateAsync({
        actionType: intent.actionType,
        requestText: userMessage,
        targetContactId: intent.contactId || undefined,
        targetContactName: intent.contactName || undefined,
        payload: { ...intent.params, assigneeName: intent.assigneeName || "" },
      });
      setConversation(prev => [...prev, {
        role: "action_card",
        actionId: result.actionId,
        actionType: intent.actionType,
        summary: intent.summary,
        contactName: intent.contactName || "",
        status: "pending",
        payload: { ...intent.params, assigneeName: intent.assigneeName || "" },
        ...(batchTotal && batchTotal > 1 ? { batchIndex, batchTotal } : {}),
        ...(resolvedStage ? { resolvedStage } : {}),
      }]);
    } catch (error: any) {
      const msg = error?.message || "Unknown error";
      const isZodError = msg.includes("expected") && msg.includes("received");
      const friendlyMsg = isZodError
        ? "I couldn't process that action. Please try rephrasing your request."
        : msg;
      setConversation(prev => [...prev, { role: "assistant", content: friendlyMsg }]);
    }
  };

  const streamCoachQuestion = useCallback(async (userMessage: string, chatHistory: Array<{ role: "user" | "assistant"; content: string }>) => {
    setConversation(prev => [...prev, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/coach/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage, history: chatHistory }),
      });
      if (!response.ok) throw new Error("Stream request failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";
      let actionRedirectDetected = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "chunk" && parsed.content) {
              fullResponse += parsed.content;
              if (fullResponse.includes("[ACTION_REDIRECT]")) {
                actionRedirectDetected = true;
                reader.cancel();
                break;
              }
              setConversation(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg && lastMsg.role === "assistant") {
                  updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + parsed.content };
                }
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
        if (actionRedirectDetected) break;
      }

      if (actionRedirectDetected) {
        setConversation(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            updated[updated.length - 1] = { ...lastMsg, content: "On it \u2014 creating that for you now..." };
          }
          return updated;
        });
        try {
          const historyForStreamRedirect = conversation
            .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
              msg.role === "user" || msg.role === "assistant"
            )
            .slice(-10)
            .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
          const result = await parseIntentMutation.mutateAsync({ message: userMessage, history: historyForStreamRedirect });
          if ((result as any).instructionSaved) {
            setConversation(prev => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg && lastMsg.role === "assistant") {
                updated[updated.length - 1] = { ...lastMsg, content: (result as any).instructionConfirmation || "Got it \u2014 I'll remember that preference!" };
              }
              return updated;
            });
            setIsAsking(false);
            return;
          }
          const actions = (result.actions || []).filter((a: any) => a && typeof a.actionType === "string" && a.actionType.trim() !== "");
          if (actions.length > 0) {
            await processActions(actions, userMessage);
          } else {
            const chatHistoryFallback = conversation
              .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
                msg.role === "user" || msg.role === "assistant"
              )
              .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
            setConversation(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
                updated.pop();
              }
              return updated;
            });
            await streamCoachQuestion(userMessage, chatHistoryFallback);
            return;
          }
        } catch (error: any) {
          const errMsg = error.message || "Unknown error";
          if (errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("rate limit")) {
            toast.error("CRM is temporarily rate-limited. Please wait a moment and try again.");
          } else {
            toast.error("Failed to process action: " + errMsg);
          }
        }
        setIsAsking(false);
        return;
      }

      // Persist exchange
      setConversation(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
          saveExchangeMutation.mutate({ question: userMessage, answer: lastMsg.content });
        }
        return prev;
      });
      setIsAsking(false);
    } catch {
      lastUserMessageRef.current = userMessage;
      askCoachMutation.mutate({ question: userMessage, history: chatHistory });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveExchangeMutation, conversation, parseIntentMutation]);

  const handleAsk = async () => {
    if (!question.trim() || isAsking) return;
    if (!guardDemoAction("CRM actions")) return;
    const userMessage = question.trim();
    setConversation(prev => [...prev, { role: "user", content: userMessage }]);
    setIsAsking(true);
    setQuestion("");

    try {
      const historyForIntent = conversation
        .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
          msg.role === "user" || msg.role === "assistant"
        )
        .slice(-10)
        .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
      const result = await parseIntentMutation.mutateAsync({ message: userMessage, history: historyForIntent });
      if ((result as any).instructionSaved) {
        setConversation(prev => [...prev, { role: "assistant", content: (result as any).instructionConfirmation || "Got it \u2014 I'll remember that preference!" }]);
        setIsAsking(false);
        return;
      }
      const actions = (result.actions || []).filter((a: any) => a && typeof a.actionType === "string" && a.actionType.trim() !== "");
      if (actions.length > 0) {
        await processActions(actions, userMessage);
      } else {
        const chatHistory = conversation
          .filter((msg): msg is { role: "user"; content: string } | { role: "assistant"; content: string } =>
            msg.role === "user" || msg.role === "assistant"
          )
          .map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content }));
        await streamCoachQuestion(userMessage, chatHistory);
        return;
      }
    } catch (error: any) {
      const errMsg = error.message || "Unknown error";
      if (errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("rate limit") || errMsg.includes("temporarily busy")) {
        toast.error("CRM is temporarily busy. Please wait a moment and try again.");
        setConversation(prev => [...prev, { role: "assistant", content: "The CRM is temporarily busy. Please wait about 30 seconds and try again." }]);
      } else {
        toast.error("Failed to process: " + errMsg);
      }
    }
    setIsAsking(false);
  };

  const handleSelectContact = async (contactId: string, contactName: string) => {
    if (!pendingAction) return;
    setContactSearchResults([]);
    setIsAsking(true);
    const intent = { ...pendingAction.intent, contactId, contactName };
    const currentBatchIndex = pendingAction.batchIndex;
    const currentBatchTotal = pendingAction.batchTotal;
    await createActionCard(intent, pendingAction.message, currentBatchIndex, currentBatchTotal);
    const remaining = pendingAction.remainingActions || [];
    const userMessage = pendingAction.message;
    setPendingAction(null);
    if (remaining.length > 0) {
      const resolvedContacts: Record<string, { id: string; name: string }> = {
        [contactName.toLowerCase()]: { id: contactId, name: contactName }
      };
      for (let i = 0; i < remaining.length; i++) {
        const action = remaining[i];
        const batchIdx = (currentBatchIndex || 0) + 1 + i;
        const needsSearch = (action.needsContactSearch || (!action.contactId || !action.contactId.trim())) && action.contactName;
        if (needsSearch) {
          const cached = resolvedContacts[action.contactName.toLowerCase()];
          if (cached) {
            action.contactId = cached.id;
            action.contactName = cached.name;
            await createActionCard(action, userMessage, batchIdx, currentBatchTotal);
          } else {
            const contacts = await searchContactsMutation.mutateAsync({ query: action.contactName });
            if (contacts.length === 0) {
              setConversation(prev => [...prev, { role: "assistant", content: `I couldn't find "${action.contactName}". Skipping: ${action.summary}` }]);
              continue;
            } else if (contacts.length === 1) {
              action.contactId = contacts[0].id;
              action.contactName = contacts[0].name || action.contactName;
              resolvedContacts[action.contactName.toLowerCase()] = { id: contacts[0].id, name: contacts[0].name || action.contactName };
              await createActionCard(action, userMessage, batchIdx, currentBatchTotal);
            } else {
              setContactSearchResults(contacts.map(c => ({ id: c.id, name: c.name || "Unknown", phone: c.phone || undefined, email: c.email || undefined })));
              setPendingAction({ intent: action, message: userMessage, remainingActions: remaining.slice(i + 1), batchIndex: batchIdx, batchTotal: currentBatchTotal });
              setConversation(prev => [...prev, { role: "assistant", content: `I found ${contacts.length} contacts matching "${action.contactName}". Please select:` }]);
              setIsAsking(false);
              return;
            }
          }
        } else {
          await createActionCard(action, userMessage, batchIdx, currentBatchTotal);
        }
      }
    }
    setIsAsking(false);
  };

  const getEditableContent = (actionType: string, payload: any): string => {
    if (!payload) return "";
    switch (actionType) {
      case "send_sms": return payload.message || "";
      case "add_note":
      case "add_note_contact":
      case "add_note_opportunity": return payload.noteBody || "";
      case "create_task": return payload.title || "";
      default: return "";
    }
  };

  const isEditableAction = (actionType: string): boolean => {
    return ["send_sms", "add_note", "add_note_contact", "add_note_opportunity", "create_task"].includes(actionType);
  };

  const handleStartEdit = (actionId: number, actionType: string, payload: any) => {
    setEditingActionId(actionId);
    setEditedContent(getEditableContent(actionType, payload));
  };

  const handleCancelEdit = () => {
    setEditingActionId(null);
    setEditedContent("");
  };

  const buildEditedPayload = (actionType: string, originalPayload: any, newContent: string): any => {
    const edited = { ...originalPayload };
    switch (actionType) {
      case "send_sms": edited.message = newContent; break;
      case "add_note":
      case "add_note_contact":
      case "add_note_opportunity": edited.noteBody = newContent; break;
      case "create_task": edited.title = newContent; break;
    }
    return edited;
  };

  const handleConfirmAction = async (actionId: number) => {
    if (guardDemoAction("CRM actions")) return;
    const actionCard = conversation.find(
      (msg): msg is Extract<CoachConversationMessage, { role: "action_card" }> =>
        msg.role === "action_card" && msg.actionId === actionId
    );
    let editedPayload: any = undefined;
    if (editingActionId === actionId && actionCard) {
      const originalContent = getEditableContent(actionCard.actionType, actionCard.payload);
      if (editedContent !== originalContent) {
        editedPayload = buildEditedPayload(actionCard.actionType, actionCard.payload, editedContent);
      }
    }
    if (actionCard?.actionType === "send_sms" && senderOverrides[actionId]) {
      const override = senderOverrides[actionId];
      editedPayload = {
        ...(editedPayload || actionCard.payload || {}),
        senderOverrideGhlId: override.ghlUserId,
        senderOverrideName: override.name,
      };
    }
    setEditingActionId(null);
    setEditedContent("");
    setConversation(prev => prev.map(msg => 
      msg.role === "action_card" && msg.actionId === actionId 
        ? { ...msg, status: "confirmed" as const, ...(editedPayload ? { payload: editedPayload, summary: `${msg.summary} (edited)` } : {}) }
        : msg
    ));
    try {
      const result = await confirmExecuteMutation.mutateAsync({ actionId, editedPayload });
      setConversation(prev => prev.map(msg => 
        msg.role === "action_card" && msg.actionId === actionId 
          ? { ...msg, status: result.success ? "executed" as const : "failed" as const, result: result.success ? "Action completed successfully!" : (result.error || "Action failed"), ...(result.smsFromNumber ? { smsFromNumber: result.smsFromNumber } : {}) }
          : msg
      ));
      if (result.success) {
        toast.success("Action executed successfully!");
        if (actionCard?.actionType === "send_sms") {
          setConversation(prev => prev.map(msg =>
            msg.role === "action_card" && msg.actionId === actionId
              ? { ...msg, smsDeliveryStatus: "sent" }
              : msg
          ));
          setTimeout(async () => {
            try {
              const statusResult = await coachUtils.coachActions.smsDeliveryStatus.fetch({ actionId });
              if (statusResult.found && statusResult.status) {
                setConversation(prev => prev.map(msg =>
                  msg.role === "action_card" && msg.actionId === actionId
                    ? { ...msg, smsDeliveryStatus: statusResult.status }
                    : msg
                ));
              }
            } catch { /* non-critical */ }
          }, 3000);
          setTimeout(async () => {
            try {
              const statusResult = await coachUtils.coachActions.smsDeliveryStatus.fetch({ actionId });
              if (statusResult.found && statusResult.status) {
                setConversation(prev => prev.map(msg =>
                  msg.role === "action_card" && msg.actionId === actionId
                    ? { ...msg, smsDeliveryStatus: statusResult.status }
                    : msg
                ));
              }
            } catch { /* non-critical */ }
          }, 8000);
        }
      } else {
        toast.error(result.error || "Action failed");
      }
    } catch (error: any) {
      const errMsg = error.message || "Unknown error";
      const isRateLimit = errMsg.includes("429") || errMsg.includes("rate limit") || errMsg.includes("Too Many") || errMsg.includes("temporarily busy");
      const friendlyMsg = isRateLimit ? "CRM is temporarily busy. Please wait a moment and try again." : errMsg;
      setConversation(prev => prev.map(msg => 
        msg.role === "action_card" && msg.actionId === actionId 
          ? { ...msg, status: "failed" as const, result: friendlyMsg }
          : msg
      ));
      toast.error(isRateLimit ? friendlyMsg : "Failed to execute: " + errMsg);
    }
  };

  const handleCancelAction = async (actionId: number) => {
    if (guardDemoAction("CRM actions")) return;
    try {
      await cancelActionMutation.mutateAsync({ actionId });
      setConversation(prev => prev.map(msg => 
        msg.role === "action_card" && msg.actionId === actionId 
          ? { ...msg, status: "cancelled" as const }
          : msg
      ));
    } catch (error: any) {
      toast.error("Failed to cancel: " + error.message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const clearConversation = () => {
    setConversation([]);
    setContactSearchResults([]);
    setPendingAction(null);
  };

  const suggestedPrompts = [
    { text: "What should I focus on?", icon: "\u{1F3AF}" },
    { text: "Send an SMS to...", icon: "\u{1F4AC}" },
    { text: "Add a note for...", icon: "\u{1F4DD}" },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: "var(--g-bg-card)",
        border: "1px solid var(--g-border-subtle)",
        boxShadow: "var(--g-shadow-card)",
        height: "100%",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "var(--g-border-subtle)" }}>
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--g-accent-soft)" }}>
          <Bot className="h-3.5 w-3.5" style={{ color: "var(--g-accent-text)" }} />
        </div>
        <span className="text-xs font-semibold" style={{ color: "var(--g-text-primary)" }}>AI Coach</span>
        <Sparkles className="h-3 w-3" style={{ color: "var(--g-accent)" }} />
        <div className="flex-1" />
        {conversation.length > 0 && (
          <button onClick={clearConversation} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-muted" style={{ color: "var(--g-text-tertiary)" }}>
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ minHeight: 0 }}>
        {conversation.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--g-accent-soft)" }}>
              <Bot className="h-5 w-5" style={{ color: "var(--g-accent-text)" }} />
            </div>
            <p className="text-xs text-center" style={{ color: "var(--g-text-tertiary)" }}>
              Ask questions or give commands — send SMS, add notes, create tasks, and more.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => setQuestion(prompt.text)}
                  className="text-[10px] inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-all"
                  style={{
                    border: "1px solid var(--g-border-subtle)",
                    color: "var(--g-text-secondary)",
                    background: "var(--g-bg-card)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--g-bg-inset)"; e.currentTarget.style.borderColor = "var(--g-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--g-bg-card)"; e.currentTarget.style.borderColor = "var(--g-border-subtle)"; }}
                >
                  <span>{prompt.icon}</span>
                  {prompt.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {conversation.map((msg, i) => {
              if (msg.role === "action_card") {
                const statusColors = {
                  pending: "border-amber-500/50 bg-amber-50",
                  confirmed: "border-blue-500/50 bg-blue-50",
                  executed: "border-green-500/50 bg-green-50",
                  cancelled: "border-gray-400/50 bg-gray-50 opacity-60",
                  failed: "border-red-500/50 bg-red-50",
                };
                const statusIcons = {
                  pending: "\u23F3",
                  confirmed: "\u{1F504}",
                  executed: "\u2705",
                  cancelled: "\u274C",
                  failed: "\u26A0\uFE0F",
                };
                return (
                  <div key={i} className={`rounded-lg border-2 p-2.5 ${statusColors[msg.status]}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-sm">{ACTION_ICONS[msg.actionType] || "\u26A1"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold">
                            {ACTION_TYPE_LABELS[msg.actionType] || msg.actionType}
                          </span>
                          {msg.batchTotal && msg.batchTotal > 1 && msg.batchIndex && (
                            <span className="text-[9px] font-medium px-1 py-0.5 rounded-full bg-primary/10 text-primary">
                              {msg.batchIndex}/{msg.batchTotal}
                            </span>
                          )}
                          <span className="text-[9px] text-muted-foreground">
                            {statusIcons[msg.status]} {msg.status}
                          </span>
                        </div>
                        {msg.contactName && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Contact: {msg.contactName}</p>
                        )}
                        {/* SMS sender override */}
                        {msg.actionType === "send_sms" && msg.status === "pending" && currentUser?.name && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[9px] text-blue-600">{"\u{1F4E4}"} From:</span>
                            {smsTeamSenders && smsTeamSenders.length > 1 ? (
                              <Select
                                value={senderOverrides[msg.actionId]?.ghlUserId || "default"}
                                onValueChange={(val) => {
                                  if (val === "default") {
                                    setSenderOverrides(prev => ({ ...prev, [msg.actionId]: null }));
                                  } else {
                                    const sender = smsTeamSenders.find(s => s.ghlUserId === val);
                                    if (sender) {
                                      setSenderOverrides(prev => ({ ...prev, [msg.actionId]: { ghlUserId: sender.ghlUserId, name: sender.name } }));
                                    }
                                  }
                                }}
                              >
                                <SelectTrigger className="h-4 text-[9px] w-auto min-w-[100px] max-w-[160px] px-1 py-0 border-blue-300 bg-blue-50">
                                  <SelectValue placeholder={`${currentUser.name}'s line`} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="default">{currentUser.name}'s line</SelectItem>
                                  {smsTeamSenders.filter(s => s.name !== currentUser.name).map(sender => (
                                    <SelectItem key={sender.ghlUserId} value={sender.ghlUserId}>
                                      {sender.name}'s line
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-[9px] font-medium text-blue-700">{currentUser.name}'s line</span>
                            )}
                          </div>
                        )}
                        {/* Executed SMS sender info */}
                        {msg.actionType === "send_sms" && msg.status === "executed" && (
                          <p className="text-[9px] text-green-600 mt-0.5">
                            \u2705 Sent from: {msg.payload?.senderOverrideName || currentUser?.name || "You"}'s line
                          </p>
                        )}
                        {/* SMS Delivery Status */}
                        {msg.actionType === "send_sms" && msg.status === "executed" && msg.smsDeliveryStatus && (
                          <div className={`flex items-center gap-1 mt-1 text-[9px] px-1.5 py-0.5 rounded-full w-fit ${
                            msg.smsDeliveryStatus === "delivered" ? "bg-green-100 text-green-700" :
                            msg.smsDeliveryStatus === "sent" ? "bg-blue-100 text-blue-700" :
                            msg.smsDeliveryStatus === "pending" ? "bg-yellow-100 text-yellow-700" :
                            msg.smsDeliveryStatus === "failed" || msg.smsDeliveryStatus === "undelivered" ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {msg.smsDeliveryStatus === "delivered" && <CheckCircle className="h-2 w-2" />}
                            {msg.smsDeliveryStatus === "sent" && <Send className="h-2 w-2" />}
                            {msg.smsDeliveryStatus === "pending" && <Loader2 className="h-2 w-2 animate-spin" />}
                            {(msg.smsDeliveryStatus === "failed" || msg.smsDeliveryStatus === "undelivered") && <XCircle className="h-2 w-2" />}
                            <span className="font-medium capitalize">{msg.smsDeliveryStatus}</span>
                          </div>
                        )}
                        {/* Workflow details */}
                        {(msg.actionType === "add_to_workflow" || msg.actionType === "remove_from_workflow") && msg.payload?.workflowName && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                            <span className="text-purple-600">{msg.actionType === "add_to_workflow" ? "\u2192" : "\u2190"}</span>
                            <span className="font-medium text-purple-700">{msg.payload.workflowName}</span>
                          </div>
                        )}
                        {/* Pipeline stage */}
                        {msg.actionType === "change_pipeline_stage" && msg.resolvedStage && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                            <span className="text-blue-600">{"\u2192"}</span>
                            <span className="font-medium text-blue-700">{msg.resolvedStage.stageName}</span>
                            <span className="text-blue-500">in</span>
                            <span className="font-medium text-blue-700">{msg.resolvedStage.pipelineName}</span>
                          </div>
                        )}
                        {/* Appointment details */}
                        {msg.actionType === "create_appointment" && msg.payload && (
                          <div className="mt-1 text-[10px] bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 space-y-0.5">
                            {msg.payload.title && <p><span className="text-teal-600">Title:</span> <span className="font-medium text-teal-700">{msg.payload.title}</span></p>}
                            {msg.payload.startTime && <p><span className="text-teal-600">Date/Time:</span> <span className="font-medium text-teal-700">{new Date(msg.payload.startTime).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></p>}
                            {msg.payload.calendarName && <p><span className="text-teal-600">Calendar:</span> <span className="font-medium text-teal-700">{msg.payload.calendarName}</span></p>}
                          </div>
                        )}
                        {/* Editable content preview */}
                        {msg.status === "pending" && isEditableAction(msg.actionType) && msg.payload ? (
                          <div className="mt-1">
                            <p className="text-[9px] font-medium text-muted-foreground mb-0.5">
                              {msg.actionType === "send_sms" ? "SMS Draft:" : msg.actionType === "create_task" ? "Task:" : "Note Draft:"}
                            </p>
                            {editingActionId === msg.actionId ? (
                              <>
                                <Textarea
                                  value={editedContent}
                                  onChange={(e) => setEditedContent(e.target.value)}
                                  className="text-[11px] min-h-[50px] resize-none bg-white border"
                                  autoFocus
                                />
                                <p className="text-[8px] text-muted-foreground mt-0.5">Edit above, then confirm or cancel</p>
                              </>
                            ) : (
                              <div className="text-[11px] bg-white/60 rounded p-1.5 border border-dashed border-gray-300 whitespace-pre-wrap">
                                {getEditableContent(msg.actionType, msg.payload) || msg.summary}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] mt-1">{msg.summary}</p>
                        )}
                        {msg.result && (
                          <p className={`text-[9px] mt-1 ${msg.status === "executed" ? "text-green-600" : "text-red-600"}`}>
                            {msg.result}
                          </p>
                        )}
                        {msg.status === "pending" && (
                          <div className="flex gap-1.5 mt-1.5">
                            <Button
                              size="sm"
                              className="h-6 text-[10px] px-2 bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleConfirmAction(msg.actionId)}
                              disabled={confirmExecuteMutation.isPending}
                            >
                              {confirmExecuteMutation.isPending ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" />
                              ) : (
                                <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                              )}
                              {editingActionId === msg.actionId ? "Confirm Edit" : "Confirm"}
                            </Button>
                            {editingActionId === msg.actionId ? (
                              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={handleCancelEdit}>
                                <XCircle className="h-2.5 w-2.5 mr-0.5" />
                                Cancel Edit
                              </Button>
                            ) : (
                              <>
                                {isEditableAction(msg.actionType) && (
                                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleStartEdit(msg.actionId, msg.actionType, msg.payload)}>
                                    <Pencil className="h-2.5 w-2.5 mr-0.5" />
                                    Edit
                                  </Button>
                                )}
                                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleCancelAction(msg.actionId)} disabled={cancelActionMutation.isPending}>
                                  <XCircle className="h-2.5 w-2.5 mr-0.5" />
                                  Cancel
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mr-1.5 mt-0.5" style={{ background: "var(--g-accent-soft)" }}>
                      <Bot className="h-2.5 w-2.5" style={{ color: "var(--g-accent-text)" }} />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-2.5 py-1.5 ${msg.role === "user" ? "max-w-[80%]" : "flex-1"}`}
                    style={{
                      background: msg.role === "user" ? "var(--g-accent)" : "var(--g-bg-inset)",
                      color: msg.role === "user" ? "white" : "var(--g-text-primary)",
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <div className="text-xs leading-relaxed prose prose-sm max-w-none dark:prose-invert">
                        <Streamdown>{msg.content}</Streamdown>
                      </div>
                    ) : (
                      <p className="text-xs">{msg.content}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Contact search results */}
            {contactSearchResults.length > 0 && (
              <div className="space-y-1">
                {contactSearchResults.slice(0, 5).map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleSelectContact(contact.id, contact.name)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md border text-[11px] transition-colors hover:bg-muted"
                    style={{ borderColor: "var(--g-border-subtle)" }}
                  >
                    <span className="font-medium">{contact.name}</span>
                    {contact.phone && <span className="text-muted-foreground ml-2">{contact.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {isAsking && conversation.length > 0 && (() => {
          const last = conversation[conversation.length - 1];
          return last.role !== "assistant" || (last.role === "assistant" && !last.content);
        })() && (
          <div className="flex justify-start">
            <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mr-1.5" style={{ background: "var(--g-accent-soft)" }}>
              <Bot className="h-2.5 w-2.5" style={{ color: "var(--g-accent-text)" }} />
            </div>
            <div className="rounded-lg px-2.5 py-1.5" style={{ background: "var(--g-bg-inset)" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--g-text-tertiary)" }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-1.5 px-3 py-2 border-t" style={{ borderColor: "var(--g-border-subtle)" }}>
        <Textarea
          placeholder="Ask or give a command..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[36px] max-h-[60px] resize-none text-xs flex-1"
          disabled={isAsking}
        />
        <Button
          onClick={handleAsk}
          disabled={!question.trim() || isAsking}
          size="sm"
          className="self-end h-[36px] w-[36px] p-0 flex-shrink-0"
          style={{ background: "var(--g-accent)", color: "white" }}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────

export default function TaskCenter() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // State
  const [roleTab, setRoleTab] = useState<RoleTab>("admin");
  const [selectedMember, setSelectedMember] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Edit dialog state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  // Delete confirmation dialog state
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  const isAdmin =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    (user as any)?.isTenantAdmin === "true";

  // Fetch priority tasks
  const { data, isLoading, isError } = trpc.taskCenter.getPriorityTasks.useQuery(
    {
      assignedToGhlUserId: selectedMember !== "all" ? selectedMember : undefined,
      categoryFilter: categoryFilter !== "all" ? categoryFilter as any : undefined,
    },
    { refetchInterval: 60000 }
  );

  // Refresh tasks mutation
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTasksMutation = trpc.taskCenter.refreshTasks.useMutation({
    onSuccess: () => {
      utils.taskCenter.getPriorityTasks.invalidate();
      utils.taskCenter.getUnreadConversations.invalidate();
      utils.taskCenter.getTodayAppointments.invalidate();
      utils.taskCenter.getKpiSummary.invalidate();
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshTasksMutation.mutateAsync();
      toast.success("Day Hub refreshed");
    } catch {
      toast.error("Failed to refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Complete task mutation with optimistic removal
  const completeTaskMutation = trpc.taskCenter.completeTask.useMutation({
    onMutate: async ({ taskId }) => {
      setCompletingTaskIds((prev) => new Set(prev).add(taskId));
      // Cancel outgoing refetches so they don't overwrite optimistic update
      await utils.taskCenter.getPriorityTasks.cancel();
      // Snapshot previous value
      const prev = utils.taskCenter.getPriorityTasks.getData();
      // Optimistically remove the task from the list
      utils.taskCenter.getPriorityTasks.setData(undefined, (old: any) => {
        if (!old) return old;
        return { ...old, tasks: old.tasks.filter((t: any) => t.id !== taskId) };
      });
      return { prev };
    },
    onSuccess: (_, { taskId }) => {
      toast.success("Task completed");
      setCompletingTaskIds((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
      utils.taskCenter.getPriorityTasks.invalidate();
    },
    onError: (err, { taskId }, context: any) => {
      toast.error("Failed to complete task", { description: err.message });
      setCompletingTaskIds((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
      // Rollback optimistic update
      if (context?.prev) {
        utils.taskCenter.getPriorityTasks.setData(undefined, context.prev);
      }
    },
  });

  // Edit task mutation
  const editTaskMutation = trpc.taskCenter.editTask.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditingTask(null);
      utils.taskCenter.getPriorityTasks.invalidate();
    },
    onError: (err) => toast.error("Failed to update task", { description: err.message }),
  });

  // Delete task mutation
  const deleteTaskMutation = trpc.taskCenter.deleteTask.useMutation({
    onSuccess: () => {
      toast.success("Task deleted");
      setDeletingTask(null);
      utils.taskCenter.getPriorityTasks.invalidate();
    },
    onError: (err) => toast.error("Failed to delete task", { description: err.message }),
  });

  // Get GHL user IDs for the selected role tab
  const roleFilteredGhlUserIds = useMemo(() => {
    if (roleTab === "admin" || !data?.teamMembers) return null; // null = show all
    const allowedRoles = ROLE_TAB_CONFIG[roleTab].teamRoles;
    return data.teamMembers
      .filter((m: TeamMember) => m.teamRole && allowedRoles.includes(m.teamRole) && m.ghlUserId)
      .map((m: TeamMember) => m.ghlUserId!);
  }, [roleTab, data?.teamMembers]);

  // Filter tasks by role tab, search query, and selected member
  const filteredTasks = useMemo(() => {
    if (!data?.tasks) return [];
    let tasks = data.tasks as Task[];

    // Apply role-based filtering
    if (roleFilteredGhlUserIds !== null) {
      tasks = tasks.filter((t: Task) => roleFilteredGhlUserIds.includes(t.assignedTo));
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (t: Task) =>
          t.title.toLowerCase().includes(q) ||
          (t.contactName && t.contactName.toLowerCase().includes(q)) ||
          (t.assignedMemberName && t.assignedMemberName.toLowerCase().includes(q)) ||
          (t.contactAddress && t.contactAddress.toLowerCase().includes(q))
      );
    }
    return tasks;
  }, [data?.tasks, searchQuery, roleFilteredGhlUserIds]);

  const totalTasks = filteredTasks.length;
  const overdueCount = useMemo(() => filteredTasks.filter((t: Task) => t.group === "overdue").length, [filteredTasks]);

  // Batch pre-fetch AM/PM status for all contacts on page load — single DB query
  const allContactIds = useMemo(() => {
    if (!data?.tasks) return [];
    const ids = (data.tasks as Task[]).map(t => t.contactId).filter(Boolean);
    return Array.from(new Set(ids));
  }, [data?.tasks]);

  const { data: batchAmPm } = trpc.taskCenter.batchAmPmStatus.useQuery(
    { contactIds: allContactIds },
    { enabled: allContactIds.length > 0, staleTime: 60000 }
  );

  const handleComplete = (task: Task) => {
    completeTaskMutation.mutate({ contactId: task.contactId, taskId: task.id });
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditBody(task.body || "");
    if (task.dueDate) {
      const d = new Date(task.dueDate);
      setEditDueDate(d.toISOString().split("T")[0]);
    } else {
      setEditDueDate("");
    }
  };

  const handleDelete = (task: Task) => {
    setDeletingTask(task);
  };

  const submitEdit = () => {
    if (!editingTask) return;
    editTaskMutation.mutate({
      contactId: editingTask.contactId,
      taskId: editingTask.id,
      title: editTitle,
      body: editBody,
      dueDate: editDueDate ? new Date(editDueDate + "T12:00:00").toISOString() : undefined,
    });
  };

  const confirmDelete = () => {
    if (!deletingTask) return;
    deleteTaskMutation.mutate({ contactId: deletingTask.contactId, taskId: deletingTask.id });
  };

  return (
    <div className="px-4 py-4 space-y-4" style={{ maxWidth: "100%" }}>
      {/* Header with Role Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--g-text-primary)" }}>
              <Flame className="h-6 w-6" style={{ color: "var(--g-accent)" }} />
              Day Hub
            </h1>
          </div>
          {/* Role Tabs */}
          <div
            className="flex items-center rounded-lg p-0.5"
            style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}
          >
            {(["admin", "lm", "am"] as RoleTab[]).map((tab) => {
              const config = ROLE_TAB_CONFIG[tab];
              const isActive = roleTab === tab;
              return (
                <button
                  key={tab}
                  className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all"
                  style={{
                    background: isActive ? "var(--g-accent)" : "transparent",
                    color: isActive ? "white" : "var(--g-text-tertiary)",
                    boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                  }}
                  onClick={() => {
                    setRoleTab(tab);
                    setSelectedMember("all");
                  }}
                  title={config.description}
                >
                  {config.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs hidden md:block" style={{ color: "var(--g-text-tertiary)" }}>
            {ROLE_TAB_CONFIG[roleTab].description}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading || isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* KPI Bar */}
      <KpiBar roleTab={roleTab} teamMembers={data?.teamMembers as TeamMember[] | undefined} />

      {/* Top half: Inbox + AI Coach side by side */}
      <div className="grid grid-cols-2 gap-4" style={{ height: "380px" }}>
        <LeftPanel roleTab={roleTab} roleFilteredGhlUserIds={roleFilteredGhlUserIds} teamMembers={data?.teamMembers} />
        <DayHubCoach />
      </div>

      {/* Bottom: Full-width Task List */}
      <div className="space-y-3">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--g-text-tertiary)" }} />
              <Input placeholder="Search tasks or contacts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
            </div>

            {/* Category filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <Target className="h-4 w-4 mr-2" style={{ color: "var(--g-text-tertiary)" }} />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Categories</SelectItem>
                <SelectItem value="new_lead">New Leads</SelectItem>
                <SelectItem value="reschedule">Reschedule</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="follow_up">Follow-Up</SelectItem>
              </SelectContent>
            </Select>

            {/* Team member filter — scoped to role tab */}
            {isAdmin && data?.teamMembers && data.teamMembers.length > 0 && (
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger className="w-[180px] h-9">
                  <Users className="h-4 w-4 mr-2" style={{ color: "var(--g-text-tertiary)" }} />
                  <SelectValue placeholder="All Team Members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {roleTab === "admin" ? "Team Members" : `${ROLE_TAB_CONFIG[roleTab].label}s`}
                  </SelectItem>
                  {data.teamMembers
                    .filter((m: TeamMember) => {
                      if (!m.ghlUserId) return false;
                      if (roleTab === "admin") return true;
                      const allowedRoles = ROLE_TAB_CONFIG[roleTab].teamRoles;
                      return m.teamRole && allowedRoles.includes(m.teamRole);
                    })
                    .map((m: TeamMember) => (
                      <SelectItem key={m.id} value={m.ghlUserId!}>{m.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Stats summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>{totalTasks} tasks</span>
            </div>
            {overdueCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "oklch(0.25 0.03 25 / 0.4)", border: "1px solid var(--g-accent)" }}>
                <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--g-accent)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--g-accent)" }}>{overdueCount} overdue</span>
              </div>
            )}
          </div>

        {/* Task List */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : isError ? (
          <div className="rounded-lg py-8 text-center" style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}>
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--g-accent)" }} />
            <p className="text-sm" style={{ color: "var(--g-text-secondary)" }}>
              Failed to load tasks. Make sure GHL is connected and try again.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>Retry</Button>
          </div>
        ) : totalTasks === 0 ? (
          <div className="rounded-lg py-12 text-center" style={{ background: "var(--g-bg-card)", border: "1px solid var(--g-border-subtle)" }}>
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3" style={{ color: "oklch(0.7 0.15 150)" }} />
            <h3 className="font-semibold text-lg" style={{ color: "var(--g-text-primary)" }}>All Clear</h3>
            <p className="text-sm mt-1" style={{ color: "var(--g-text-secondary)" }}>
              {selectedMember !== "all" ? "No pending tasks for this team member." : "No pending tasks. Great work!"}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredTasks.map((task: Task, index: number) => (
              <PriorityTaskRow
                key={task.id}
                task={task}
                rank={index + 1}
                onComplete={() => handleComplete(task)}
                onEdit={() => handleEdit(task)}
                onDelete={() => handleDelete(task)}
                onExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                isExpanded={expandedTaskId === task.id}
                isCompleting={completingTaskIds.has(task.id)}
                allTasks={filteredTasks}
                batchAmPm={batchAmPm}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update the task details below. Changes will sync to GHL.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Task title..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-body">Description</Label>
              <Textarea id="edit-body" value={editBody} onChange={(e) => setEditBody(e.target.value)} placeholder="Task description (optional)..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-due-date">Due Date</Label>
              <Input id="edit-due-date" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={!editTitle.trim() || editTaskMutation.isPending}>
              {editTaskMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingTask} onOpenChange={(open) => !open && setDeletingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>Are you sure you want to delete this task? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {deletingTask && (
            <div className="rounded-md p-3" style={{ background: "var(--g-bg-inset)", border: "1px solid var(--g-border-subtle)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>{deletingTask.title}</p>
              {deletingTask.contactName && (
                <p className="text-xs mt-1" style={{ color: "var(--g-text-secondary)" }}>
                  {deletingTask.contactName}{deletingTask.contactAddress ? ` — ${deletingTask.contactAddress}` : ""}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTask(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteTaskMutation.isPending}>
              {deleteTaskMutation.isPending ? "Deleting..." : "Delete Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
