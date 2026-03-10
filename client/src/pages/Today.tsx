"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, Send, PhoneMissed, Calendar, CheckSquare } from "lucide-react";
import { ActionConfirmDialog } from "@/components/actions/ActionConfirmDialog";
import { useAction } from "@/hooks/useActions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Link } from "wouter";

const MOCK_CONVOS = [
  { id: "1", name: "Sarah Mitchell", phone: "+1 555-0123", lastMsg: "Thanks for the update on the property!", time: "2m ago", unread: true },
  { id: "2", name: "James Chen", phone: "+1 555-0124", lastMsg: "Can we schedule a walkthrough for Thursday?", time: "15m ago", unread: true },
  { id: "3", name: "Maria Garcia", phone: "+1 555-0125", lastMsg: "I'll send over the paperwork by EOD.", time: "1h ago", unread: false },
  { id: "4", name: "David Park", phone: "+1 555-0126", lastMsg: "Great meeting you today!", time: "2h ago", unread: false },
  { id: "5", name: "Emily Watson", phone: "+1 555-0127", lastMsg: "What's the status on the inspection?", time: "Yesterday", unread: false },
  { id: "6", name: "Robert Lee", phone: "+1 555-0128", lastMsg: "Confirming our 3pm appointment.", time: "Yesterday", unread: true },
];
const MOCK_MSGS: Record<string, { dir: "in" | "out"; text: string; time: string }[]> = {
  "1": [{ dir: "out", text: "Hi Sarah, here's the update on the property.", time: "10:28 AM" }, { dir: "in", text: "Thanks for the update on the property!", time: "10:30 AM" }],
  "2": [{ dir: "in", text: "Can we schedule a walkthrough for Thursday?", time: "10:15 AM" }, { dir: "out", text: "Absolutely. I have 2pm or 4pm available.", time: "10:18 AM" }],
};
const MOCK_APTS = [
  { id: "a1", time: "9:00 AM", name: "Sarah Mitchell", type: "Walkthrough", status: "completed" as const },
  { id: "a2", time: "2:00 PM", name: "James Chen", type: "Walkthrough", status: "in-progress" as const },
  { id: "a3", time: "4:30 PM", name: "David Park", type: "Closing", status: "upcoming" as const },
];
const MOCK_MISSED = [
  { id: "m1", name: "Maria Garcia", phone: "+1 555-0125", time: "11:42 AM" },
  { id: "m2", name: "Emily Watson", phone: "+1 555-0127", time: "9:15 AM" },
];
const MOCK_TASKS = [
  { id: "t1", title: "Send inspection report", contact: "Sarah Mitchell", due: "12:00 PM" },
  { id: "t2", title: "Follow up on offer", contact: "James Chen", due: "3:00 PM" },
  { id: "t3", title: "Prepare closing docs", contact: "David Park", due: "4:00 PM" },
  { id: "t4", title: "Schedule next walkthrough", contact: "Robert Lee", due: "5:00 PM" },
];

