"use client";

import type { ActionResult } from "@shared/types";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ActionResultCardProps {
  result: ActionResult;
  onRetry?: () => void;
}

export function ActionResultCard({ result, onRetry }: ActionResultCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        result.success
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-destructive/40 bg-destructive/5"
      )}
    >
      {result.success ? (
        <CheckIcon className="size-5 shrink-0 text-emerald-600" />
      ) : (
        <XIcon className="size-5 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", result.success ? "text-emerald-700" : "text-destructive")}>
          {result.message}
        </p>
        {result.error && <p className="text-xs text-muted-foreground mt-0.5">{result.error}</p>}
        {result.success && <p className="text-xs text-muted-foreground mt-0.5">{result.timestamp}</p>}
      </div>
      {!result.success && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
