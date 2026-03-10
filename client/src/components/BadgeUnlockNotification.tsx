import { useEffect, useCallback, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { toast } from "sonner";

interface BadgeNotification {
  code: string;
  name: string;
  icon?: string;
  description?: string;
}

let pendingBadges: BadgeNotification[] = [];

export function notifyBadgeUnlock(badge: BadgeNotification): void {
  pendingBadges.push(badge);
}

export function notifyBadgesUnlocked(badges: BadgeNotification[]): void {
  pendingBadges.push(...badges);
}

function fireConfetti() {
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
  confetti({ ...defaults, particleCount: 50, origin: { x: 0.5, y: 0.3 } });
  setTimeout(() => {
    confetti({ ...defaults, particleCount: 30, origin: { x: 0.3, y: 0.4 } });
    confetti({ ...defaults, particleCount: 30, origin: { x: 0.7, y: 0.4 } });
  }, 150);
}

export function BadgeUnlockNotification() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const processQueue = useCallback(() => {
    if (pendingBadges.length === 0) return;
    const badges = [...pendingBadges];
    pendingBadges = [];

    fireConfetti();

    for (const badge of badges) {
      toast(
        <div className="flex items-center gap-3">
          <span className="text-2xl">{badge.icon || "🏅"}</span>
          <div>
            <p className="font-semibold text-sm">Badge Unlocked!</p>
            <p className="text-xs text-muted-foreground">{badge.name}</p>
            {badge.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{badge.description}</p>
            )}
          </div>
        </div>,
        { duration: 5000 }
      );
    }
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(processQueue, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [processQueue]);

  return null;
}
