import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, LogOut, Users, Phone, BarChart3, BookOpen,
  Building2, Shield, AlertTriangle, Settings, Sun, Moon, Menu, X,
  Zap, ClipboardList, Warehouse, Trophy, Target,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, Redirect, useSearch } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { useImpersonation } from "./ImpersonationBanner";
import { useTheme } from "@/contexts/ThemeContext";

// ─── NAV ITEMS ────────────────────────────────────────
const getMenuItems = (
  teamRole: string | null | undefined,
  openId?: string,
  userRole?: string,
  isTenantAdmin?: string | null,
  isDemo?: boolean
) => {
  const isAdmin = teamRole === 'admin' || isTenantAdmin === 'true' || userRole === 'admin';
  const isSuperAdmin = userRole === 'super_admin';
  const isLeadGenerator = teamRole === 'lead_generator';

  if (isLeadGenerator) {
    return [
      { icon: LayoutDashboard, label: "Day Hub", path: "/tasks" },
      { icon: Phone, label: "Calls", path: "/calls" },
      { icon: BookOpen, label: "Training", path: "/training" },
    ];
  }

  const items: { icon: any; label: string; path: string }[] = [
    { icon: LayoutDashboard, label: "Day Hub", path: "/tasks" },
    { icon: Phone, label: "Calls", path: "/calls" },
  ];

  const isDispoManager = teamRole === 'dispo_manager';

  if (isDispoManager) {
    // Dispo managers: Day Hub, Calls, Inventory, Leaderboard — no Training, no Team
    items.push({ icon: Warehouse, label: "Inventory", path: "/inventory" });
    items.push({ icon: Trophy, label: "Leaderboard", path: "/leaderboard" });
    return items;
  }

  if (isAdmin || isSuperAdmin) {
    items.push({ icon: Warehouse, label: "Inventory", path: "/inventory" });
    items.push({ icon: Target, label: "KPIs", path: "/kpis" });
  }

  items.push({ icon: BookOpen, label: "Training", path: "/training" });
  items.push({ icon: Users, label: "Team", path: "/team" });

  return items;
};

