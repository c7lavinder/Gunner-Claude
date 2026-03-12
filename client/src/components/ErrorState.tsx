import { AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  icon: Icon = AlertTriangle,
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-red-500/10">
        <Icon className="size-6 text-red-500" />
      </div>
      <h3 className="text-base font-semibold mb-1 text-[var(--g-text-primary)]">
        {title}
      </h3>
      <p className="text-sm max-w-xs mb-4 text-[var(--g-text-tertiary)]">
        {description}
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
