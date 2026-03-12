import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MessageSquare, StickyNote, ListTodo, ArrowRightLeft, Send, Users, Phone, Activity, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";
import type { PropertyItem } from "@/hooks/useInventoryData";
import type { StageDef, ActionType, Terminology } from "@shared/types";

interface InventoryDetailSheetProps {
  asset: PropertyItem | null;
  open: boolean;
  onClose: () => void;
  stages: StageDef[];
  getStageColor: (code: string) => string;
  t: Terminology;
  onAction: (type: ActionType, item: PropertyItem, payload: Record<string, unknown>) => void;
  onStageChange: (item: PropertyItem) => void;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <p className="text-sm">
      <span className="text-[var(--g-text-tertiary)]">{label}:</span>{" "}
      <span className="text-[var(--g-text-primary)]">{value ?? "—"}</span>
    </p>
  );
}

function daysInStage(ts: Date | string | null): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / (24 * 60 * 60 * 1000));
}

function BuyersTab() {
  return (
    <EmptyState
      icon={Users}
      title="No matched buyers"
      description="Buyer matching will appear here once configured."
    />
  );
}

function OutreachTab({ asset }: { asset: PropertyItem }) {
  const { data, isLoading } = trpc.calls.list.useQuery(
    { limit: 20 },
    { enabled: !!asset.sellerPhone },
  );
  const allCalls = data?.items ?? [];
  const calls = asset.sellerPhone
    ? allCalls.filter((c: { contactPhone?: string | null }) => c.contactPhone === asset.sellerPhone)
    : [];

  if (!asset.sellerPhone) {
    return (
      <EmptyState
        icon={Phone}
        title="No phone number"
        description="Add a phone number to see outreach history."
      />
    );
  }

  if (isLoading) {
    return <p className="text-sm text-[var(--g-text-tertiary)] py-4">Loading calls...</p>;
  }

  if (calls.length === 0) {
    return (
      <EmptyState
        icon={Phone}
        title="No outreach yet"
        description="Calls and messages to this contact will appear here."
      />
    );
  }

  return (
    <div className="space-y-2">
      {calls.map((c) => (
        <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-[var(--g-bg-surface)]">
          <Phone className="size-4 text-[var(--g-text-tertiary)] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate text-[var(--g-text-primary)]">{c.contactName ?? "Unknown"}</p>
            <p className="text-xs text-[var(--g-text-tertiary)]">
              {c.callTimestamp ? new Date(c.callTimestamp).toLocaleString() : "—"}
              {c.duration != null && ` · ${Math.floor(c.duration / 60)}:${(c.duration % 60).toString().padStart(2, "0")}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityTab() {
  return (
    <EmptyState
      icon={Activity}
      title="No activity yet"
      description="Stage changes, notes, and actions will appear here."
    />
  );
}

function AiTab({ asset }: { asset: PropertyItem }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);
  const chatMutation = trpc.ai.chat.useMutation();

  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setMessage("");
    chatMutation.mutate(
      {
        message: text,
        page: "inventory",
        pageContext: {
          address: asset.address,
          city: asset.city,
          state: asset.state,
          stage: asset.status,
          sellerName: asset.sellerName,
          motivation: asset.motivation,
        },
      },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: "ai", text: data.response }]);
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-[400px]">
      <ScrollArea className="flex-1 min-h-0">
        {messages.length === 0 ? (
          <div className="py-8 text-center">
            <Sparkles className="size-8 mx-auto mb-2 text-[var(--g-text-tertiary)]" />
            <p className="text-sm text-[var(--g-text-tertiary)]">
              Ask about this property — negotiation strategy, comps, or next steps.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "text-sm p-3 rounded-lg max-w-[90%]",
                  m.role === "user"
                    ? "ml-auto bg-[var(--g-accent-soft)] text-[var(--g-text-primary)]"
                    : "bg-[var(--g-bg-surface)] text-[var(--g-text-secondary)]",
                )}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="text-sm p-3 rounded-lg bg-[var(--g-bg-surface)] text-[var(--g-text-tertiary)]">
                Thinking...
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      <div className="flex gap-2 pt-2 border-t border-[var(--g-border-subtle)]">
        <Input
          placeholder="Ask about this property..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          className="flex-1 h-9 text-sm"
        />
        <Button size="sm" onClick={sendMessage} disabled={!message.trim() || chatMutation.isPending}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function InventoryDetailSheet({ asset, open, onClose, stages, getStageColor, t, onAction, onStageChange }: InventoryDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" side="right">
        {asset && (
          <>
            <SheetHeader>
              <SheetTitle>{asset.address}</SheetTitle>
            </SheetHeader>
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="buyers" className="text-xs">Buyers</TabsTrigger>
                <TabsTrigger value="outreach" className="text-xs">Outreach</TabsTrigger>
                <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
                <TabsTrigger value="ai" className="text-xs">AI</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="mt-4 space-y-4">
                <Badge className={cn("border", getStageColor(asset.status))}>
                  {stages.find((s) => s.code === asset.status)?.name ?? asset.status}
                </Badge>
                <div className="space-y-2">
                  <DetailRow label="Address" value={`${asset.address}, ${[asset.city, asset.state].filter(Boolean).join(", ")}`} />
                  <DetailRow label="Lead source" value={asset.leadSource} />
                  <DetailRow label={t.contact} value={`${asset.sellerName ?? "—"} ${asset.sellerPhone ?? ""}`.trim()} />
                  <DetailRow label="Asking price" value={asset.askingPrice != null ? `$${asset.askingPrice.toLocaleString()}` : null} />
                  <DetailRow label="ARV" value={asset.arv != null ? `$${asset.arv.toLocaleString()}` : null} />
                  <DetailRow label="Condition" value={asset.condition} />
                  <DetailRow label="Motivation" value={asset.motivation} />
                  <DetailRow label="Days in stage" value={daysInStage(asset.stageChangedAt)} />
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" onClick={() => onAction("sms", asset, { message: "" })}>
                    <MessageSquare className="size-4 mr-1" />SMS
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onAction("note", asset, { body: "" })}>
                    <StickyNote className="size-4 mr-1" />Note
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onAction("task", asset, { title: "", description: "" })}>
                    <ListTodo className="size-4 mr-1" />Task
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onStageChange(asset)}>
                    <ArrowRightLeft className="size-4 mr-1" />Stage
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="buyers" className="mt-4">
                <BuyersTab />
              </TabsContent>
              <TabsContent value="outreach" className="mt-4">
                <OutreachTab asset={asset} />
              </TabsContent>
              <TabsContent value="activity" className="mt-4">
                <ActivityTab />
              </TabsContent>
              <TabsContent value="ai" className="mt-4">
                <AiTab asset={asset} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
