import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { MainLayout } from "@/components/layout/main-layout";
import DashboardPage from "@/pages/dashboard";
import QueuePage from "@/pages/queue";
import TexterPage from "@/pages/texter";
import TranscriptsPage from "@/pages/transcripts";
import TrainingPage from "@/pages/training";
import SarahAIPage from "@/pages/sarah";
import LogsPage from "@/pages/logs";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/queue" component={QueuePage} />
        <Route path="/texter" component={TexterPage} />
        <Route path="/transcripts" component={TranscriptsPage} />
        <Route path="/training" component={TrainingPage} />
        <Route path="/sarah" component={SarahAIPage} />
        <Route path="/logs" component={LogsPage} />
        
        {/* Fallback */}
        <Route>
          <div className="terminal-card text-center py-20">
            <h2 className="text-2xl font-mono font-bold text-destructive mb-2">404 - Not Found</h2>
            <p className="text-muted-foreground">The requested module does not exist in the mainframe.</p>
          </div>
        </Route>
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
