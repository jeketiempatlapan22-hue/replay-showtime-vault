import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import AdminLinkMaker from '@/components/admin/AdminLinkMaker';

type S = { id: string; title: string; is_live: boolean; show_date: string; show_time: string };

/** Monitor Live: menampilkan halaman live persis seperti penonton (player, sumber IDN/utama, chat, penonton). */
export default function LiveMonitorAdmin() {
  const [shows, setShows] = useState<S[]>([]);
  const [sel, setSel] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    supabase.from('active_shows').select('id,title,is_live,show_date,show_time').eq('is_active', true)
      .order('is_live', { ascending: false }).order('show_date', { ascending: false }).order('show_time', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as S[];
        setShows(list);
        if (list[0]) setSel((p) => p || list[0].id);
      });
  }, []);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
      <div className="flex gap-2 items-center">
        <select className="flex-1 h-10 rounded-md border border-input bg-background px-2 text-sm" value={sel} onChange={(e) => setSel(e.target.value)}>
          {shows.map((s) => <option key={s.id} value={s.id}>{s.is_live ? '🔴 LIVE • ' : ''}{s.title} ({s.show_date} {String(s.show_time).slice(0, 5)})</option>)}
        </select>
        <Button variant="outline" size="icon" onClick={() => setNonce((n) => n + 1)} aria-label="Muat ulang"><RefreshCw className="w-4 h-4" /></Button>
      </div>
      <p className="text-xs text-muted-foreground">Tampilan sama seperti penonton. Kamu bisa membalas, menyematkan, dan menghapus pesan chat sebagai Admin.</p>
      {sel ? (
        <iframe
          key={`${sel}-${nonce}`}
          src={`/live?show=${sel}&admin_monitor=1`}
          title="Monitor Live"
          className="w-full h-[85vh] min-h-[600px] rounded-lg border border-border bg-background"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      ) : <p className="text-sm text-muted-foreground">Belum ada show aktif.</p>}
      </section>
      <section className="space-y-3 border-t border-border pt-5">
        <div>
          <h2 className="font-semibold text-base">Buat Link</h2>
          <p className="text-xs text-muted-foreground">Buat link baru setelah memantau player, jumlah penonton, dan live chat.</p>
        </div>
        <AdminLinkMaker />
      </section>
    </div>
  );
}
