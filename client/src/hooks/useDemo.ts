import { useAuth } from "@/_core/hooks/useAuth";
import { useCallback } from "react";
import { toast } from "sonner";

/**
 * Hook to detect demo mode and provide demo-aware utilities.
 * Returns isDemo flag and a guard function that shows a toast
 * when a restricted action is attempted.
 */
export function useDemo() {
  const { user } = useAuth();
  const isDemo = Boolean((user as any)?._isDemo);

  /** Call before any restricted action. Returns true if blocked (demo mode). */
  const guardAction = useCallback(
    (actionName?: string) => {
      if (!isDemo) return false;
      toast.info(
        actionName
          ? `${actionName} is disabled in demo mode`
          : "This action is disabled in demo mode",
        { description: "Start your free trial to unlock all features!" }
      );
      return true; // blocked
    },
    [isDemo]
  );

  return { isDemo, guardAction };
}
