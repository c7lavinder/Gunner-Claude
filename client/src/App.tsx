import { Route, Switch, Redirect } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Landing } from "@/pages/landing/Landing";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { GoogleAuthCallback } from "@/pages/GoogleAuthCallback";
import { Today } from "@/pages/Today";
import { CallInbox } from "@/pages/CallInbox";
import { Inventory } from "@/pages/Inventory";
import { KpiPage } from "@/pages/KpiPage";
import { Team } from "@/pages/Team";
import { Training } from "@/pages/Training";
import { Settings } from "@/pages/Settings";
import { Playbook } from "@/pages/Playbook";
import { Profile } from "@/pages/Profile";
import { IndustryLanding } from "@/pages/landing/IndustryLanding";

export function App() {
  return (
    <>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/auth/google/callback" component={GoogleAuthCallback} />
        <Route path="/industries/:industry" component={IndustryLanding} />
        <Route path="/:rest*">
          <AuthGuard>
            <DashboardLayout>
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
            </DashboardLayout>
          </AuthGuard>
        </Route>
      </Switch>
      <Toaster />
    </>
  );
}
