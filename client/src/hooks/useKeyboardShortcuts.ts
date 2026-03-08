import { useEffect, useCallback } from "react";
import { useLocation } from "wouter";

/**
 * Global keyboard shortcuts for power users.
 * 
 * Navigation (Cmd/Ctrl + number):
 *   1 = Day Hub / Tasks
 *   2 = Calls
 *   3 = Inventory
 *   4 = KPIs
 *   5 = Training
 *   6 = Team
 * 
 * Actions:
 *   Cmd/Ctrl + K = Focus search (if available on page)
 *   Escape = Close modals/panels
 */
export function useKeyboardShortcuts() {
  const [, setLocation] = useLocation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // Navigation shortcuts: Cmd/Ctrl + number
      if (isMod && !e.shiftKey && !e.altKey) {
        switch (e.key) {
          case "1":
            e.preventDefault();
            setLocation("/tasks");
            return;
          case "2":
            e.preventDefault();
            setLocation("/calls");
            return;
          case "3":
            e.preventDefault();
            setLocation("/inventory");
            return;
          case "4":
            e.preventDefault();
            setLocation("/kpis");
            return;
          case "5":
            e.preventDefault();
            setLocation("/training");
            return;
          case "6":
            e.preventDefault();
            setLocation("/team");
            return;
          case "k":
          case "K":
            e.preventDefault();
            // Focus the first search input on the page
            const searchInput = document.querySelector<HTMLInputElement>(
              'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]'
            );
            if (searchInput) {
              searchInput.focus();
              searchInput.select();
            }
            return;
        }
      }
    },
    [setLocation]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
