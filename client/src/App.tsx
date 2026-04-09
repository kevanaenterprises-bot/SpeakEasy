import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import VideoCall from "@/pages/video-call";
import AdminDashboard from "@/pages/admin";
import GuestJoin from "@/pages/guest-join";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/join/:roomId" component={GuestJoin} />
      <Route path="/call/:roomId" component={VideoCall} />
      <Route path="/admin" component={AdminDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
