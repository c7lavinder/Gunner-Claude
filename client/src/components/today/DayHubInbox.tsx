import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Calendar, PhoneOff, Check, Send, X, ExternalLink, Phone, MessageSquare, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { ConvoItem } from "@/hooks/useTodayData";
import { relativeTime, presenceDotColor } from "@/hooks/useTodayData";

interface MissedCall {
  id: string;
  contactName: string;
  contactPhone: string;
  callTimestamp?: Date | string | null;
  ghlContactId?: string | null;
}

interface Appointment {
  id: string;
  time: string;
  name: string;
  type: string;
  status: string;
}

interface DayHubInboxProps {
  conversations: ConvoItem[];
  missedCalls: MissedCall[];
  appointments: Appointment[];
  leftTab: "inbox" | "apts";
  setLeftTab: (tab: "inbox" | "apts") => void;
  inboxSub: "sms" | "missed";
  setInboxSub: (sub: "sms" | "missed") => void;
  selectedConv: ConvoItem | null;
  setSelectedConv: (c: ConvoItem | null) => void;
  onCallBack: (name: string) => void;
  missedCount: number;
  unreadTotal: number;
}

export function DayHubInbox({
  conversations,
  missedCalls,
  appointments,
  leftTab,
  setLeftTab,
  inboxSub,
  setInboxSub,
  selectedConv,
  setSelectedConv,
  onCallBack,
  missedCount,
  unreadTotal,
}: DayHubInboxProps) {
  const unreadConvos = conversations.filter((c) => (c.unreadCount ?? 0) > 0);
  const readConvos = conversations.filter((c) => !c.unreadCount);

  return (
    <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
      {/* Pill tabs */}
      <div className="flex items-center gap-2 px-4 pt-4">
        {(["inbox", "apts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setLeftTab(tab)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm transition-colors flex items-center gap-1.5",
              leftTab === tab
                ? "bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] font-semibold border border-[var(--g-accent-medium)]"
                : "text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)]",
            )}
          >
            {tab === "inbox" ? "Inbox" : "Apts"}
            {tab === "inbox" && unreadTotal > 0 && (
              <Badge className="bg-[var(--g-accent)] text-white rounded-full px-2 text-xs">
                {unreadTotal}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Inbox content */}
      {leftTab === "inbox" && (
        <div className="flex flex-col flex-1 min-h-0 p-4 pt-3 gap-3">
          {/* Sub-tabs with counts */}
          <div className="flex gap-4 border-b border-[var(--g-border-subtle)] relative">
            {(["sms", "missed"] as const).map((sub) => (
              <button
                key={sub}
                onClick={() => { setInboxSub(sub); setSelectedConv(null); }}
                className={cn(
                  "pb-2 text-sm font-medium transition-colors relative flex items-center gap-1.5",
                  inboxSub === sub
                    ? "text-[var(--g-accent-text)]"
                    : "text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)]",
                )}
              >
                {sub === "sms" ? "SMS Messages" : "Missed Calls"}
                {sub === "missed" && missedCount > 0 && (
                  <Badge className="bg-[var(--g-grade-f)] text-white rounded-full px-1.5 text-[10px]">
                    {missedCount}
                  </Badge>
                )}
                {inboxSub === sub && (
                  <motion.div
                    layoutId="inbox-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--g-accent)]"
                    transition={{ duration: 0.2 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Split-pane: conversation list + inline thread */}
          <div className="flex flex-1 min-h-0 gap-0">
            {/* Left side: conversation / missed list */}
            <div className={cn(
              "flex-1 min-h-0 transition-all",
              selectedConv ? "hidden lg:block lg:w-[45%] lg:flex-none lg:border-r lg:border-[var(--g-border-subtle)] lg:pr-3" : "w-full",
            )}>
              <AnimatePresence mode="wait">
                {inboxSub === "sms" && (
                  <motion.div key="sms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                    <ScrollArea className="max-h-[360px]">
                      {!conversations.length ? (
                        <p className="text-sm text-[var(--g-text-tertiary)] py-8 text-center">No conversations yet</p>
                      ) : (
                        <div className="space-y-1 pr-1">
                          {/* Unread section */}
                          {unreadConvos.length > 0 && (
                            <>
                              <p className="text-[10px] font-semibold text-[var(--g-text-tertiary)] uppercase tracking-wider px-1 pt-1">
                                Unread ({unreadConvos.length})
                              </p>
                              {unreadConvos.map((c) => (
                                <ConvoRow key={c.id} convo={c} isSelected={selectedConv?.id === c.id} onClick={() => setSelectedConv(c)} />
                              ))}
                            </>
                          )}
                          {/* Read section */}
                          {readConvos.length > 0 && unreadConvos.length > 0 && (
                            <p className="text-[10px] font-semibold text-[var(--g-text-tertiary)] uppercase tracking-wider px-1 pt-2">
                              Earlier
                            </p>
                          )}
                          {readConvos.map((c) => (
                            <ConvoRow key={c.id} convo={c} isSelected={selectedConv?.id === c.id} onClick={() => setSelectedConv(c)} />
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </motion.div>
                )}

                {inboxSub === "missed" && (
                  <motion.div key="missed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                    <ScrollArea className="max-h-[360px]">
                      {!missedCalls.length ? (
                        <div className="py-8 text-center space-y-2">
                          <Check className="size-6 mx-auto text-[var(--g-grade-a)]" />
                          <p className="text-sm text-[var(--g-text-secondary)]">No missed calls today</p>
                        </div>
                      ) : (
                        <div className="space-y-2 pr-1">
                          {missedCalls.map((m) => (
                            <motion.div
                              key={m.id}
                              whileHover={{ y: -1 }}
                              transition={{ duration: 0.15 }}
                              className="bg-[var(--g-bg-card)] border border-[var(--g-border-subtle)] rounded-xl px-4 py-3"
                            >
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-full bg-[var(--g-bg-inset)] flex items-center justify-center shrink-0">
                                  <PhoneOff className="size-4 text-[var(--g-grade-f)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[var(--g-text-primary)]">{m.contactName}</p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--g-text-tertiary)]">{m.contactPhone}</span>
                                    <span className="text-xs text-[var(--g-grade-f)]">Missed call</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-[var(--g-text-tertiary)]">
                                    {m.callTimestamp ? relativeTime(m.callTimestamp) : ""}
                                  </span>
                                  <Button size="sm" variant="outline" onClick={() => onCallBack(m.contactName)}>
                                    Call Back
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right side: inline thread panel */}
            <AnimatePresence>
              {selectedConv && inboxSub === "sms" && (
                <motion.div
                  key="thread"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 lg:flex-none lg:w-[55%] flex flex-col min-h-0 pl-3"
                >
                  <InlineThread
                    conversation={selectedConv}
                    onClose={() => setSelectedConv(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Apts content */}
      {leftTab === "apts" && (
        <div className="flex-1 min-h-0 p-4 pt-3">
          <ScrollArea className="max-h-[440px]">
            {!appointments.length ? (
              <EmptyState icon={Calendar} title="No appointments today" description="Scheduled appointments will appear here." />
            ) : (
              <div className="space-y-2 pr-1">
                {appointments.map((a) => (
                  <motion.div
                    key={a.id}
                    whileHover={{ y: -1 }}
                    transition={{ duration: 0.15 }}
                    className="bg-[var(--g-bg-card)] border border-[var(--g-border-subtle)] rounded-xl px-4 py-3 flex items-center gap-3"
                  >
                    <Badge className="bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] text-xs font-mono rounded px-2 py-0.5 shrink-0">
                      {a.time || "TBD"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--g-text-primary)] truncate">{a.name}</p>
                      <p className="text-xs text-[var(--g-text-secondary)]">{a.type}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => toast("Prep view coming soon")}>Prep</Button>
                  </motion.div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </Card>
  );
}

/* ── Conversation Row ── */

function ConvoRow({ convo, isSelected, onClick }: { convo: ConvoItem; isSelected: boolean; onClick: () => void }) {
  const isUnread = (convo.unreadCount ?? 0) > 0;
  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={cn(
        "border rounded-xl px-3 py-2.5 cursor-pointer transition-colors",
        isSelected
          ? "bg-[var(--g-accent-soft)] border-[var(--g-accent-medium)]"
          : "bg-[var(--g-bg-card)] border-[var(--g-border-subtle)] hover:border-[var(--g-accent-medium)]",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="size-9 rounded-full bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] flex items-center justify-center text-sm font-bold">
            {convo.name.charAt(0).toUpperCase()}
          </div>
          <div className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--g-bg-card)]", presenceDotColor(convo.lastContactDate))} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className={cn("text-sm truncate", isUnread ? "font-semibold text-[var(--g-text-primary)]" : "font-medium text-[var(--g-text-primary)]")}>
              {convo.name}
            </p>
            <span className="text-[10px] text-[var(--g-text-tertiary)] shrink-0 ml-2">
              {convo.lastContactDate ? relativeTime(convo.lastContactDate) : ""}
            </span>
          </div>
          {convo.lastMessageBody ? (
            <p className={cn("text-xs truncate", isUnread ? "text-[var(--g-text-secondary)]" : "text-[var(--g-text-tertiary)]")}>
              {convo.lastMessageBody}
            </p>
          ) : (
            <p className="text-xs text-[var(--g-text-tertiary)]">{convo.phone}</p>
          )}
        </div>
        {isUnread && (
          <Badge className="bg-[var(--g-accent)] text-white rounded-full size-5 flex items-center justify-center text-[10px] p-0 shrink-0">
            {convo.unreadCount}
          </Badge>
        )}
      </div>
    </motion.div>
  );
}

/* ── Inline Thread Panel ── */

function InlineThread({ conversation, onClose }: { conversation: ConvoItem; onClose: () => void }) {
  const { user } = useAuth();
  const [compose, setCompose] = useState("");

  // Load recent activity for this contact
  const { data: activity, isLoading } = trpc.today.getContactContext.useQuery(
    { phone: conversation.phone },
    { enabled: !!conversation.phone },
  );

  const handleSend = () => {
    const msg = compose.trim();
    if (!msg) return;
    toast("SMS sending via CRM — coming soon");
    setCompose("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--g-border-subtle)]">
        <div className="size-8 rounded-full bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] flex items-center justify-center text-xs font-bold shrink-0">
          {conversation.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--g-text-primary)] truncate">{conversation.name}</p>
          <p className="text-[10px] text-[var(--g-text-tertiary)]">{conversation.phone}</p>
        </div>
        {conversation.ghlContactId && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => toast("Open in GHL — CRM link coming soon")}
          >
            <ExternalLink className="size-3 mr-1" /> GHL
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Activity feed */}
      <ScrollArea className="flex-1 min-h-0 max-h-[260px] py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-5 animate-spin rounded-full border-2 border-[var(--g-border-medium)] border-t-[var(--g-accent)]" />
          </div>
        ) : !activity?.length ? (
          <div className="py-8 text-center">
            <MessageSquare className="size-5 mx-auto text-[var(--g-text-tertiary)] mb-2" />
            <p className="text-xs text-[var(--g-text-tertiary)]">No recent activity with this contact</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activity.map((item) => (
              <div key={item.id} className="rounded-lg bg-[var(--g-bg-inset)] px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <Phone className="size-3 text-[var(--g-text-tertiary)]" />
                  <span className="text-[10px] font-medium text-[var(--g-text-secondary)]">
                    Call {item.grade ? `• Grade: ${item.grade}` : ""}
                  </span>
                  <span className="text-[10px] text-[var(--g-text-tertiary)] ml-auto">
                    {item.duration ? `${Math.floor(item.duration / 60)}m ${item.duration % 60}s` : ""}
                  </span>
                </div>
                <p className="text-xs text-[var(--g-text-tertiary)]">
                  {item.createdAt ? relativeTime(item.createdAt) : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Compose */}
      <div className="pt-2 border-t border-[var(--g-border-subtle)] space-y-2">
        <Textarea
          placeholder={`Reply as ${user?.name ?? "You"}...`}
          value={compose}
          onChange={(e) => setCompose(e.target.value)}
          className="min-h-[56px] text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSend} disabled={!compose.trim()}>
            <Send className="size-3.5 mr-1" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
