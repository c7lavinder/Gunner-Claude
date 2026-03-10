import { Route, Switch, Redirect } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Landing } from "@/pages/landing/Landing";
import { Login } from "@/pages/Login";
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

function AuthWrapper({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

export function App() {
  return (
    <>
      <Switch>
        <Route path="/">
          <Landing />
        </Route>
        <Route path="/login">
          <Login />
        </Route>
        <Route path="/today">
          <AuthWrapper>
            <Today />
          </AuthWrapper>
        </Route>
        <Route path="/calls">
          <AuthWrapper>
            <CallInbox />
          </AuthWrapper>
        </Route>
        <Route path="/inventory">
          <AuthWrapper>
            <Inventory />
          </AuthWrapper>
        </Route>
        <Route path="/kpis">
          <AuthWrapper>
            <KpiPage />
          </AuthWrapper>
        </Route>
        <Route path="/team">
          <AuthWrapper>
            <Team />
          </AuthWrapper>
        </Route>
        <Route path="/training">
          <AuthWrapper>
            <Training />
          </AuthWrapper>
        </Route>
        <Route path="/settings">
          <AuthWrapper>
            <Settings />
          </AuthWrapper>
        </Route>
        <Route path="/playbook">
          <AuthWrapper>
            <Playbook />
          </AuthWrapper>
        </Route>
        <Route path="/profile">
          <AuthWrapper>
            <Profile />
          </AuthWrapper>
        </Route>
        <Route path="/industries/:industry">
          <IndustryLanding />
        </Route>
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
      <Toaster />
    </>
  );
}
