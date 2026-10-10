import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getActiveShows, type ActiveShow } from '@/lib/activeShows';
import ActiveShowCard from '@/components/ActiveShowCard';
import ShowBundleCard from '@/components/ShowBundleCard';
import { claimBundleToken } from '@/lib/bundle';
import { toast } from 'sonner';
import HamburgerMenu from '@/components/HamburgerMenu';
import logoImg from '@/assets/logo.png';

export default function Shows() {
  const navigate = useNavigate();
  const [shows, setShows] = useState<ActiveShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [waNumber, setWaNumber] = useState('');
  const [waLink, setWaLink] = useState('');
  const [lightMode, setLightMode] = useState(() => { try { return localStorage.getItem('replaytime-mode') === 'light'; } catch { return false; } });

  useEffect(() => {
    try {
      const root = document.documentElement;
      root.classList.toggle('light', lightMode);
      localStorage.setItem('replaytime-mode', lightMode ? 'light' : 'dark');
    } catch { /* ignore */ }
  }, [lightMode]);

  // Link bundel (?bt=) → buka akses semua show di perangkat ini.
  useEffect(() => {
    const bt = new URLSearchParams(window.location.search).get('bt');
    if (!bt) return;
    void claimBundleToken(bt).then(async (res) => {
      if (!res) { toast.error('Link bundel tidak valid atau sudah dicabut'); return; }
      toast.success(`Bundel aktif: ${res.shows.length} show terbuka`);
      // Langsung buka player: show bundel yang sedang live, kalau tidak ada → show terdekat.
      const ids = res.shows.map((s) => s.id).filter(Boolean);
      if (!ids.length) return;
      const { data } = await supabase.from('active_shows')
        .select('id,is_live,replay_id,show_date,show_time,is_active')
        .in('id', ids).eq('is_active', true).is('replay_id', null)
        .order('show_date', { ascending: true }).order('show_time', { ascending: true });
      const list = (data || []) as { id: string; is_live: boolean }[];
      const pick = list.find((s) => s.is_live) || list[0];
      const tok = pick ? res.shows.find((s) => s.id === pick.id)?.token : '';
      if (pick && tok) navigate(`/live?show=${pick.id}&t=${tok}`, { replace: true });
    });
  }, []);

  useEffect(() => {
    supabase.from('site_settings').select('key,value').then(({ data }) => {
      const s: Record<string, string> = {};
      (data || []).forEach((r: any) => { s[r.key] = r.value; });
      setWaNumber(s.whatsapp_number || '');
      setWaLink(s.whatsapp_link || '');
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = () => getActiveShows().then(d => { if (mounted) { setShows(d); setLoading(false); } });
    load();
    const ch = supabase
      .channel('shows-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_shows' }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center gap-2">
          <HamburgerMenu whatsappNumber={waNumber} whatsappLink={waLink} lightMode={lightMode} onToggleMode={() => setLightMode(v => !v)} />
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0" title="Kembali">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={logoImg} alt="RealTime48" className="w-8 h-8 rounded-full object-cover" />
          <h1 className="text-base sm:text-lg font-bold text-primary font-sans truncate">Show Aktif</h1>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 pb-28 sm:pb-10">
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Pilih Show Anda
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Show & Replay</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Beli tiket show secara digital atau tonton replay langsung dari halaman ini.
          </p>
        </div>

        <div className="mb-6">
          <ShowBundleCard />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card/60 p-4 animate-pulse h-80" />
            ))}
          </div>
        ) : shows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/60 p-10 text-center space-y-3">
            <Calendar className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Belum ada show aktif saat ini.</p>
            <Button variant="outline" onClick={() => navigate('/')}>Lihat Replay</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shows.map((s, i) => <ActiveShowCard key={s.id} show={s} index={i} />)}
          </div>
        )}
      </main>
    </div>
  );
}
