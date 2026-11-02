import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { supabase } from '@/integrations/backend';

// Halaman yang tetap bisa dibuka saat Mode Perbaikan aktif.
const LIVE_PATHS = ['/live', '/kunci', '/free', '/tv', '/reseller', '/akses'];
// Link token (live/replay/membership/bundel) tetap terbuka saat Mode Perbaikan;
// diingat per tab agar navigasi lanjutan (daftar replay, player) tidak tertutup.
const TOKEN_PARAMS = ['token', 'mtoken', 'btoken', 'replay', 't'];
const BYPASS_KEY = 'maint_token_bypass';
function hasTokenAccess(search: string): boolean {
  try {
    const q = new URLSearchParams(search);
    if (TOKEN_PARAMS.some((k) => (q.get(k) || '').trim())) { sessionStorage.setItem(BYPASS_KEY, '1'); return true; }
    return sessionStorage.getItem(BYPASS_KEY) === '1';
  } catch { return false; }
}
const ALWAYS_OPEN = ['/adpan', '/auth', '/reset-password'];
// Path Replay Rahasia (site_settings.replay_path, default "rply"): selalu terbuka
// walau Mode Perbaikan aktif — halaman utama (/) tetap tertutup.
const normPath = (v: string) => String(v || '').trim().replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9-]/gi, '').toLowerCase();

export function MaintenanceScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Wrench className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-xl font-bold text-foreground">Website dalam perbaikan</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {message || 'Kami sedang melakukan perbaikan. Silakan kembali beberapa saat lagi.'}
      </p>
    </div>
  );
}

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation();
  const [mode, setMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [userBlocked, setUserBlocked] = useState(false);
  const [secretPath, setSecretPath] = useState('rply');

  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from('site_settings').select('key,value').in('key', ['maintenance_mode', 'maintenance_message', 'replay_path']);
      const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      setMode(m.maintenance_mode === 'true');
      setMsg(m.maintenance_message || '');
      setSecretPath(normPath(m.replay_path || '') || 'rply');
    };
    const checkUser = async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { setUserBlocked(false); return; }
      const { data } = await supabase.rpc('am_i_blocked');
      setUserBlocked(data === true);
    };
    loadSettings(); checkUser();
    const ch = supabase.channel('maintenance-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, loadSettings)
      .subscribe();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { setTimeout(checkUser, 0); });
    const iv = window.setInterval(() => { loadSettings(); checkUser(); }, 60000);
    return () => { supabase.removeChannel(ch); sub.subscription.unsubscribe(); window.clearInterval(iv); };
  }, []);

  const open = ALWAYS_OPEN.some((p) => pathname.startsWith(p));
  const isLive = LIVE_PATHS.some((p) => pathname.startsWith(p));
  const isSecretReplay = normPath(pathname) === secretPath;
  if (!open && userBlocked) return <MaintenanceScreen />;
  const tokenAccess = hasTokenAccess(search);
  if (!open && !isLive && !isSecretReplay && !tokenAccess && mode) return <MaintenanceScreen message={msg} />;
  return <>{children}</>;
}
