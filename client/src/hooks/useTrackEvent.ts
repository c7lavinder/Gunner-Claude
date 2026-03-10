import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import posthog from "posthog-js";

export type TrackableEvent =
  | { type: "page_view"; page: string }
  | { type: "feature_used"; feature: string; page?: string }
  | { type: "search_performed"; query: string; page?: string }
  | { type: "call_reviewed"; callId: string | number }
  | { type: "coach_asked"; page: string };

export function useTrackEvent() {
  const trackMutation = trpc.ai.trackEvent.useMutation();

  const track = useCallback(
    (event: TrackableEvent) => {
      // Fire-and-forget — never block UI
      try {
        posthog.capture(event.type, event);
      } catch {
        // posthog not initialized
      }
      trackMutation.mutate({
        eventType: event.type,
        page: "page" in event ? event.page : undefined,
        metadata: event as Record<string, unknown>,
      });
    },
    [trackMutation]
  );

  return { track };
}
