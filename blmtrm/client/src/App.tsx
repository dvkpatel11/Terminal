import { Switch, Route } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Terminal from "./pages/Terminal";
import NotFound from "./pages/not-found";

function Router() {
  return (
    <Switch hook={useHashLocation}>
      <Route path="/" component={Terminal} />
      <Route path="" component={Terminal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dark">
        <Router />
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}

export default App;
