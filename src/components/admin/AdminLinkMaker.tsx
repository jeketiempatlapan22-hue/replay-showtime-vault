import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Copy, Gift, Link2 } from 'lucide-react';
import { getShowBundle, type ShowBundle } from '@/lib/bundle';
import { copyToClipboard } from '@/lib/clipboard';
import { Textarea } from '@/components/ui/textarea';

type Item = { id: string; title: string; sub: string };
type Result = { title: string; link: string; message: string; password?: string };

export default function AdminLinkMaker() {
  const [shows, setShows] = useState<Item[]>([]);
  const [replays, setReplays] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [bundle, setBundle] = useState<ShowBundle | null>(null);

  useEffect(() => {
    void getShowBundle().then(setBundle);
    supabase.from('active_shows').select('id,title,show_date,show_time').eq('is_active', true)
      .order('show_date', { ascending: false }).then(({ data }) =>
        setShows((data ?? []).map((s) => ({ id: s.id, title: s.title, sub: `${s.show_date} ${String(s.show_time).slice(0, 5)}` }))));
    supabase.from('replays').select('id,title,date').order('date', { ascending: false }).limit(300).then(({ data }) =>
      setReplays((data ?? []).map((r) => ({ id: r.id, title: r.title, sub: r.date }))));
  }, []);

  const create = async (kind: string, target_id?: string, days?: number) => {
    const key = `${kind}-${target_id || days}`;
    setBusy(key);
    const { data, error } = await supabase.functions.invoke('admin-create-link', { body: { kind, target_id, days, label } });
    setBusy(null);
    if (error || !data?.ok) { toast({ title: 'Gagal membuat link', description: data?.error || error?.message, variant: 'destructive' }); return; }
    setResults((r) => [{ title: data.title, link: data.link, message: data.message, password: data.password }, ...r]);
    const copied = await copyToClipboard(data.message || data.link);
    toast({ title: copied ? 'Link baru dibuat & pesan disalin' : 'Link baru dibuat', description: copied ? undefined : 'Pesan lengkap tersedia di bawah untuk disalin manual.' });
  };

  const copy = async (t: string) => {
    const copied = await copyToClipboard(t);
    toast({ title: copied ? 'Disalin' : 'Tidak bisa menyalin otomatis', description: copied ? undefined : 'Pilih dan salin pesan lengkap di bawah.', variant: copied ? 'default' : 'destructive' });
  };
  const f = (list: Item[]) => list.filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()));

  const Row = ({ it, kind }: { it: Item; kind: string }) => (
    <div className="flex items-center justify-between gap-2 border border-border rounded-md p-2">
      <div className="flex-1 min-w-0"><p className="text-sm font-medium break-words">{it.title}</p><p className="text-xs text-muted-foreground">{it.sub}</p></div>
      <Button className="shrink-0" size="sm" disabled={!!busy} onClick={() => create(kind, it.id)}><Link2 className="w-4 h-4 mr-1" />{busy === `${kind}-${it.id}` ? '...' : 'Buat'}</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Cari show / replay..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Input placeholder="Label / nama pembeli (opsional)" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">Setiap klik selalu membuat token baru. Token lama tidak pernah disalin.</p>

      {results.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Link yang baru dibuat</h3>
          {results.map((r, i) => (
            <div key={i} className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-1">
              <p className="text-sm font-medium">{r.title}{r.password ? ` • Sandi ${r.password}` : ''}</p>
              <p className="text-xs break-all text-muted-foreground">{r.link}</p>
              <Textarea readOnly aria-label={`Pesan token ${r.title}`} value={r.message || r.link} className="min-h-48 text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(r.link)}><Copy className="w-3 h-3 mr-1" />Link</Button>
                <Button size="sm" variant="outline" onClick={() => copy(r.message)}><Copy className="w-3 h-3 mr-1" />Pesan</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="font-semibold">Membership</h3>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!busy} onClick={() => create('membership', undefined, 31)}>Membership 1 Bulan (31 hari)</Button>
          <Button disabled={!!busy} onClick={() => create('membership', undefined, 62)}>Membership 2 Bulan (62 hari)</Button>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Bundel Show</h3>
        {bundle?.is_active && bundle.show_count > 0 ? (
          <Button disabled={!!busy} onClick={() => create('bundle', bundle.id)}><Gift className="w-4 h-4 mr-1" />{busy === `bundle-${bundle.id}` ? '...' : `Buat Link ${bundle.name} (${bundle.show_count} show)`}</Button>
        ) : <p className="text-xs text-muted-foreground">Bundel belum aktif. Aktifkan di menu Bundel Show.</p>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Show</h3>
        <div className="grid gap-2 sm:grid-cols-2">{f(shows).map((it) => <Row key={it.id} it={it} kind="show" />)}</div>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Replay</h3>
        <div className="grid gap-2 sm:grid-cols-2 max-h-[60vh] overflow-auto">{f(replays).map((it) => <Row key={it.id} it={it} kind="replay" />)}</div>
      </section>
    </div>
  );
}
