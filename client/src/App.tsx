import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import CallInbox from "./pages/CallInbox";
import CallDetail from "./pages/CallDetail";
import TeamMembers from "./pages/TeamMembers";
import Analytics from "./pages/Analytics";
import Training from "./pages/Training";
import SocialMedia from "./pages/SocialMedia";
import TeamManagement from "./pages/TeamManagement";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/calls" component={CallInbox} />
      <Route path="/calls/:id" component={CallDetail} />
      <Route path="/team" component={TeamMembers} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/training" component={Training} />
      <Route path="/social" component={SocialMedia} />
      <Route path="/team-management" component={TeamManagement} />
      <Route path="/profile" component={Profile} />
      <Route path="/leaderboard" component={Leaderboard} />
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <DashboardLayout>
            <Router />
          </DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
