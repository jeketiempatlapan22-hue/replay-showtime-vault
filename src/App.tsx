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
const TvPage = lazy(() => import("./pages/Tv"));
const Game = lazy(() => import("./pages/Game"));

const queryClient = new QueryClient();

function PurchaseSync() {
  const location = useLocation();
  useEffect(() => {
    // Halaman live tidak disentuh.
    if (location.pathname.startsWith('/live')) return;
    void syncPurchases(true);
    const onFocus = () => void syncPurchases();
    window.addEventListener('focus', onFocus);
    const onVis = () => { if (document.visibilityState === 'visible') void syncPurchases(); };
    document.addEventListener('visibilitychange', onVis);
    // Polling ringan: pembeli anon (tanpa login) tetap mendapat tombol tonton
    // secara otomatis setelah pembayaran terkonfirmasi.
    const iv = window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncPurchases(true);
    }, 30000);
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void syncPurchases(true); });
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(iv);
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

// Tampilan saat halaman sedang diunduh. Dulu hanya layar gelap kosong, sehingga
// di laptop/HP lambat penonton mengira website rusak (layar hitam).
function PageLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(t);
  }, []);
  const hardReload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('app-code-') || k.startsWith('html-nav-')).map((k) => caches.delete(k)));
      }
    } finally { window.location.reload(); }
  };
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      <p className="text-sm text-muted-foreground">Memuat halaman…</p>
      {slow && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Koneksi lambat atau browser menyimpan versi lama.</p>
          <button onClick={hardReload} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Muat ulang
          </button>
        </div>
      )}
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
          <PurchaseSync />
          <ProtectedShell>
            <Suspense fallback={<PageLoading />}>
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
              <Route path="/tv" element={<TvPage />} />
              <Route path="/game" element={<Game />} />
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
