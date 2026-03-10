"use client";

import { useState } from "react";
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
import { trpc } from "@/lib/trpc";

export function Today() {
  const { isLoading } = useTenantConfig();
  const { executeAction, isExecuting, result, reset } = useAction();
  const [search, setSearch] = useState("");
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<{ name: string; phone: string; ghlContactId?: string } | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const completeTask = trpc.today.completeTask.useMutation();
  const todayUtils = trpc.useUtils();

  const searchTerm = search.trim() || undefined;
  const { data: convos, isLoading: convosLoading } = trpc.today.getConversations.useQuery({
    search: searchTerm,
    limit: 20,
  });
  const { data: missedCalls } = trpc.today.getMissedCalls.useQuery();
  const { data: appointments } = trpc.today.getAppointments.useQuery();
  const { data: taskData } = trpc.today.getTasks.useQuery();
  const { data: stats } = trpc.today.getStats.useQuery();

  const convosList = convos ?? [];
  const selectedConvData = selectedConv ? convosList.find((c) => c.id === selectedConv) : null;

  const handleSendSms = () => {
    if (!selectedConvData || !replyDraft.trim()) return;
    setSmsDialogOpen(true);
  };

  const confirmSms = () => {
    if (!selectedConvData || !replyDraft.trim()) return;
    const contactId = selectedConvData.ghlContactId ?? selectedConvData.id;
    executeAction("sms", contactId, { message: replyDraft, toPhone: selectedConvData.phone });
  };

  const openCallBack = (name: string, phone: string, ghlContactId?: string) => {
    setCallTarget({ name, phone, ghlContactId });
    setCallDialogOpen(true);
  };

  const confirmCallBack = () => {
    if (!callTarget) return;
    const contactId = callTarget.ghlContactId ?? callTarget.phone;
    executeAction("sms", contactId, { message: `Hi ${callTarget.name}, I saw I missed your call. When's a good time to connect?`, toPhone: callTarget.phone });
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
      {stats && (
        <div className="flex gap-4 text-sm text-[var(--g-text-secondary)]">
          <span>{stats.callsToday} calls today</span>
          <span>{stats.propertyCount} properties</span>
          <span>{stats.tasksToday} tasks</span>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-[55%_45%]">
        <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-2 py-4">
            <CardTitle className="text-base font-semibold text-[var(--g-text-primary)]">Messages</CardTitle>
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
                  {convosLoading ? (
                    Array.from({ length: 5 }).map((_, i) => <div key={i} className="p-2.5 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-32" /></div>)
                  ) : convosList.length === 0 ? (
                    <p className="p-4 text-sm text-[var(--g-text-tertiary)]">No conversations</p>
                  ) : (
                    convosList.map((c) => (
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
                        <span className="font-medium text-sm truncate block">{c.name}</span>
                        <p className="text-xs text-[var(--g-text-tertiary)] truncate mt-0.5">
                          {c.phone}
                        </p>
                        {c.lastContactDate && (
                          <p className="text-[10px] text-[var(--g-text-tertiary)] mt-1">
                            {new Date(c.lastContactDate).toLocaleDateString()}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="flex-1 flex flex-col min-w-0">
                {selectedConvData ? (
                  <>
                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-3">
                        <div>
                          <p className="font-medium text-sm text-[var(--g-text-primary)]">{selectedConvData.name}</p>
                          <p className="text-xs text-[var(--g-text-tertiary)]">{selectedConvData.phone}</p>
                        </div>
                        {selectedConvData.lastContactDate && (
                          <p className="text-xs text-[var(--g-text-tertiary)]">
                            Last contact: {new Date(selectedConvData.lastContactDate).toLocaleString()}
                          </p>
                        )}
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
              {!appointments?.length ? <p className="py-4 px-3 text-sm text-[var(--g-text-tertiary)]">No appointments</p> : (
                appointments.map((a) => <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg text-sm">
                  <span className="font-medium text-[var(--g-text-secondary)] w-16">{a.time || "—"}</span>
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-[var(--g-text-tertiary)]">{a.type}</span>
                </div>)
              )}
            </CardContent>
          </Card>

          <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
            <CardHeader className="py-3 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PhoneMissed className="size-4 text-[var(--g-accent-text)]" />
                Missed Calls
              </CardTitle>
              {missedCalls && missedCalls.length > 0 && (
                <Badge variant="secondary" className="text-xs">{missedCalls.length}</Badge>
              )}
            </CardHeader>
            <CardContent className="py-0 pb-3 space-y-2">
              {!missedCalls?.length ? <p className="py-4 px-3 text-sm text-[var(--g-text-tertiary)]">No missed calls today</p> : (
                missedCalls.map((m) => <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-[var(--g-border-subtle)]">
                  <div>
                    <p className="font-medium text-sm">{m.contactName}</p>
                    <p className="text-xs text-[var(--g-text-tertiary)]">{m.contactPhone} · {m.callTimestamp ? new Date(m.callTimestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openCallBack(m.contactName, m.contactPhone, m.ghlContactId ?? undefined)}>Call Back</Button>
                </div>)
              )}
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
              {!taskData?.tasks?.length ? <p className="py-4 px-3 text-sm text-[var(--g-text-tertiary)]">No tasks</p> : (
                taskData.tasks.map((t) => <div key={t.id} className={cn("flex items-center gap-2 py-2 px-3 rounded-lg text-sm", completedTasks.has(t.id) && "opacity-50 line-through")}>
                  <Checkbox checked={completedTasks.has(t.id)} onCheckedChange={(v) => {
                    const done = !!v;
                    setCompletedTasks((s) => done ? new Set(Array.from(s).concat(t.id)) : new Set(Array.from(s).filter((x) => x !== t.id)));
                    completeTask.mutate({ id: Number(t.id), completed: done }, { onSuccess: () => void todayUtils.today.getTasks.invalidate() });
                  }}
                  />
                  <div className="flex-1 min-w-0"><p className="truncate">{t.title}</p>{t.contact && <p className="text-xs text-[var(--g-text-tertiary)]">{t.contact}</p>}</div>
                </div>)
              )}
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
