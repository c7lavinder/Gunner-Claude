import { Link, useLocation } from "wouter";
import { AiCoach } from "../AiCoach";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays,
  Phone,
  Package,
  BarChart3,
  Users,
  GraduationCap,
  Settings as SettingsIcon,
  BookOpen,
  UserCircle,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
const ROUTE_LABELS: Record<string, string> = {
  "/today": "Today",
  "/calls": "Calls",
  "/inventory": "Inventory",
  "/kpis": "KPIs",
  "/team": "Team",
  "/training": "Training",
  "/playbook": "Playbook",
  "/settings": "Settings",
  "/profile": "Profile",
};

const NAV_ITEMS = [
  { path: "/today", label: "Today", icon: CalendarDays },
  { path: "/calls", label: "Calls", icon: Phone },
  { path: "/inventory", label: "Inventory", icon: Package },
  { path: "/kpis", label: "KPIs", icon: BarChart3 },
  { path: "/team", label: "Team", icon: Users },
  { path: "/training", label: "Training", icon: GraduationCap },
  { path: "/playbook", label: "Playbook", icon: BookOpen },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
  { path: "/profile", label: "Profile", icon: UserCircle },
] as const;

function CrmDegradedBanner() {
  const { data: health } = trpc.settings.getSyncHealth.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  if (!health || health.connected) return null;
  if (!health.oauthActive) return null; // No CRM configured at all, no banner needed

  return (
    <div
      className="w-full px-4 py-2 text-sm text-center"
      style={{ background: "var(--g-warning-bg, #fef3c7)", color: "var(--g-warning-text, #92400e)" }}
    >
      CRM sync paused — call grading and coaching still work.{" "}
      <a href="/settings?tab=crm" className="underline font-medium">Check CRM settings</a>
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  // Breadcrumb segments: split location path, generate labels
  const segments = location.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, idx) => {
    const path = "/" + segments.slice(0, idx + 1).join("/");
    const label = ROUTE_LABELS[path] ?? (seg.charAt(0).toUpperCase() + seg.slice(1));
    return { label, path, isLast: idx === segments.length - 1 };
  });

  return (
    <SidebarProvider>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--g-accent)] focus:text-white focus:rounded-md focus:m-2">
        Skip to main content
      </a>
      <div
        className="flex min-h-svh w-full"
        style={{
          background: "var(--g-bg-base)",
          color: "var(--g-text-primary)",
        }}
      >
        <Sidebar
          className="border-r"
          style={{ borderColor: "var(--g-border-subtle)" }}
        >
          <SidebarHeader className="p-4">
            <Link href="/" className="font-semibold text-lg" aria-label="Gunner home">
              Gunner
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton asChild isActive={location === path}>
                        <Link href={path}>
                          <Icon className="size-4" />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <CrmDegradedBanner />
          <header
            className="sticky top-0 z-10 flex h-14 items-center justify-end gap-2 px-6 border-b"
            style={{
              background: "var(--g-bg-surface)",
              borderColor: "var(--g-border-subtle)",
            }}
          >
            {user && (
              <span className="text-sm mr-auto" style={{ color: "var(--g-text-secondary)" }}>
                {user.name || user.email}
              </span>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded" style={{ background: "var(--g-bg-surface)", color: "var(--g-text-tertiary)", border: "1px solid var(--g-border-subtle)" }}>
              ⌘K
            </kbd>
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-lg"
            >
              <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} className="rounded-lg">
              <LogOut className="size-4" />
              <span className="sr-only">Log out</span>
            </Button>
          </header>
          {breadcrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 px-6 py-2 text-sm border-b"
              style={{ borderColor: "var(--g-border-subtle)", background: "var(--g-bg-surface)" }}
            >
              <Link href="/today" className="text-[var(--g-text-tertiary)] hover:text-[var(--g-text-secondary)]">Home</Link>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.path} className="flex items-center gap-1">
                  <ChevronRight className="size-3 text-[var(--g-text-tertiary)]" />
                  {crumb.isLast ? (
                    <span style={{ color: "var(--g-text-primary)" }}>{crumb.label}</span>
                  ) : (
                    <Link href={crumb.path} className="text-[var(--g-text-tertiary)] hover:text-[var(--g-text-secondary)]">{crumb.label}</Link>
                  )}
                </span>
              ))}
            </nav>
          )}
          <main
            id="main-content"
            key={location}
            className="flex-1 p-6 g-page-enter"
            style={{ background: "var(--g-bg-base)" }}
            role="main"
          >
            {children}
          </main>
          <AiCoach page={location} />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
