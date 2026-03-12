import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Sparkles, Send, Minus, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useTenantConfig } from "@/hooks/useTenantConfig";

interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

interface CallsAiCoachPanelProps {
  activeCallTypeFilter?: string;
}

export function CallsAiCoachPanel({ activeCallTypeFilter }: CallsAiCoachPanelProps) {
  const { callTypes } = useTenantConfig();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const chatMutation = trpc.ai.chat.useMutation();
  const { data: history } = trpc.ai.getHistory.useQuery({ limit: 20 });

  // Seed messages from history on first load
  useEffect(() => {
    if (history && messages.length === 0) {
      const seeded: CoachMessage[] = [...history]
        .reverse()
        .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));
      if (seeded.length > 0) setMessages(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    chatMutation.mutate(
      { message: msg, page: "calls", pageContext: { activePage: "calls" } },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        },
      },
    );
  };

  // Resolve chips from the active call type filter, or show generic
  const activeType = callTypes.find((ct) => ct.code === activeCallTypeFilter);
  const coachingChips = activeType?.coachingChips ?? [
    "What should I focus on?",
    "Tips for handling objections",
    "How to improve my grade?",
  ];
  const actionChips = activeType?.actionChips ?? [
    "Add a note to this contact",
    "Create a follow-up task",
    "Send an SMS",
  ];

  return (
    <Card className="border-[var(--g-border-subtle)] bg-white rounded-lg shadow-sm flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--g-border-subtle)]">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--g-accent-text)]" />
          <span className="text-sm font-semibold text-[var(--g-text-primary)]">AI Coach</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setMinimized(!minimized)}
        >
          {minimized ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
        </Button>
      </div>

      {minimized ? null : (
        <>
          <p className="px-3 pt-2 text-xs text-[var(--g-text-tertiary)]">
            Ask questions or give CRM commands
          </p>

          <ScrollArea className="flex-1 px-3 min-h-0 h-[400px]">
            <div className="space-y-3 py-2">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-6">
                  <Sparkles className="size-8 text-[var(--g-text-tertiary)] opacity-40" />
                  <p className="text-sm text-[var(--g-text-tertiary)] text-center">
                    Ask questions or take actions
                  </p>

                  {/* Coaching chips */}
                  <div className="w-full space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--g-text-tertiary)]">
                      Coaching
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {coachingChips.map((chip) => (
                        <button
                          key={chip}
                          onClick={() => handleSend(chip)}
                          className="text-xs px-3 py-1.5 rounded-full border border-[var(--g-border-subtle)] text-[var(--g-text-secondary)] hover:text-[var(--g-accent-text)] hover:border-[var(--g-accent-medium)] transition-colors text-left"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action chips */}
                  <div className="w-full space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--g-text-tertiary)]">
                      <span className="mr-1">✦</span> Actions
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {actionChips.map((chip) => (
                        <button
                          key={chip}
                          onClick={() => handleSend(chip)}
                          className="text-xs px-3 py-1.5 rounded-full border border-[var(--g-border-subtle)] text-[var(--g-text-secondary)] hover:text-[var(--g-accent-text)] hover:border-[var(--g-accent-medium)] transition-colors text-left"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "max-w-[90%] px-3 py-2 text-sm whitespace-pre-wrap",
                        msg.role === "user"
                          ? "ml-auto bg-[var(--g-accent-soft)] rounded-2xl rounded-br-sm text-[var(--g-text-primary)]"
                          : "bg-[var(--g-bg-inset)] rounded-2xl rounded-bl-sm text-[var(--g-text-primary)]",
                      )}
                    >
                      {msg.content}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              {chatMutation.isPending && (
                <div className="flex items-center gap-2 text-xs text-[var(--g-text-tertiary)]">
                  <div className="size-4 animate-spin rounded-full border-2 border-[var(--g-border-medium)] border-t-[var(--g-accent)]" />
                  Thinking...
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t border-[var(--g-border-subtle)] flex gap-2">
            <Input
              placeholder="Ask your coach..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 h-8 text-sm bg-[var(--g-bg-surface)] border-[var(--g-border-subtle)]"
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            />
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={() => handleSend()}
              disabled={!input.trim() || chatMutation.isPending}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
