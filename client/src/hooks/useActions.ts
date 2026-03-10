"use client";

import { useState, useCallback } from "react";
import type { ActionType, ActionResult } from "@shared/types";
import { trpc } from "@/lib/trpc";

export function useAction() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const executeMutation = trpc.actions.execute.useMutation({
    onSuccess: (data) => setResult(data),
    onSettled: () => setIsExecuting(false),
  });

  const executeAction = useCallback(
    (type: ActionType, contactId: string, payload: Record<string, unknown>) => {
      setIsExecuting(true);
      setResult(null);
      executeMutation.mutate({ type, contactId, payload });
    },
    [executeMutation]
  );

  const previewAction = trpc.actions.preview.useQuery;

  const reset = useCallback(() => {
    setResult(null);
    setIsExecuting(false);
  }, []);

  return {
    executeAction,
    previewAction,
    isExecuting,
    result,
    reset,
  };
}
