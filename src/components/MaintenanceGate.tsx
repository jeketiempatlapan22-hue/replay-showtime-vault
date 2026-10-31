import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Halaman yang tetap bisa dibuka saat Mode Perbaikan aktif.
const LIVE_PATHS = ['/live', '/kunci', '/free', '/tv', '/reseller'];
const ALWAYS_OPEN = ['/adpan', '/auth', '/reset-password'];
// Domain utama & preview: tunduk pada Mode Perbaikan. Host lain yang cocok dengan
// site_settings.replay_origin = Domain Replay Rahasia (selalu terbuka).
const normHost = (v: string) => String(v || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();

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
  const { pathname } = useLocation();
  const [mode, setMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [userBlocked, setUserBlocked] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from('site_settings').select('key,value').in('key', ['maintenance_mode', 'maintenance_message']);
      const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      setMode(m.maintenance_mode === 'true');
      setMsg(m.maintenance_message || '');
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
  if (!open && userBlocked) return <MaintenanceScreen />;
  if (!open && !isLive && mode) return <MaintenanceScreen message={msg} />;
  return <>{children}</>;
}
