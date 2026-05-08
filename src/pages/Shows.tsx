import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getActiveShows, type ActiveShow } from '@/lib/activeShows';
import ActiveShowCard from '@/components/ActiveShowCard';
import HamburgerMenu from '@/components/HamburgerMenu';
import logoImg from '@/assets/realtime48-logo.png';

export default function Shows() {
  const navigate = useNavigate();
  const [shows, setShows] = useState<ActiveShow[]>([]);
  const [loading, setLoading] = useState(true);

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
          <HamburgerMenu />
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0" title="Kembali">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={logoImg} alt="RealTime48" className="w-8 h-8 rounded-full object-cover" />
          <h1 className="text-base sm:text-lg font-bold text-primary font-sans truncate">Show Aktif</h1>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6">
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Pilih Show Anda
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Show & Replay</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Beli tiket show secara digital atau tonton replay langsung dari halaman ini.
          </p>
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
