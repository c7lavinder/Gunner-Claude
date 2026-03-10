import { useEffect, useState, useCallback } from "react";
import { Command } from "cmdk";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Phone,
  Package,
  BarChart3,
  Users,
  GraduationCap,
  BookOpen,
  Settings,
  UserCircle,
  Search,
} from "lucide-react";

const PAGES = [
  { label: "Today", path: "/today", icon: LayoutDashboard, keywords: "dashboard home" },
  { label: "Call Inbox", path: "/calls", icon: Phone, keywords: "calls recordings grades" },
  { label: "Inventory", path: "/inventory", icon: Package, keywords: "properties assets pipeline" },
  { label: "KPIs", path: "/kpis", icon: BarChart3, keywords: "metrics funnel numbers" },
  { label: "Team", path: "/team", icon: Users, keywords: "leaderboard badges members" },
  { label: "Training", path: "/training", icon: GraduationCap, keywords: "coaching roleplay materials" },
  { label: "Playbook", path: "/playbook", icon: BookOpen, keywords: "roles rubrics config" },
  { label: "Settings", path: "/settings", icon: Settings, keywords: "workspace crm billing" },
  { label: "Profile", path: "/profile", icon: UserCircle, keywords: "account preferences voice" },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((o) => !o);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="flex flex-col">
          <div className="flex items-center gap-2 px-4 border-b" style={{ borderColor: "var(--g-border-subtle)" }}>
            <Search className="size-4 shrink-0" style={{ color: "var(--g-text-tertiary)" }} />
            <Command.Input
              autoFocus
              placeholder="Search pages..."
              className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-[var(--g-text-tertiary)]"
              style={{ color: "var(--g-text-primary)" }}
            />
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--g-bg-surface)", color: "var(--g-text-tertiary)" }}>ESC</kbd>
          </div>
          <Command.List className="max-h-72 overflow-auto p-2">
            <Command.Empty className="py-8 text-center text-sm" style={{ color: "var(--g-text-tertiary)" }}>
              No results found.
            </Command.Empty>
            <Command.Group heading="Pages">
              {PAGES.map((page) => (
                <Command.Item
                  key={page.path}
                  value={`${page.label} ${page.keywords}`}
                  onSelect={() => { setLocation(page.path); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors data-[selected=true]:bg-[var(--g-accent-soft)]"
                  style={{ color: "var(--g-text-primary)" }}
                >
                  <page.icon className="size-4 shrink-0" style={{ color: "var(--g-text-tertiary)" }} />
                  {page.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
          <div className="flex items-center gap-4 px-4 py-2 border-t text-[10px]" style={{ borderColor: "var(--g-border-subtle)", color: "var(--g-text-tertiary)" }}>
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">esc</kbd> close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
