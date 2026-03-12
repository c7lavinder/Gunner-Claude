import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";

interface CallTranscriptPanelProps {
  transcript: string | null;
  strengths: string[];
  improvements: string[];
  summary: string | null;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
}

export function CallTranscriptPanel({
  transcript, strengths, improvements, summary, isOpen, onToggle,
}: CallTranscriptPanelProps) {
  return (
    <div className="space-y-3">
      {/* Coaching insights */}
      {(strengths.length > 0 || improvements.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {strengths.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--g-grade-a)]">Strengths</p>
              <div className="flex flex-wrap gap-1.5">
                {strengths.map((s, i) => (
                  <Badge key={i} variant="outline" className="text-[11px] border-emerald-600/30 text-emerald-400 bg-emerald-950/20">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {improvements.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--g-grade-d)]">Areas to Improve</p>
              <div className="flex flex-wrap gap-1.5">
                {improvements.map((imp, i) => (
                  <Badge key={i} variant="outline" className="text-[11px] border-orange-600/30 text-orange-400 bg-orange-950/20">
                    {imp}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary card */}
      {summary && (
        <Card className="bg-[var(--g-bg-inset)] border-[var(--g-border-subtle)]">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-[var(--g-text-tertiary)] mb-1">Summary</p>
            <p className="text-sm text-[var(--g-text-secondary)] leading-relaxed">{summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Transcript collapsible */}
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm text-[var(--g-accent-text)]">
          {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          Transcript
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 max-h-48 overflow-y-auto font-mono text-xs leading-relaxed bg-[var(--g-bg-inset)] rounded-md p-3 text-[var(--g-text-secondary)]">
            {transcript
              ? transcript.split("\n").map((line, i) => (
                  <p key={i}>{line || "\u00A0"}</p>
                ))
              : <p>No transcript available</p>
            }
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
