import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
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
import { syncPurchases } from "@/lib/purchaseSync";
import BottomNav from "./components/BottomNav";
import GuestOnboardBanner from "./components/GuestOnboardBanner";


const Index = lazy(() => import("./pages/Index"));
const Admin = lazy(() => import("./pages/Admin"));
const Live = lazy(() => import("./pages/Live"));
const Free = lazy(() => import("./pages/Free"));
const Kunci = lazy(() => import("./pages/Kunci"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Akses = lazy(() => import("./pages/Akses"));
const Shows = lazy(() => import("./pages/Shows"));
const Koin = lazy(() => import("./pages/Koin"));
const Membership = lazy(() => import("./pages/Membership"));
const Profil = lazy(() => import("./pages/Profil"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Reseller = lazy(() => import("./pages/Reseller"));
const Panduan = lazy(() => import("./pages/Panduan"));

const queryClient = new QueryClient();

function PurchaseSync() {
  const location = useLocation();
  useEffect(() => {
    // Halaman live tidak disentuh.
    if (location.pathname.startsWith('/live')) return;
    void syncPurchases();
    const onFocus = () => void syncPurchases();
    window.addEventListener('focus', onFocus);
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void syncPurchases(true); });
    return () => {
      window.removeEventListener('focus', onFocus);
      sub.subscription.unsubscribe();
    };
  }, [location.pathname]);
  return null;
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  // Skip protection on admin route
  const isAdminRoute = location.pathname.startsWith('/adpan') || location.pathname.startsWith('/auth') || location.pathname.startsWith('/reset-password');

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

  const handleDevToolsDetected = useCallback(() => {
    if (!isAdminRoute) setBlocked(true);
  }, [isAdminRoute]);

  useDevToolsDetector(handleDevToolsDetected);

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
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/live" element={<Live />} />
              <Route path="/free" element={<Free />} />
              <Route path="/kunci" element={<Kunci />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/akses" element={<Akses />} />
              <Route path="/shows" element={<Shows />} />
              <Route path="/show" element={<Shows />} />
              <Route path="/koin" element={<Koin />} />
              <Route path="/membership" element={<Membership />} />
              <Route path="/profil" element={<Profil />} />
              <Route path="/adpan" element={<Admin />} />
              <Route path="/reseller" element={<Reseller />} />
              <Route path="/panduan" element={<Panduan />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            <BottomNav />
            <GuestOnboardBanner />

          </ProtectedShell>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
