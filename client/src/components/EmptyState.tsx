import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ background: "var(--g-accent-soft)" }}
      >
        <Icon className="size-6" style={{ color: "var(--g-accent-text)" }} />
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: "var(--g-text-primary)" }}>
        {title}
      </h3>
      <p className="text-sm max-w-xs mb-4" style={{ color: "var(--g-text-tertiary)" }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
