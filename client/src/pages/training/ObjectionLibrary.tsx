import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { BookOpen, ChevronRight, ChevronDown } from "lucide-react";

const CANNED_RESPONSES: Record<string, string> = {
  "I need to think about it": "I completely understand — this is a big decision. Just so I can help you think it through, what specifically are you weighing? Is it the price, the timeline, or something else? Most sellers I work with felt the same way, but once we walked through the numbers together, the decision became much clearer.",
  "Your offer is too low": "I appreciate you being upfront about that. Our offer is based on the current condition of the property and the repairs needed. Let me walk you through exactly how we arrived at that number — once you see the breakdown, it usually makes a lot more sense. What price did you have in mind?",
  "I'm not in a rush to sell": "That's totally fine — there's no pressure here. A lot of the homeowners I work with weren't in a rush either. They just wanted to know their options. Would it be helpful if I showed you what your property could sell for today, just so you have a number in your back pocket?",
  "I want to list with an agent": "That's a great option for a lot of people. The main difference is time and certainty — with an agent, you might get a higher price but it could take months, plus you'll have showings, repairs, and commissions. With us, you get a guaranteed close in as little as two weeks. Would it help to compare both scenarios side by side?",
  "I already have another offer": "That's great — competition is healthy. Out of curiosity, is that offer contingent on financing or inspection? Ours is a cash offer with no contingencies and a flexible closing date. Sometimes sellers find that the certainty of our offer is worth more than a slightly higher number with strings attached.",
};

export function ObjectionLibrary({ roleplayPersonas }: { roleplayPersonas: Array<{ id: string; name: string }> }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const allObjections = roleplayPersonas.flatMap((p) => (p as { objections?: string[] }).objections ?? []);
  const uniqueObjections = Array.from(new Set(allObjections));

  return (
    <Card className="bg-[var(--g-bg-card)] border-[var(--g-border-subtle)]">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 text-[var(--g-text-primary)] flex items-center gap-2">
          <BookOpen className="size-5 text-[var(--g-accent-text)]" />
          Objection Library
        </h2>
        {uniqueObjections.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No objections loaded"
            description="Objections will appear here from your Industry Playbook's roleplay personas."
          />
        ) : (
          <div className="space-y-2">
            {uniqueObjections.map((objection) => {
              const isOpen = expanded === objection;
              const response = CANNED_RESPONSES[objection] ?? "Acknowledge their concern, ask a clarifying question to understand the real objection, then reframe the value of your offer in terms of what matters most to them — speed, certainty, or convenience.";
              return (
                <div key={objection} className="rounded-lg border border-[var(--g-border-subtle)] overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--g-bg-surface)] transition-colors"
                    onClick={() => setExpanded(isOpen ? null : objection)}
                  >
                    <span className="text-sm font-medium text-[var(--g-text-primary)]">{objection}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1 text-[var(--g-text-secondary)]"
                    >
                      {isOpen ? "Hide" : "View Response"}
                      {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      <div className="bg-[var(--g-bg-inset)] rounded-lg p-3 text-sm text-[var(--g-text-secondary)] leading-relaxed">
                        {response}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Badge variant="outline" className="mt-3 text-[10px] text-[var(--g-text-tertiary)]">
          Powered by Industry Playbook
        </Badge>
      </CardContent>
    </Card>
  );
}
