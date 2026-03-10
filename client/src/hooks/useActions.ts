"use client";

import { useState, useCallback } from "react";
import type { ActionType, ActionResult } from "@shared/types";
import { trpc } from "@/lib/trpc";

export type OptimisticStatus = "idle" | "executing" | "success" | "failed";

export function useAction() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<OptimisticStatus>("idle");

  const executeMutation = trpc.actions.execute.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setOptimisticStatus(data.success ? "success" : "failed");
    },
    onError: () => {
      setOptimisticStatus("failed");
    },
    onSettled: () => setIsExecuting(false),
  });

  const executeAction = useCallback(
    (type: ActionType, contactId: string, payload: Record<string, unknown>) => {
      setIsExecuting(true);
      setOptimisticStatus("executing");
      setResult(null);
      executeMutation.mutate({ type, contactId, payload });
    },
    [executeMutation]
  );

  const previewAction = trpc.actions.preview.useQuery;

  const reset = useCallback(() => {
    setResult(null);
    setIsExecuting(false);
    setOptimisticStatus("idle");
  }, []);

  return {
    executeAction,
    previewAction,
    isExecuting,
    optimisticStatus,
    result,
    reset,
  };
}