export function Today() {
  const { isLoading } = useTenantConfig();
  const { executeAction, isExecuting, result, reset } = useAction();
  const [search, setSearch] = useState("");
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<{ name: string; phone: string } | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  const filteredConvs = useMemo(() => MOCK_CONVOS.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())), [search]);
  const unreadCount = MOCK_CONVOS.filter((c) => c.unread).length;
  const selectedConvData = selectedConv ? MOCK_CONVOS.find((c) => c.id === selectedConv) : null;
  const messages = selectedConv ? (MOCK_MSGS[selectedConv] ?? []) : [];

  const handleSendSms = () => {
    if (!selectedConvData || !replyDraft.trim()) return;
    setSmsDialogOpen(true);
  };

  const confirmSms = () => {
    if (!selectedConvData || !replyDraft.trim()) return;
    executeAction("sms", selectedConvData.id, {
      message: replyDraft,
      toPhone: selectedConvData.phone,
    });
  };

  const openCallBack = (name: string, phone: string) => {
    setCallTarget({ name, phone });
    setCallDialogOpen(true);
  };

  const confirmCallBack = () => {
    if (!callTarget) return;
    executeAction("workflow", "contact-id", { action: "call_back", phone: callTarget.phone });
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col gap-4 p-4 md:p-6">
        <div className="g-shimmer h-8 w-48 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-[55%_45%]">
          <Skeleton className="h-[400px] rounded-xl" />
          <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-32 rounded-xl" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col gap-4 p-4 md:p-6 bg-[var(--g-bg-base)]">
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-[55%_45%]">
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-2 py-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold text-[var(--g-text-primary)]">Messages</CardTitle>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] text-xs">
                  {unreadCount}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 min-h-0 p-0">
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-[var(--g-text-tertiary)]" />
                <Input
                  placeholder="Search conversations"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
                />
              </div>
            </div>
            <div className="flex flex-1 min-h-0 border-t border-[var(--g-border-subtle)]">
              <ScrollArea className="w-full md:w-48 lg:w-52 shrink-0 border-r border-[var(--g-border-subtle)]">
                <div className="p-2 space-y-0.5">
                  {filteredConvs.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedConv(c.id)}
                      className={cn(
                        "w-full text-left p-2.5 rounded-lg transition-colors",
                        selectedConv === c.id
                          ? "bg-[var(--g-accent-soft)] text-[var(--g-accent-text)]"
                          : "hover:bg-[var(--g-bg-surface)] text-[var(--g-text-primary)]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-medium text-sm truncate">{c.name}</span>
                        {c.unread && <span className="size-2 rounded-full bg-[var(--g-accent-text)] shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-xs text-[var(--g-text-tertiary)] truncate mt-0.5">{c.lastMsg}</p>
                      <p className="text-[10px] text-[var(--g-text-tertiary)] mt-1">{c.time}</p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex-1 flex flex-col min-w-0">
                {selectedConvData ? (
                  <>
                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-3">
                        {messages.map((m, i) => (
                          <div
                            key={i}
                            className={cn(
                              "max-w-[85%] rounded-lg px-3 py-2",
                              m.dir === "out"
                                ? "ml-auto bg-[var(--g-accent-soft)] text-[var(--g-accent-text)]"
                                : "bg-[var(--g-bg-surface)] text-[var(--g-text-secondary)] border border-[var(--g-border-subtle)]"
                            )}
                          >
                            <p className="text-sm">{m.text}</p>
                            <p className="text-[10px] text-[var(--g-text-tertiary)] mt-1">{m.time}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="p-3 border-t border-[var(--g-border-subtle)] flex gap-2">
                      <Input
                        placeholder="Type a message..."
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        className="flex-1 h-8 text-sm"
                      />
                      <Button size="icon-sm" onClick={handleSendSms} disabled={!replyDraft.trim()}>
                        <Send className="size-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[var(--g-text-tertiary)] text-sm">
                    Select a conversation
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="size-4 text-[var(--g-accent-text)]" />
                Appointments Today
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3 space-y-2">
              {MOCK_APTS.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 rounded-lg text-sm",
                    a.status === "in-progress" && "bg-[var(--g-accent-soft)] text-[var(--g-accent-text)]",
                    a.status === "completed" && "opacity-60 text-[var(--g-text-tertiary)]"
                  )}
                >
                  <span className="font-medium text-[var(--g-text-secondary)] w-16">{a.time}</span>
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-[var(--g-text-tertiary)]">{a.type}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
            <CardHeader className="py-3 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PhoneMissed className="size-4 text-[var(--g-accent-text)]" />
                Missed Calls
              </CardTitle>
              <Badge variant="secondary" className="text-xs">{MOCK_MISSED.length}</Badge>
            </CardHeader>
            <CardContent className="py-0 pb-3 space-y-2">
              {MOCK_MISSED.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-[var(--g-border-subtle)]">
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-[var(--g-text-tertiary)]">{m.phone} · {m.time}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openCallBack(m.name, m.phone)}>
                    Call Back
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
            <CardHeader className="py-3 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare className="size-4 text-[var(--g-accent-text)]" />
                Tasks Due Today
              </CardTitle>
              <Link href="/inventory">
                <a className="text-xs text-[var(--g-accent-text)] hover:underline">View All</a>
              </Link>
            </CardHeader>
            <CardContent className="py-0 pb-3 space-y-1">
              {MOCK_TASKS.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 py-2 px-3 rounded-lg text-sm",
                    completedTasks.has(t.id) && "opacity-50 line-through"
                  )}
                >
                  <Checkbox
                    checked={completedTasks.has(t.id)}
                    onCheckedChange={(v) =>
                      setCompletedTasks((s) => (v ? new Set(Array.from(s).concat(t.id)) : new Set(Array.from(s).filter((x) => x !== t.id))))
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{t.title}</p>
                    <p className="text-xs text-[var(--g-text-tertiary)]">{t.contact} · {t.due}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <ActionConfirmDialog open={smsDialogOpen} onOpenChange={(o) => { setSmsDialogOpen(o); if (!o) reset(); }}
        action={{ type: "sms", from: { name: "You", phone: "" }, to: { name: selectedConvData?.name ?? "", phone: selectedConvData?.phone ?? "" }, payload: { message: replyDraft } }}
        onConfirm={() => { confirmSms(); setReplyDraft(""); }} isExecuting={isExecuting} result={result} />
      {callTarget && (
        <ActionConfirmDialog open={callDialogOpen} onOpenChange={(o) => { setCallDialogOpen(o); if (!o) setCallTarget(null); reset(); }}
          action={{ type: "workflow", from: { name: "You" }, to: { name: callTarget.name, phone: callTarget.phone }, payload: { action: "call_back", phone: callTarget.phone } }}
          onConfirm={confirmCallBack} isExecuting={isExecuting} result={result} />
      )}
    </div>
  );
}
