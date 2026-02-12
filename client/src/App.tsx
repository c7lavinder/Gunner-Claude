import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { LoadingScreen } from "./components/LoadingScreen";
import Home from "./pages/Home";
import CallInbox from "./pages/CallInbox";
import CallDetail from "./pages/CallDetail";
import TeamMembers from "./pages/TeamMembers";
import Analytics from "./pages/Analytics";
import Training from "./pages/Training";
import SocialMedia from "./pages/SocialMedia";
import TeamManagement from "./pages/TeamManagement";
import Profile from "./pages/Profile";
import KpiDashboard from "./pages/KpiDashboard";
import Onboarding from "./pages/Onboarding";
import Pricing from "./pages/Pricing";
import SuperAdmin from "./pages/SuperAdmin";
import TenantSettings from "./pages/TenantSettings";
import AdminDashboard from "./pages/AdminDashboard";
import TenantSetup from "./pages/TenantSetup";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import VerificationPending from "./pages/VerificationPending";
import Paywall from "./pages/Paywall";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import LeadGenDashboard from "./pages/LeadGenDashboard";
import Opportunities from "./pages/Opportunities";
import { ImpersonationBanner } from "./components/ImpersonationBanner";

// Public routes that don't need DashboardLayout
// Root (/) is now the landing page for unauthenticated users
const PUBLIC_ROUTES = ['/', '/landing', '/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/verification-pending', '/terms', '/privacy'];

function PublicRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      {/* Redirect /landing to / for backwards compatibility */}
      <Route path="/landing">
        <Redirect to="/" />
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/verification-pending" component={VerificationPending} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ProtectedRouter() {
  return (
    <Switch>
      <Route path="/dashboard" component={Home} />
      <Route path="/lead-gen-dashboard" component={LeadGenDashboard} />
      <Route path="/calls" component={CallInbox} />
      <Route path="/calls/:id" component={CallDetail} />
      <Route path="/team" component={TeamMembers} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/opportunities" component={Opportunities} />
      <Route path="/training" component={Training} />
      <Route path="/social" component={SocialMedia} />
      <Route path="/team-management" component={TeamManagement} />
      <Route path="/profile" component={Profile} />
      <Route path="/kpi" component={KpiDashboard} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/paywall" component={Paywall} />
      <Route path="/admin" component={SuperAdmin} />
      <Route path="/admin/tenant-setup" component={TenantSetup} />
      <Route path="/admin-dashboard" component={AdminDashboard} />
      <Route path="/settings" component={TenantSettings} />
      <Route path="/leaderboard">
        <Redirect to="/team" />
      </Route>
      {/* Redirects for removed/consolidated pages */}
      <Route path="/feedback">
        <Redirect to="/calls" />
      </Route>
      <Route path="/methodology">
        <Redirect to="/training" />
      </Route>
      <Route path="/rules">
        <Redirect to="/training" />
      </Route>
      
      <Route path="/team-training">
        <Redirect to="/training" />
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  
  // Check if current route is a public route (exact match for root, prefix for others)
  const isPublicRoute = location === '/' || 
    PUBLIC_ROUTES.slice(1).some(route => location.startsWith(route));
  
  if (isPublicRoute) {
    return <PublicRouter />;
  }
  
  return (
    <DashboardLayout>
      <ProtectedRouter />
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <LoadingScreen />
          <ImpersonationBanner />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
