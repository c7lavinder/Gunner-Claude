import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle, DollarSign, HandshakeIcon, Heart,
  Lightbulb, MessageCircle, Target, TrendingUp, Users, Clock,
  Sparkles, Zap, XCircle, Flag
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CallHighlight {
  type: string;
  label: string;
  timestampSeconds: number;
  quote: string;
  insight: string;
  importance: number;
}

interface CallHighlightsProps {
  callId: number;
  highlights: CallHighlight[] | null;
  onSeek?: (seconds: number) => void;
  hasRecording?: boolean;
}

const HIGHLIGHT_CONFIG: Record<string, {
  icon: typeof AlertTriangle;
  color: string;
  bg: string;
  border: string;
  label: string;
}> = {
  objection_handled: {
    icon: CheckCircle,
    color: "rgb(34,197,94)",
    bg: "rgba(22,163,74,0.08)",
    border: "rgba(22,163,74,0.2)",
    label: "Objection Handled",
  },
  objection_missed: {
    icon: XCircle,
    color: "rgb(239,68,68)",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    label: "Objection Missed",
  },
  appointment_set: {
    icon: CheckCircle,
    color: "rgb(16,185,129)",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    label: "Appointment Set",
  },
  appointment_attempted: {
    icon: Target,
    color: "rgb(245,158,11)",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    label: "Appointment Attempted",
  },
  price_discussion: {
    icon: DollarSign,
    color: "rgb(59,130,246)",
    bg: "rgba(37,99,235,0.08)",
    border: "rgba(37,99,235,0.2)",
    label: "Price Discussion",
  },
  rapport_building: {
    icon: Heart,
    color: "rgb(236,72,153)",
    bg: "rgba(236,72,153,0.08)",
    border: "rgba(236,72,153,0.2)",
    label: "Rapport Building",
  },
  red_flag: {
    icon: AlertTriangle,
    color: "rgb(239,68,68)",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    label: "Red Flag",
  },
  closing_attempt: {
    icon: HandshakeIcon,
    color: "rgb(139,92,246)",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.2)",
    label: "Closing Attempt",
  },
  key_info_gathered: {
    icon: Lightbulb,
    color: "rgb(251,191,36)",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    label: "Key Info",
  },
  motivation_revealed: {
    icon: TrendingUp,
    color: "rgb(16,185,129)",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    label: "Motivation Revealed",
  },
  decision_maker: {
    icon: Users,
    color: "rgb(139,92,246)",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.2)",
    label: "Decision Maker",
  },
  follow_up_scheduled: {
    icon: Clock,
    color: "rgb(59,130,246)",
    bg: "rgba(37,99,235,0.08)",
    border: "rgba(37,99,235,0.2)",
    label: "Follow-Up Scheduled",
  },
  competitor_mention: {
    icon: Flag,
    color: "rgb(245,158,11)",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    label: "Competitor Mention",
  },
  strong_moment: {
    icon: Zap,
    color: "rgb(16,185,129)",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    label: "Strong Moment",
  },
  missed_opportunity: {
    icon: XCircle,
    color: "rgb(245,158,11)",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    label: "Missed Opportunity",
  },
};

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ImportanceDots({ importance }: { importance: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map((level) => (
        <div
          key={level}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: level <= importance ? "var(--g-accent)" : "var(--g-bg-inset)",
          }}
        />
      ))}
    </div>
  );
}

export default function CallHighlights({ callId, highlights: existingHighlights, onSeek, hasRecording }: CallHighlightsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const generateMutation = trpc.calls.generateHighlights.useMutation({
    onSuccess: (data) => {
      if (data.cached) {
        toast.info("Highlights already generated");
      } else {
        toast.success(`Generated ${data.highlights.length} highlights`);
      }
    },
    onError: (error) => {
      toast.error(`Failed to generate highlights: ${error.message}`);
    },
  });

  const utils = trpc.useUtils();

  const handleGenerate = () => {
    generateMutation.mutate({ callId }, {
      onSuccess: () => {
        utils.calls.getGrade.invalidate({ callId });
      },
    });
  };

  const highlights = (generateMutation.data?.highlights as CallHighlight[] | undefined) || existingHighlights;

  if (!highlights || highlights.length === 0) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{
          background: "var(--g-bg-card)",
          border: "1px solid var(--g-border-subtle)",
          boxShadow: "var(--g-shadow-card)",
        }}
      >
        <h3
          className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 mb-3"
          style={{ color: "var(--g-text-tertiary)" }}
        >
          <Sparkles className="h-4 w-4" /> Key Moments
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--g-text-tertiary)" }}>
          AI-identified highlights from this call — objections, appointments, price discussions, and more.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          className="gap-2"
        >
          {generateMutation.isPending ? (
            <>
              <Sparkles className="h-4 w-4 animate-spin" />
              Analyzing call...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Highlights
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "var(--g-bg-card)",
        border: "1px solid var(--g-border-subtle)",
        boxShadow: "var(--g-shadow-card)",
      }}
    >
      <h3
        className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 mb-1"
        style={{ color: "var(--g-text-tertiary)" }}
      >
        <Sparkles className="h-4 w-4" /> Key Moments
      </h3>
      <p className="text-xs mb-4" style={{ color: "var(--g-text-tertiary)" }}>
        {highlights.length} highlight{highlights.length !== 1 ? "s" : ""} identified
        {hasRecording ? " — click to jump to that moment" : ""}
      </p>

      <div className="space-y-2">
        {highlights.map((highlight, index) => {
          const config = HIGHLIGHT_CONFIG[highlight.type] || HIGHLIGHT_CONFIG.key_info_gathered;
          const Icon = config.icon;
          const isExpanded = expandedIndex === index;

          return (
            <div
              key={index}
              className="rounded-xl overflow-hidden transition-all duration-200"
              style={{
                border: `1px solid ${config.border}`,
                background: isExpanded ? config.bg : "transparent",
              }}
            >
              {/* Chip header — clickable */}
              <button
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-all duration-200 hover:opacity-90"
                style={{ background: config.bg }}
                onClick={() => {
                  if (hasRecording && onSeek) {
                    onSeek(highlight.timestampSeconds);
                    toast.info(`Jumped to ${formatTimestamp(highlight.timestampSeconds)}`);
                  }
                  setExpandedIndex(isExpanded ? null : index);
                }}
              >
                <Icon className="h-4 w-4 shrink-0" style={{ color: config.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: "var(--g-text-primary)" }}>
                      {highlight.label}
                    </span>
                    <ImportanceDots importance={highlight.importance} />
                  </div>
                </div>
                <span
                  className="text-xs font-mono shrink-0 px-2 py-0.5 rounded-md"
                  style={{
                    background: hasRecording ? config.color : "var(--g-bg-inset)",
                    color: hasRecording ? "#fff" : "var(--g-text-tertiary)",
                    cursor: hasRecording ? "pointer" : "default",
                  }}
                >
                  {formatTimestamp(highlight.timestampSeconds)}
                </span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-3.5 pb-3 space-y-2">
                  {highlight.quote && (
                    <p
                      className="text-xs italic pl-3"
                      style={{
                        color: "var(--g-text-secondary)",
                        borderLeft: `2px solid ${config.color}`,
                      }}
                    >
                      "{highlight.quote}"
                    </p>
                  )}
                  {highlight.insight && (
                    <p className="text-xs" style={{ color: "var(--g-text-tertiary)" }}>
                      {highlight.insight}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
