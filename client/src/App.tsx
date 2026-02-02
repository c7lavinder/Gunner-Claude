import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import CallInbox from "./pages/CallInbox";
import CallDetail from "./pages/CallDetail";
import Leaderboard from "./pages/Leaderboard";
import TeamMembers from "./pages/TeamMembers";
import Analytics from "./pages/Analytics";
import Training from "./pages/Training";
import GradingRules from "./pages/GradingRules";
import Feedback from "./pages/Feedback";
import Methodology from "./pages/Methodology";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/calls" component={CallInbox} />
      <Route path="/calls/:id" component={CallDetail} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/team" component={TeamMembers} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/training" component={Training} />
      <Route path="/rules" component={GradingRules} />
      <Route path="/feedback" component={Feedback} />
      <Route path="/methodology" component={Methodology} />
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
