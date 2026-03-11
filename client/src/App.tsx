import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/CommandPalette";
import { BadgeUnlockNotification } from "@/components/BadgeUnlockNotification";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { Landing } from "@/pages/landing/Landing";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { GoogleAuthCallback } from "@/pages/GoogleAuthCallback";

const Today = lazy(() => import("@/pages/Today").then((m) => ({ default: m.Today })));
const CallInbox = lazy(() => import("@/pages/CallInbox").then((m) => ({ default: m.CallInbox })));
const Inventory = lazy(() => import("@/pages/Inventory").then((m) => ({ default: m.Inventory })));
const KpiPage = lazy(() => import("@/pages/KpiPage").then((m) => ({ default: m.KpiPage })));
const Team = lazy(() => import("@/pages/Team").then((m) => ({ default: m.Team })));
const Training = lazy(() => import("@/pages/Training").then((m) => ({ default: m.Training })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const Playbook = lazy(() => import("@/pages/Playbook").then((m) => ({ default: m.Playbook })));
const Profile = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.Profile })));
const IndustryLanding = lazy(() => import("@/pages/landing/IndustryLanding").then((m) => ({ default: m.IndustryLanding })));
const Onboarding = lazy(() => import("@/pages/Onboarding").then((m) => ({ default: m.Onboarding })));

function PrivacyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl w-full rounded-xl border p-8 space-y-4">
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Privacy policy coming soon. Contact{" "}
          <a href="mailto:corey@getgunner.ai" className="underline">
            corey@getgunner.ai
          </a>{" "}
          for questions.
        </p>
      </div>
    </div>
  );
}

function TermsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl w-full rounded-xl border p-8 space-y-4">
        <h1 className="text-2xl font-bold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Terms of service coming soon. Contact{" "}
          <a href="mailto:corey@getgunner.ai" className="underline">
            corey@getgunner.ai
          </a>{" "}
          for questions.
        </p>
      </div>
    </div>
  );
}

function PageTracker() {
  const [location] = useLocation();
  const { track } = useTrackEvent();

  useEffect(() => {
    track({ type: "page_view", page: location });
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/signup" component={Signup} />
          <Route path="/auth/google/callback" component={GoogleAuthCallback} />
          <Route path="/industries/:industry" component={IndustryLanding} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/terms" component={TermsPage} />
          <Route path="/onboarding">
            <AuthGuard>
              <Onboarding />
            </AuthGuard>
          </Route>
          <Route path="/:rest*">
            <AuthGuard>
              <DashboardLayout>
                <PageTracker />
                <Suspense fallback={<PageLoader />}>
                  <Switch>
                    <Route path="/today" component={Today} />
                    <Route path="/calls" component={CallInbox} />
                    <Route path="/inventory" component={Inventory} />
                    <Route path="/kpis" component={KpiPage} />
                    <Route path="/team" component={Team} />
                    <Route path="/training" component={Training} />
                    <Route path="/settings" component={Settings} />
                    <Route path="/playbook" component={Playbook} />
                    <Route path="/profile" component={Profile} />
                    <Route>
                      <Redirect to="/today" />
                    </Route>
                  </Switch>
                </Suspense>
              </DashboardLayout>
            </AuthGuard>
          </Route>
        </Switch>
      </Suspense>
      <Toaster />
      <CommandPalette />
      <BadgeUnlockNotification />
    </ErrorBoundary>
  );
}
