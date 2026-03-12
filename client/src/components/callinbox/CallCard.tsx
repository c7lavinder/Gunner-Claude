import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PhoneOutgoing, PhoneIncoming, User, Clock, Phone, MapPin, Star } from "lucide-react";
import { useLocation } from "wouter";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { formatDistanceToNow } from "date-fns";

function formatDuration(sec: number | null) {
  if (sec == null) return "\u2014";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function scoreLetter(score: number | null): string {
  if (score === null) return "\u2014";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function gradeCircleColor(score: number | null): string {
  if (score === null) return "bg-gray-400";
  if (score >= 90) return "bg-green-500";
  if (score >= 80) return "bg-blue-500";
  if (score >= 70) return "bg-amber-400";
  if (score >= 60) return "bg-orange-400";
  return "bg-red-500";
}

const CLASSIFICATION_COLOR: Record<string, string> = {
  green: "border-green-500 text-green-600",
  red: "border-red-500 text-red-600",
  amber: "border-amber-500 text-amber-600",
  gray: "border-gray-400 text-gray-500",
};

export interface CallItem {
  id: number;
  contactName: string | null;
  callType: string | null;
  teamMemberName: string | null;
  callTimestamp: Date | string | null;
  duration: number | null;
  callDirection?: string | null;
  overallScore: number | null;
  ghlContactId: string | null;
  isStarred?: string | boolean | null;
  propertyAddress?: string | null;
  classification?: string | null;
  summary?: string | null;
}

interface CallCardProps {
  call: CallItem;
  isStarred: boolean;
  onToggleStar: (e: React.MouseEvent) => void;
}

export function CallCard({ call, isStarred, onToggleStar }: CallCardProps) {
  const [, navigate] = useLocation();
  const { callTypes, classificationLabels } = useTenantConfig();

  const score = call.overallScore ?? null;
  const letter = scoreLetter(score);
  const direction = (call.callDirection ?? "").toLowerCase();
  const isInbound = direction === "inbound";

  const callTypeName = callTypes.find((ct) => ct.code === call.callType)?.name ?? call.callType ?? "\u2014";

  const classLabel = call.classification ? classificationLabels[call.classification] : undefined;
  const classColor = classLabel ? (CLASSIFICATION_COLOR[classLabel.color] ?? CLASSIFICATION_COLOR.gray) : null;

  const relativeTime = call.callTimestamp
    ? formatDistanceToNow(new Date(call.callTimestamp), { addSuffix: true })
    : "\u2014";

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md bg-[var(--g-bg-card)] border-[var(--g-border-subtle)] relative"
      onClick={() => navigate(`/calls/${call.id}`)}
    >
      <CardContent className="p-4 py-3">
        <div className="flex items-start gap-4">
          {/* Left content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Row 1: Name + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-[var(--g-text-primary)] truncate">
                {call.contactName ?? "Unknown"}
              </span>
              {/* Direction badge */}
              {isInbound ? (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-blue-500 text-white">
                  <PhoneIncoming className="size-3" />
                  Inbound
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-green-500 text-white">
                  <PhoneOutgoing className="size-3" />
                  Outbound
                </span>
              )}
              {/* Call type badge */}
              <span className="inline-flex items-center rounded-full border border-teal-500 text-teal-600 px-2.5 py-0.5 text-[11px] font-medium">
                {callTypeName}
              </span>
              {/* Classification badge */}
              {classLabel && classColor && (
                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium", classColor)}>
                  {classLabel.label}
                </span>
              )}
            </div>

            {/* Row 2: Rep + duration + time */}
            <div className="flex items-center gap-3 text-xs text-[var(--g-text-tertiary)]">
              <span className="inline-flex items-center gap-1">
                <User className="size-3" />
                {call.teamMemberName ?? "\u2014"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {formatDuration(call.duration)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3" />
                {relativeTime}
              </span>
            </div>

            {/* Row 3: Property address */}
            {call.propertyAddress && (
              <div>
                <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-3 py-0.5 text-xs">
                  <MapPin className="size-3" />
                  {call.propertyAddress}
                </span>
              </div>
            )}

            {/* Row 4: Summary */}
            {call.summary && (
              <p className="text-sm text-muted-foreground italic truncate overflow-hidden">
                {call.summary}
              </p>
            )}
          </div>

          {/* Right side: grade circle + star */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div
              className={cn(
                "size-12 rounded-full flex flex-col items-center justify-center text-white shrink-0",
                gradeCircleColor(score),
              )}
            >
              <span className="text-base font-bold leading-none">{letter}</span>
              {score !== null && (
                <span className="text-[10px] leading-none mt-0.5">{Math.round(score)}%</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar(e);
              }}
              aria-label={isStarred ? "Unstar call" : "Star call"}
            >
              <Star className={cn("size-4", isStarred && "fill-amber-400 text-amber-500")} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
