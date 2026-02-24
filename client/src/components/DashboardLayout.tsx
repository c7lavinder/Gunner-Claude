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
  const isAdmin = teamRole === 'admin' || isTenantAdmin === 'true';
  const isSuperAdmin = userRole === 'super_admin';
  const isLeadGenerator = teamRole === 'lead_generator';

  if (isLeadGenerator) {
    return [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: Phone, label: "Call History", path: "/calls" },
      { icon: BookOpen, label: "Training", path: "/training" },
      { icon: Users, label: "My Profile", path: "/team" },
    ];
  }

  const items = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Phone, label: "Call History", path: "/calls" },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
  ];

  if (isAdmin) {
    items.push({ icon: AlertTriangle, label: "Signals", path: "/opportunities" });
  }

  items.push({ icon: BookOpen, label: "Training", path: "/training" });
  items.push({ icon: Users, label: "Team", path: "/team" });

  if (isAdmin && !isDemo) {
    items.push({ icon: Building2, label: "Settings", path: "/settings" });
  }

  const isPlatformOwner = false;
  if ((isSuperAdmin || isPlatformOwner) && !isDemo) {
    items.push({ icon: Shield, label: "Platform Admin", path: "/admin" });
  }

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
      <div className="flex items-center justify-center min-h-screen bg-[var(--obs-bg-base)]">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-[var(--obs-text-secondary)] text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
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
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  const isDemo = Boolean((user as any)?._isDemo);

  if (!onboardingCompleted && tenantSettings && !isSuperAdmin && !isDemo) {
    return <Redirect to="/onboarding" />;
  }

  if (onboardingCompleted && !hasActiveSubscription && tenantSettings && !isSuperAdmin && !justCompletedCheckout && !isDemo) {
    return <Redirect to="/paywall" />;
  }

  return (
    <div className="min-h-screen bg-[var(--obs-bg-base)]">
      {isDemo && (
        <div className="fixed top-0 left-0 right-0 z-[110] bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center py-2.5 px-4 text-sm font-medium shadow-md">
          <span>You're viewing a demo of Gunner AI</span>
          <span className="mx-2">—</span>
          <a href="https://getgunner.ai" target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-white/90 transition-colors">
            Start your free trial →
          </a>
        </div>
      )}
      <div className={isImpersonating ? "pt-12" : isDemo ? "pt-10" : ""}>
        <TopNavBar user={user} isDemo={isDemo} />
        <main className="obs-page">
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

  const effectiveRole = (isTenantImpersonating && impType === 'super_admin') ? 'admin' : user?.role;
  const effectiveTeamRole = (isTenantImpersonating && impType === 'super_admin') ? 'admin' : user?.teamRole;
  const effectiveIsTenantAdmin = (isTenantImpersonating && impType === 'super_admin') ? 'true' : user?.isTenantAdmin;
  const menuItems = getMenuItems(effectiveTeamRole, user?.openId, effectiveRole, effectiveIsTenantAdmin, isDemo);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <>
      <nav className="obs-topnav">
        <div className="obs-topnav-inner">
          {/* Brand */}
          <div
            className="obs-topnav-brand"
            onClick={() => setLocation('/dashboard')}
            style={{ cursor: 'pointer' }}
          >
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663328210645/nusXfQu5XBTMz3NUCR6brb/branding/gunner-logo-small.png"
              alt="Gunner"
              style={{ height: 32, objectFit: 'contain' }}
            />
          </div>

          {/* Desktop Tabs */}
          {!isMobile && (
            <div className="obs-topnav-tabs">
              {menuItems.map((item) => {
                const isActive = location === item.path ||
                  (item.path !== '/dashboard' && location.startsWith(item.path));
                return (
                  <button
                    key={item.path}
                    className={`obs-topnav-tab ${isActive ? 'active' : ''}`}
                    onClick={() => setLocation(item.path)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Right side */}
          <div className="obs-topnav-right">
            {/* Theme toggle */}
            {switchable && toggleTheme && (
              <button
                className="obs-theme-toggle"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            )}

            {/* User avatar dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="obs-avatar-btn" aria-label="User menu">
                  <Avatar className="h-8 w-8">
                    {user?.profilePicture && (
                      <AvatarImage src={user.profilePicture} alt={user?.name || 'Profile'} />
                    )}
                    <AvatarFallback className="obs-avatar-fallback">
                      {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2 border-b border-[var(--obs-border-subtle)]">
                  <p className="text-sm font-medium truncate">{user?.name || '-'}</p>
                  <p className="text-xs text-[var(--obs-text-tertiary)] truncate mt-0.5">{user?.email || '-'}</p>
                </div>
                <DropdownMenuItem
                  onClick={() => setLocation('/profile')}
                  className="cursor-pointer"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Account Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile hamburger */}
            {isMobile && (
              <button
                className="obs-theme-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {isMobile && mobileMenuOpen && (
        <div className="obs-mobile-menu">
          {menuItems.map((item) => {
            const isActive = location === item.path ||
              (item.path !== '/dashboard' && location.startsWith(item.path));
            return (
              <button
                key={item.path}
                className={`obs-mobile-menu-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setLocation(item.path);
                  setMobileMenuOpen(false);
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