// ─── MAIN LAYOUT ──────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [location] = useLocation();
  const searchString = useSearch();
  const { isImpersonating } = useImpersonation();

  const searchParams = new URLSearchParams(searchString);
  const checkoutFromUrl = searchParams.get('checkout') === 'success';

  const [justCompletedCheckout, setJustCompletedCheckout] = useState(() => {
    if (checkoutFromUrl) return true;
    return sessionStorage.getItem('checkout_success') === 'true';
  });

  useEffect(() => {
    if (checkoutFromUrl) {
      sessionStorage.setItem('checkout_success', 'true');
      setJustCompletedCheckout(true);
      setTimeout(() => {
        sessionStorage.removeItem('checkout_success');
      }, 60000);
    }
  }, [checkoutFromUrl]);

  const { data: tenantSettings, isLoading: tenantLoading } = trpc.tenant.getSettings.useQuery(
    undefined,
    { enabled: !!user }
  );

  if (loading || (user && tenantLoading)) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: "var(--g-bg-base)" }}
      >
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          {/* Decorative orb */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-2"
            style={{
              background: "linear-gradient(135deg, var(--g-accent), var(--g-accent-hover))",
              boxShadow: "0 0 60px var(--g-accent-glow)",
            }}
          >
            <Zap className="h-10 w-10 text-white" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <h1
              className="text-2xl font-extrabold tracking-tight text-center"
              style={{ color: "var(--g-text-primary)" }}
            >
              Sign in to continue
            </h1>
            <p
              className="text-sm text-center max-w-sm leading-relaxed"
              style={{ color: "var(--g-text-secondary)" }}
            >
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all duration-300"
            style={{
              background: "linear-gradient(135deg, var(--g-accent), var(--g-accent-hover))",
              border: "none",
              color: "white",
              fontWeight: 700,
            }}
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  const isEmailPasswordUser = user?.loginMethod === 'email_password';
  const isEmailVerified = user?.emailVerified === 'true';
  if (isEmailPasswordUser && !isEmailVerified) {
    return <Redirect to="/verification-pending" />;
  }

  const isOnboardingRoute = location === '/onboarding';
  const isPaywallRoute = location === '/paywall';
  const isPricingRoute = location === '/pricing';
  const onboardingCompleted = tenantSettings?.onboardingCompleted === 'true';
  const hasActiveSubscription = tenantSettings?.stripeSubscriptionId &&
    (tenantSettings?.subscriptionStatus === 'active' || tenantSettings?.subscriptionStatus === 'past_due');
  const isSuperAdmin = user?.role === 'super_admin';

  if (isOnboardingRoute || isPaywallRoute || isPricingRoute) {
    return <div className="min-h-screen" style={{ background: "var(--g-bg-base)" }}>{children}</div>;
  }

  const isDemo = Boolean((user as any)?._isDemo);

  if (!onboardingCompleted && tenantSettings && !isSuperAdmin && !isDemo) {
    return <Redirect to="/onboarding" />;
  }

  if (onboardingCompleted && !hasActiveSubscription && tenantSettings && !isSuperAdmin && !justCompletedCheckout && !isDemo) {
    return <Redirect to="/paywall" />;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--g-bg-base)" }}>
      {isDemo && (
        <div
          className="fixed top-0 left-0 right-0 z-[110] text-center py-2.5 px-4 text-sm font-semibold shadow-lg"
          style={{
            background: "linear-gradient(90deg, var(--g-accent), var(--g-accent-hover))",
            color: "white",
          }}
        >
          <span>You're viewing a demo of Gunner AI</span>
          <span className="mx-2 opacity-50">—</span>
          <a
            href="https://getgunner.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-80 transition-opacity"
          >
            Start your free trial →
          </a>
        </div>
      )}
      <div className={isDemo ? "pt-10" : ""}>
        <TopNavBar user={user} isDemo={isDemo} />
        <main
          className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6"
          style={{ paddingTop: isImpersonating ? "calc(var(--g-topnav-height, 64px) + 44px + 24px)" : "calc(var(--g-topnav-height, 64px) + 24px)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── TOP NAV BAR ──────────────────────────────────────
function TopNavBar({ user, isDemo }: { user: any; isDemo: boolean }) {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme, switchable } = useTheme();
  const { logout } = useAuth();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isImpersonating: isTenantImpersonating, impersonationType: impType } = useImpersonation();
  const bannerOffset = isTenantImpersonating ? 44 : 0; // height of impersonation banner

  const effectiveRole = (isTenantImpersonating && impType === 'super_admin') ? 'admin' : user?.role;
  const effectiveTeamRole = (isTenantImpersonating && impType === 'super_admin') ? 'admin' : user?.teamRole;
  const effectiveIsTenantAdmin = (isTenantImpersonating && impType === 'super_admin') ? 'true' : user?.isTenantAdmin;
  const menuItems = getMenuItems(effectiveTeamRole, user?.openId, effectiveRole, effectiveIsTenantAdmin, isDemo);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <>
      <nav
        className="fixed left-0 right-0 z-[100]"
        style={{
          top: bannerOffset,
          height: "var(--g-topnav-height, 64px)",
          background: "var(--g-glass-bg)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid var(--g-glass-border)",
        }}
      >
        <div
          className="h-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between"
        >
          {/* Brand */}
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setLocation('/tasks')}
          >
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663328210645/nusXfQu5XBTMz3NUCR6brb/gunner-logo-small-transparent_1ea33474.png"
              alt="Gunner"
              className="h-12 transition-transform duration-300 group-hover:scale-105"
              style={{ objectFit: 'contain' }}
            />
          </div>

          {/* Desktop Tabs */}
          {!isMobile && (
            <div className="flex items-center gap-1">
              {menuItems.map((item) => {
                const isActive = location === item.path ||
                  (item.path !== '/tasks' && location.startsWith(item.path));
                return (
                  <button
                    key={item.path}
                    onClick={() => setLocation(item.path)}
                    className="relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                    style={{
                      color: isActive ? "var(--g-accent)" : "var(--g-text-secondary)",
                      background: isActive ? "var(--g-accent-surface)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = "var(--g-text-primary)";
                        e.currentTarget.style.background = "var(--g-bg-inset)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = "var(--g-text-secondary)";
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    {item.label}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                        style={{ background: "var(--g-accent)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            {switchable && toggleTheme && (
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
                style={{
                  color: "var(--g-text-secondary)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--g-bg-inset)";
                  e.currentTarget.style.color = "var(--g-text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--g-text-secondary)";
                }}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}

            {/* User avatar dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all duration-200"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--g-bg-inset)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  aria-label="User menu"
                >
                  <Avatar className="h-8 w-8 ring-2 ring-transparent hover:ring-[var(--g-accent)] transition-all duration-300">
                    {user?.profilePicture && (
                      <AvatarImage src={user.profilePicture} alt={user?.name || 'Profile'} />
                    )}
                    <AvatarFallback
                      className="text-xs font-bold"
                      style={{
                        background: "var(--g-accent-surface)",
                        color: "var(--g-accent)",
                      }}
                    >
                      {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  {!isMobile && (
                    <span className="text-sm font-medium" style={{ color: "var(--g-text-primary)" }}>
                      {user?.name?.split(' ')[0] || ''}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--g-border-subtle)" }}>
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--g-text-primary)" }}>
                    {user?.name || '-'}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--g-text-tertiary)" }}>
                    {user?.email || '-'}
                  </p>
                </div>
                <DropdownMenuItem
                  onClick={() => setLocation('/profile')}
                  className="cursor-pointer gap-2 py-2.5"
                >
                  <Settings className="h-4 w-4" />
                  Account Settings
                </DropdownMenuItem>
                {(effectiveRole === 'admin' || effectiveTeamRole === 'admin' || effectiveIsTenantAdmin === 'true') && !isDemo && (
                  <DropdownMenuItem
                    onClick={() => setLocation('/settings')}
                    className="cursor-pointer gap-2 py-2.5"
                  >
                    <Building2 className="h-4 w-4" />
                    Organization Settings
                  </DropdownMenuItem>
                )}
                {(effectiveRole === 'super_admin') && !isDemo && (
                  <DropdownMenuItem
                    onClick={() => setLocation('/admin')}
                    className="cursor-pointer gap-2 py-2.5"
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive gap-2 py-2.5"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile hamburger */}
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
                style={{
                  color: "var(--g-text-secondary)",
                  background: mobileMenuOpen ? "var(--g-bg-inset)" : "transparent",
                }}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {isMobile && mobileMenuOpen && (
        <div
          className="fixed top-[var(--g-topnav-height,64px)] left-0 right-0 z-[99] py-2 px-3"
          style={{
            background: "var(--g-glass-bg)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderBottom: "1px solid var(--g-glass-border)",
            animation: "g-slide-down 0.2s ease-out",
          }}
        >
          {menuItems.map((item) => {
            const isActive = location === item.path ||
              (item.path !== '/tasks' && location.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => {
                  setLocation(item.path);
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  color: isActive ? "var(--g-accent)" : "var(--g-text-secondary)",
                  background: isActive ? "var(--g-accent-surface)" : "transparent",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
