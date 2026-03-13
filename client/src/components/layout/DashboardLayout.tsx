import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc";
import {
  Flame,
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
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

const PRIMARY_NAV = [
  { path: "/today", label: "Today", icon: CalendarDays },
  { path: "/calls", label: "Calls", icon: Phone },
  { path: "/inventory", label: "Inventory", icon: Package },
  { path: "/kpis", label: "KPIs", icon: BarChart3 },
  { path: "/training", label: "Training", icon: GraduationCap },
  { path: "/team", label: "Team", icon: Users },
] as const;

const ALL_NAV = [
  ...PRIMARY_NAV,
  { path: "/playbook", label: "Playbook", icon: BookOpen },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
  { path: "/profile", label: "Profile", icon: UserCircle },
] as const;

function CrmDegradedBanner() {
  const { data: health } = trpc.settings.getSyncHealth.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  if (!health || health.connected) return null;
  if (!health.oauthActive) return null;

  return (
    <div className="w-full px-4 py-2 text-sm text-center bg-[var(--g-warning-bg,#fef3c7)] text-[var(--g-warning-text,#92400e)]">
      CRM sync paused — call grading and coaching still work.{" "}
      <a href="/settings?tab=crm" className="underline font-medium">Check CRM settings</a>
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: workspace } = trpc.settings.getWorkspace.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // Onboarding gate — redirect to /onboarding if not completed
  const skipGateRoutes = ["/onboarding", "/login", "/signup", "/settings"];
  const shouldGate = workspace?.tenant?.onboardingCompleted !== "true"
    && !skipGateRoutes.some((r) => location.startsWith(r));
  useEffect(() => {
    if (workspace && shouldGate) navigate("/onboarding");
  }, [workspace, shouldGate, navigate]);

  const initial = (user?.name ?? user?.email ?? "U").charAt(0).toUpperCase();

  return (
    <div className="min-h-svh w-full bg-[var(--g-bg-base)] text-[var(--g-text-primary)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:px-4 focus:py-2 focus:bg-[var(--g-accent)] focus:text-white focus:rounded-md focus:m-2">
        Skip to main content
      </a>

      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-50 h-14 border-b border-[var(--g-border-subtle)] bg-[var(--g-bg-surface)] grid grid-cols-[auto_1fr_auto] items-center px-4 md:px-6 gap-4">
        {/* Left: Mobile hamburger + logo */}
        <div className="flex items-center gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                <Menu className="size-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-[var(--g-bg-surface)] border-r border-[var(--g-border-subtle)] p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex items-center gap-2 px-5 h-14 border-b border-[var(--g-border-subtle)]">
                <Flame className="size-5 text-[var(--g-accent-text)]" />
                <span className="font-bold tracking-wider text-[var(--g-accent-text)]">GUNNER</span>
              </div>
              <nav className="flex flex-col gap-1 p-3">
                {ALL_NAV.map(({ path, label, icon: Icon }) => (
                  <Link
                    key={path}
                    href={path}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                      location === path
                        ? "text-[var(--g-accent-text)] bg-[var(--g-accent-soft)]"
                        : "text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)] hover:bg-[var(--g-bg-inset)]"
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Brand logo */}
          <Link href="/today" className="flex items-center shrink-0">
            <img src="/gunner-logo.png" alt="Gunner" className="h-8 w-auto" />
          </Link>
        </div>

        {/* Center nav — desktop only, truly centered */}
        <nav className="hidden md:flex items-center justify-center gap-1">
          {PRIMARY_NAV.map(({ path, label }) => (
            <Link
              key={path}
              href={path}
              className={cn(
                "text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
                location === path
                  ? "text-[var(--g-accent-text)] border-b-2 border-[var(--g-accent)] font-semibold"
                  : "text-[var(--g-text-secondary)] hover:text-[var(--g-text-primary)]"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
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

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 cursor-pointer">
                {user?.profilePicture ? (
                  <img
                    src={user.profilePicture}
                    alt={user.name ?? "User"}
                    className="size-8 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex items-center justify-center size-8 rounded-full bg-[var(--g-accent-soft)] text-[var(--g-accent-text)] text-sm font-semibold shrink-0">
                    {initial}
                  </span>
                )}
                <span className="hidden md:block text-sm font-medium text-[var(--g-text-primary)]">
                  {user?.name?.split(" ")[0] ?? "User"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium truncate">{user?.name ?? "User"}</p>
                {user?.email && <p className="text-xs text-[var(--g-text-tertiary)] truncate">{user.email}</p>}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <UserCircle className="size-4 mr-2" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <SettingsIcon className="size-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/playbook")}>
                <BookOpen className="size-4 mr-2" /> Playbook
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="size-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CrmDegradedBanner />

      <main
        id="main-content"
        key={location}
        className="max-w-[1440px] mx-auto px-6 py-6 g-page-enter"
        role="main"
      >
        {children}
      </main>
    </div>
  );
}
