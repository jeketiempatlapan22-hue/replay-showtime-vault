import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import BlockedScreen from "@/components/BlockedScreen";
import { useDevToolsDetector } from "@/hooks/useDevToolsDetector";
import { getBrowserId } from "@/lib/browserId";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Live from "./pages/Live";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Akses from "./pages/Akses";
import Shows from "./pages/Shows";

const queryClient = new QueryClient();

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  // Skip protection on admin route
  const isAdminRoute = location.pathname.startsWith('/adpan') || location.pathname.startsWith('/auth');

  // Check existing block status on mount
  useEffect(() => {
    if (isAdminRoute) { setChecking(false); return; }
    const browserId = getBrowserId();
    supabase
      .from('blocked_browsers')
      .select('unblocked')
      .eq('browser_id', browserId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && !data.unblocked) setBlocked(true);
        setChecking(false);
      });
  }, [isAdminRoute]);

  useDevToolsDetector(() => {
    if (!isAdminRoute) setBlocked(true);
  });

  if (checking) return null;
  if (blocked && !isAdminRoute) return <BlockedScreen />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
          <ProtectedShell>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/live" element={<Live />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/akses" element={<Akses />} />
              <Route path="/shows" element={<Shows />} />
              <Route path="/adpan" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ProtectedShell>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
