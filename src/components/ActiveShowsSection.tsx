import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getActiveShows, type ActiveShow } from '@/lib/activeShows';
import ActiveShowCard from './ActiveShowCard';

export default function ActiveShowsSection() {
  const [shows, setShows] = useState<ActiveShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = () => getActiveShows().then(d => { if (mounted) { setShows(d); setLoading(false); } });
    load();
    const ch = supabase
      .channel('active_shows-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_shows' }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  if (loading || shows.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <h2 className="text-2xl md:text-3xl font-bold text-primary whitespace-nowrap flex items-center gap-2">
          <Sparkles className="w-6 h-6" /> Show Aktif
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {shows.map((s, i) => <ActiveShowCard key={s.id} show={s} index={i} />)}
      </div>
    </section>
  );
}
