import { useLayoutEffect } from "react";
import { Redirect, Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Notices from "@/pages/Notices";
import Papers from "@/pages/Papers";
import Regulations from "@/pages/Regulations";
import Admissions from "@/pages/Admissions";
import Photos from "@/pages/Photos";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

function ScrollToTop() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    // Route navigation should be immediate and must not inherit the global
    // smooth-scroll behavior, including for people who prefer reduced motion.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);

  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/notices" component={Notices} />
        <Route path="/notices/:id" component={Notices} />
        <Route path="/papers" component={Papers} />
        <Route path="/papers/:category" component={Papers} />
        <Route path="/regulations" component={Regulations} />
        <Route path="/admissions"><Redirect to="/admissions/guidelines" /></Route>
        <Route path="/admissions/guidelines" component={Admissions} />
        <Route path="/photos/:id" component={Photos} />
        <Route path="/photos" component={Photos} />
        <Route path="/talent-pool"><Redirect to="/admissions/guidelines" /></Route>
        <Route path="/privacy"><Redirect to="/" /></Route>
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
