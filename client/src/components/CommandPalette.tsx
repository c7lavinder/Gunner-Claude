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
  FileText,
  User,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

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

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const debouncedQuery = useDebounce(query, 300);

  const searchQuery = trpc.search.global.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

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

  const navigate = (path: string) => { setLocation(path); setOpen(false); setQuery(""); };

  if (!open) return null;

  const results = searchQuery.data;
  const hasResults =
    results &&
    (results.calls.length > 0 || results.contacts.length > 0 || results.notes.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--g-bg-card)", borderColor: "var(--g-border-subtle)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="flex flex-col" shouldFilter={!hasResults && debouncedQuery.length < 2}>
          <div className="flex items-center gap-2 px-4 border-b" style={{ borderColor: "var(--g-border-subtle)" }}>
            <Search className="size-4 shrink-0" style={{ color: "var(--g-text-tertiary)" }} />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, calls, contacts..."
              className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-[var(--g-text-tertiary)]"
              style={{ color: "var(--g-text-primary)" }}
            />
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--g-bg-surface)", color: "var(--g-text-tertiary)" }}>ESC</kbd>
          </div>
          <Command.List className="max-h-80 overflow-auto p-2">
            <Command.Empty className="py-8 text-center text-sm" style={{ color: "var(--g-text-tertiary)" }}>
              {searchQuery.isFetching ? "Searching…" : "No results found."}
            </Command.Empty>

            {/* Real search results */}
            {results && results.calls.length > 0 && (
              <Command.Group heading="Calls">
                {results.calls.map((r) => (
                  <Command.Item
                    key={`call-${r.id}`}
                    value={`call-${r.id}-${r.label}`}
                    onSelect={() => navigate(r.path)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors data-[selected=true]:bg-[var(--g-accent-soft)]"
                    style={{ color: "var(--g-text-primary)" }}
                  >
                    <Phone className="size-4 shrink-0" style={{ color: "var(--g-text-tertiary)" }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{r.label}</p>
                      {r.sub && <p className="text-xs truncate" style={{ color: "var(--g-text-tertiary)" }}>{r.sub}</p>}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {results && results.contacts.length > 0 && (
              <Command.Group heading="Contacts">
                {results.contacts.map((r) => (
                  <Command.Item
                    key={`contact-${r.id}`}
                    value={`contact-${r.id}-${r.label}`}
                    onSelect={() => navigate(r.path)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors data-[selected=true]:bg-[var(--g-accent-soft)]"
                    style={{ color: "var(--g-text-primary)" }}
                  >
                    <User className="size-4 shrink-0" style={{ color: "var(--g-text-tertiary)" }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{r.label}</p>
                      {r.sub && <p className="text-xs truncate" style={{ color: "var(--g-text-tertiary)" }}>{r.sub}</p>}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {results && results.notes.length > 0 && (
              <Command.Group heading="Notes">
                {results.notes.map((r) => (
                  <Command.Item
                    key={`note-${r.id}`}
                    value={`note-${r.id}-${r.label}`}
                    onSelect={() => navigate(r.path)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors data-[selected=true]:bg-[var(--g-accent-soft)]"
                    style={{ color: "var(--g-text-primary)" }}
                  >
                    <FileText className="size-4 shrink-0" style={{ color: "var(--g-text-tertiary)" }} />
                    <p className="truncate">{r.label}</p>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Page navigation — always shown when query is short */}
            {debouncedQuery.length < 2 && (
              <Command.Group heading="Pages">
                {PAGES.map((page) => (
                  <Command.Item
                    key={page.path}
                    value={`${page.label} ${page.keywords}`}
                    onSelect={() => navigate(page.path)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors data-[selected=true]:bg-[var(--g-accent-soft)]"
                    style={{ color: "var(--g-text-primary)" }}
                  >
                    <page.icon className="size-4 shrink-0" style={{ color: "var(--g-text-tertiary)" }} />
                    {page.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
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
