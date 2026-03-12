import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Calendar, PhoneOff, Check } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import type { ConvoItem } from "@/hooks/useTodayData";
import { relativeTime } from "@/hooks/useTodayData";

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
}: DayHubInboxProps) {
  return (
    <>
      <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] flex flex-col overflow-hidden">
        {/* Pill tabs */}
        <div className="flex items-center gap-2 px-4 pt-4">
          {(["inbox", "apts"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setLeftTab(tab)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm transition-colors",
                leftTab === tab
                  ? "bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] font-semibold border border-[var(--g-accent-medium)]"
                  : "text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)]",
              )}
            >
              {tab === "inbox" ? "Inbox" : "Apts"}
              {tab === "inbox" && missedCount > 0 && (
                <Badge className="ml-1.5 bg-[var(--g-grade-b)] text-white rounded-full px-2 text-xs">
                  {missedCount}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* Inbox content */}
        {leftTab === "inbox" && (
          <div className="flex flex-col flex-1 min-h-0 p-4 pt-3 gap-3">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-[var(--g-text-primary)]">Communications</h2>
              {conversations.length > 0 && (
                <Badge className="bg-[var(--g-grade-b)] text-white rounded-full px-2 text-xs">
                  {conversations.length}
                </Badge>
              )}
              <div className="flex-1" />
            </div>

            {/* Sub-tabs with animated indicator */}
            <div className="flex gap-4 border-b border-[var(--g-border-subtle)] relative">
              {(["sms", "missed"] as const).map((sub) => (
                <button
                  key={sub}
                  onClick={() => setInboxSub(sub)}
                  className={cn(
                    "pb-2 text-sm font-medium transition-colors relative",
                    inboxSub === sub
                      ? "text-[var(--g-accent-text)]"
                      : "text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)]",
                  )}
                >
                  {sub === "sms" ? "SMS Messages" : "Missed Calls"}
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

            <AnimatePresence mode="wait">
              {inboxSub === "sms" && (
                <motion.div
                  key="sms"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-h-0"
                >
                  <ScrollArea className="max-h-[360px]">
                    {!conversations.length ? (
                      <p className="text-sm text-[var(--g-text-tertiary)] py-8 text-center">
                        No conversations yet
                      </p>
                    ) : (
                      <div className="space-y-2 pr-1">
                        {conversations.map((c) => (
                          <motion.div
                            key={c.id}
                            whileHover={{ y: -1 }}
                            transition={{ duration: 0.15 }}
                            onClick={() => setSelectedConv(c)}
                            className="bg-[var(--g-bg-card)] border border-[var(--g-border-subtle)] rounded-xl px-4 py-3 cursor-pointer hover:border-[var(--g-accent-medium)] transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="size-9 rounded-full bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] flex items-center justify-center text-sm font-bold shrink-0">
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium text-[var(--g-text-primary)] truncate">
                                    {c.name}
                                  </p>
                                  <span className="text-xs text-[var(--g-text-tertiary)] shrink-0 ml-2">
                                    {c.lastContactDate ? relativeTime(c.lastContactDate) : ""}
                                  </span>
                                </div>
                                <p className="text-xs text-[var(--g-text-tertiary)]">{c.phone}</p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </motion.div>
              )}

              {inboxSub === "missed" && (
                <motion.div
                  key="missed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-h-0"
                >
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
                                <p className="text-sm font-medium text-[var(--g-text-primary)]">
                                  {m.contactName}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-[var(--g-text-tertiary)]">
                                    {m.contactPhone}
                                  </span>
                                  <span className="text-xs text-[var(--g-grade-f)]">Missed call</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-[var(--g-text-tertiary)]">
                                  {m.callTimestamp ? relativeTime(m.callTimestamp) : ""}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onCallBack(m.contactName)}
                                >
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
        )}

        {/* Apts content */}
        {leftTab === "apts" && (
          <div className="flex-1 min-h-0 p-4 pt-3">
            <ScrollArea className="max-h-[440px]">
              {!appointments.length ? (
                <EmptyState
                  icon={Calendar}
                  title="No appointments today"
                  description="Scheduled appointments will appear here."
                />
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
                        <p className="text-sm font-medium text-[var(--g-text-primary)] truncate">
                          {a.name}
                        </p>
                        <p className="text-xs text-[var(--g-text-secondary)]">{a.type}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toast("Prep view coming soon")}
                      >
                        Prep
                      </Button>
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </Card>

      {/* Conversation Modal */}
      <ConversationModal conversation={selectedConv} onClose={() => setSelectedConv(null)} />
    </>
  );
}

/* ── Conversation Modal ── */

function ConversationModal({
  conversation,
  onClose,
}: {
  conversation: ConvoItem | null;
  onClose: () => void;
}) {
  if (!conversation) return null;

  return (
    <Dialog open={!!conversation} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{conversation.name}</DialogTitle>
          <p className="text-xs text-[var(--g-text-tertiary)]">{conversation.phone}</p>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] flex items-center justify-center text-base font-bold">
              {conversation.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--g-text-primary)]">{conversation.name}</p>
              <p className="text-xs text-[var(--g-text-tertiary)]">{conversation.phone}</p>
            </div>
          </div>

          <div className="rounded-lg bg-[var(--g-bg-inset)] p-4 space-y-2">
            <p className="text-xs font-medium text-[var(--g-text-secondary)]">Contact Info</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-[var(--g-text-tertiary)]">Phone</span>
                <p className="text-[var(--g-text-primary)]">{conversation.phone}</p>
              </div>
              <div>
                <span className="text-[var(--g-text-tertiary)]">Last Contact</span>
                <p className="text-[var(--g-text-primary)]">
                  {conversation.lastContactDate
                    ? relativeTime(conversation.lastContactDate)
                    : "No record"}
                </p>
              </div>
            </div>
            {conversation.ghlContactId && (
              <p className="text-xs text-[var(--g-text-tertiary)]">
                CRM ID: {conversation.ghlContactId}
              </p>
            )}
          </div>

          <p className="text-xs text-[var(--g-text-tertiary)] text-center">
            Full conversation thread loads when CRM messaging is connected.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
