import { Link, useLocation } from "wouter";
import { AiCoach } from "../AiCoach";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
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

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <SidebarProvider>
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
            <Link href="/" className="font-semibold text-lg">
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
          <main
            className="flex-1 p-6"
            style={{ background: "var(--g-bg-base)" }}
          >
            {children}
          </main>
          <AiCoach page={location} />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
