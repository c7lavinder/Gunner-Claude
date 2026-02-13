import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { LayoutDashboard, LogOut, PanelLeft, Users, Phone, BarChart3, BookOpen, Building2, Shield, AlertTriangle, Settings } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation, Redirect, useSearch } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { useImpersonation } from "./ImpersonationBanner";

const getMenuItems = (teamRole: string | null | undefined, openId?: string, userRole?: string) => {
  const isAdmin = teamRole === 'admin';
  const isSuperAdmin = userRole === 'super_admin';
  const isLeadGenerator = teamRole === 'lead_generator';
  
  // Lead Generators get a simplified menu
  if (isLeadGenerator) {
    return [
      { icon: LayoutDashboard, label: "My Dashboard", path: "/lead-gen-dashboard" },
      { icon: Phone, label: "My Calls", path: "/calls" },
      { icon: Users, label: "My Profile", path: "/team" },
    ];
  }
  
  const items = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Phone, label: "Call History", path: "/calls" },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
  ];
  
  // Signals is admin-only
  if (isAdmin) {
    items.push({ icon: AlertTriangle, label: "Signals", path: "/opportunities" });
  }
  
  items.push({ icon: BookOpen, label: "Training", path: "/training" });
  
  // Social Media is temporarily hidden (coming soon)
  // if (!isLeadManager) {
  //   items.push({ icon: Share2, label: "Social Media", path: "/social" });
  // }
  
  // Team page now includes My Profile tab
  items.push({ icon: Users, label: "Team", path: "/team" });
  
  // Company Settings (includes Team Management) is admin-only
  if (isAdmin) {
    items.push({ icon: Building2, label: "Settings", path: "/settings" });
  }
  
  // Admin Dashboard is for super_admin users (platform owner)
  if (isSuperAdmin) {
    items.push({ icon: Shield, label: "Admin", path: "/admin-dashboard" });
  }
  
  return items;
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const [location] = useLocation();
  const searchString = useSearch();
  const { isImpersonating } = useImpersonation();
  
  // Check if user just completed checkout (Stripe redirects with ?checkout=success)
  // Use sessionStorage to persist this across re-renders after URL cleanup
  const searchParams = new URLSearchParams(searchString);
  const checkoutFromUrl = searchParams.get('checkout') === 'success';
  
  // Store checkout success in sessionStorage so it persists after URL cleanup
  const [justCompletedCheckout, setJustCompletedCheckout] = useState(() => {
    if (checkoutFromUrl) return true;
    return sessionStorage.getItem('checkout_success') === 'true';
  });
  
  // When checkout=success is in URL, save to sessionStorage
  useEffect(() => {
    if (checkoutFromUrl) {
      sessionStorage.setItem('checkout_success', 'true');
      setJustCompletedCheckout(true);
      // Clear after 60 seconds (enough time for webhook to process)
      setTimeout(() => {
        sessionStorage.removeItem('checkout_success');
      }, 60000);
    }
  }, [checkoutFromUrl]);
  
  // Fetch tenant settings to check onboarding status
  const { data: tenantSettings, isLoading: tenantLoading } = trpc.tenant.getSettings.useQuery(
    undefined,
    { enabled: !!user }
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading || (user && tenantLoading)) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  // Check if email is verified - redirect to verification pending page
  // Skip for users who signed up with Google OAuth (they're already verified)
  const isEmailPasswordUser = user?.loginMethod === 'email_password';
  const isEmailVerified = user?.emailVerified === 'true';
  
  if (isEmailPasswordUser && !isEmailVerified) {
    return <Redirect to="/verification-pending" />;
  }

  // Route detection
  const isOnboardingRoute = location === '/onboarding';
  const isPaywallRoute = location === '/paywall';
  const isPricingRoute = location === '/pricing';
  
  // State checks
  const onboardingCompleted = tenantSettings?.onboardingCompleted === 'true';
  const hasActiveSubscription = tenantSettings?.stripeSubscriptionId && 
    (tenantSettings?.subscriptionStatus === 'active' || tenantSettings?.subscriptionStatus === 'past_due');
  const isSuperAdmin = user?.role === 'super_admin';
  
  // FLOW LOGIC:
  // 1. If on onboarding page, always render it (let the page handle its own logic)
  if (isOnboardingRoute) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }
  
  // 2. If on paywall page, always render it (let the page handle its own logic)
  if (isPaywallRoute || isPricingRoute) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }
  
  // 3. If onboarding NOT completed, redirect to onboarding
  if (!onboardingCompleted && tenantSettings) {
    return <Redirect to="/onboarding" />;
  }
  
  // 4. If onboarding completed but no subscription, redirect to paywall
  // Super admins bypass this check
  // Also bypass if user just completed checkout (webhook may not have processed yet)
  if (onboardingCompleted && !hasActiveSubscription && tenantSettings && !isSuperAdmin && !justCompletedCheckout) {
    return <Redirect to="/paywall" />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <div className={`flex min-h-svh w-full ${isImpersonating ? "pt-12" : ""}`}>
        <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
          {children}
        </DashboardLayoutContent>
      </div>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuItems = getMenuItems(user?.teamRole, user?.openId, user?.role);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-20 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-10 w-10 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                {isCollapsed ? (
                  <img 
                    src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/ORoxztkyoTJEjMxT.png" 
                    alt="Gunner" 
                    className="h-8 w-8 object-contain"
                  />
                ) : (
                  <PanelLeft className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <img 
                    src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/pEvSFVlapabhnbkw.png" 
                    alt="Gunner" 
                    className="h-12 object-contain"
                  />
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    {user?.profilePicture && (
                      <AvatarImage src={user.profilePicture} alt={user?.name || 'Profile'} />
                    )}
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
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
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/pEvSFVlapabhnbkw.png" 
                alt="Gunner" 
                className="h-8 object-contain"
              />
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
