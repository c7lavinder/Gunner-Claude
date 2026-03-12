import { useState, useEffect, useRef } from "react";
import { MessageCircle, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gunner-ai-coach-open";

function simpleMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

export function AiCoach({
  page,
  pageContext,
}: {
  page: string;
  pageContext?: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: history } = trpc.ai.getHistory.useQuery({ limit: 20 });
  const chatMutation = trpc.ai.chat.useMutation();
  const utils = trpc.useUtils();

  const messages = history ? [...history].reverse() : [];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(open));
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setInput("");
    chatMutation.mutate(
      { message: text, page, pageContext },
      {
        onSuccess: () => {
          void utils.ai.getHistory.invalidate();
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        {open ? (
          <div
            className={cn(
              "g-glass flex flex-col overflow-hidden rounded-xl shadow-lg border",
              "w-[400px] h-[500px] animate-in slide-in-from-bottom-4 duration-300",
              "border-[var(--g-border-subtle)]"
            )}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--g-border-subtle)]">
              <span className="font-semibold text-base">Gunner AI</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close">
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
              <div className="flex flex-col gap-4 pb-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.role === "user"
                        ? "ml-auto bg-[var(--g-accent)] text-white"
                        : "mr-auto bg-[var(--g-bg-inset)] text-[var(--g-text-primary)]"
                    )}
                  >
                    {m.role === "user" ? (
                      m.content
                    ) : (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none [&_strong]:font-semibold"
                        dangerouslySetInnerHTML={{ __html: simpleMarkdown(m.content) }}
                      />
                    )}
                  </div>
                ))}
                {chatMutation.isPending && (
                  <div className="mr-auto flex gap-1 rounded-lg bg-[var(--g-bg-inset)] px-3 py-2">
                    <span className="size-2 animate-bounce rounded-full bg-[var(--g-text-tertiary)] [animation-delay:-0.3s]" />
                    <span className="size-2 animate-bounce rounded-full bg-[var(--g-text-tertiary)] [animation-delay:-0.15s]" />
                    <span className="size-2 animate-bounce rounded-full bg-[var(--g-text-tertiary)]" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 p-4 pt-2 border-t border-[var(--g-border-subtle)]">
              <Input
                placeholder="Ask Gunner AI..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={chatMutation.isPending}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={!input.trim() || chatMutation.isPending} size="default">
                Send
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setOpen(true)}
            className="h-12 w-12 rounded-full bg-gradient-to-br from-[var(--g-accent)] to-[var(--g-accent-light)] text-white shadow-lg hover:opacity-90 transition-opacity"
            aria-label="Open AI Coach"
          >
            <MessageCircle className="size-5" />
          </Button>
        )}
      </div>
    </>
  );
}
