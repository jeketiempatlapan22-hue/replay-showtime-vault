import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, KeyRound, LogIn, Trash2, User, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AccessInfoCard from '@/components/AccessInfoCard';
import { getAllReplayPurchases, getAllShowPurchases } from '@/lib/purchases';
import { clearGuestAccount, type GuestAccount } from '@/lib/guest';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Item {
  key: string;
  kind: 'show' | 'replay';
  id: string;
  token: string;
  title: string;
  dateLabel: string;
  paidAt: number;
}

export default function GuestProfile({ guest }: { guest: GuestAccount }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const shows = getAllShowPurchases();
    const replays = getAllReplayPurchases();
    const showIds = Object.keys(shows);
    const replayIds = Object.keys(replays);

    const [showRows, replayRows] = await Promise.all([
      showIds.length
        ? supabase.from('active_shows').select('id,title,show_date,show_time').in('id', showIds)
        : Promise.resolve({ data: [] as any[] }),
      replayIds.length
        ? supabase.from('replays').select('id,title,date,show_name').in('id', replayIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const showMap = new Map(((showRows as any).data || []).map((r: any) => [r.id, r]));
    const replayMap = new Map(((replayRows as any).data || []).map((r: any) => [r.id, r]));

    const fmt = (d?: string) => {
      if (!d) return '';
      try {
        return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      } catch { return d; }
    };

    const list: Item[] = [];
    for (const id of showIds) {
      const p = shows[id];
      if (!p?.token) continue;
      const row: any = showMap.get(id);
      list.push({
        key: `s-${id}`,
        kind: 'show',
        id,
        token: p.token,
        title: row?.title || 'Show',
        dateLabel: fmt(row?.show_date),
        paidAt: p.paidAt || 0,
      });
    }
    for (const id of replayIds) {
      const p = replays[id];
      if (!p?.token) continue;
      const row: any = replayMap.get(id);
      list.push({
        key: `r-${id}`,
        kind: 'replay',
        id,
        token: p.token,
        title: row?.title || row?.show_name || 'Replay',
        dateLabel: fmt(row?.date),
        paidAt: p.paidAt || 0,
      });
    }
    list.sort((a, b) => b.paidAt - a.paidAt);
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onUpdate = () => void load();
    window.addEventListener('replaytime-purchases-updated', onUpdate);
    window.addEventListener('focus', onUpdate);
    return () => {
      window.removeEventListener('replaytime-purchases-updated', onUpdate);
      window.removeEventListener('focus', onUpdate);
    };
  }, [load]);

  const handleRemoveGuest = () => {
    clearGuestAccount();
    toast.success('Akun guest dihapus dari perangkat ini');
    navigate('/', { replace: true });
  };

  return (
    <main className="container mx-auto px-3 sm:px-4 py-6 max-w-lg space-y-4">
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Kamu memakai Akun Guest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Akun guest <span className="font-mono font-semibold text-foreground">{guest.name}</span> hanya
            tersimpan di browser perangkat ini. Riwayat pembelian, link akses, dan sandi replay akan
            <span className="font-semibold text-amber-600"> hilang permanen </span>
            kalau kamu menghapus data browser, ganti perangkat, atau memakai mode penyamaran.
            Daftar dengan email, nomor HP, dan kata sandi supaya semua pembelian tersimpan aman dan bisa
            dibuka di perangkat mana pun.
          </p>
          <Button className="w-full" onClick={() => navigate('/auth?redirect=/profil')}>
            <LogIn className="w-4 h-4 mr-2" /> Daftar / Masuk Sekarang
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4" /> Identitas Guest
          </CardTitle>
          <Badge variant="secondary" className="font-mono text-[10px]">{guest.name}</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Dibuat {new Date(guest.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} · ID {guest.id.slice(0, 12)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-4 h-4 text-primary" /> Riwayat Pembelian Saya
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void load()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-2">Memuat...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              Belum ada pembelian di perangkat ini. Setelah pembayaran terkonfirmasi, link + sandi replay muncul di sini.
            </p>
          ) : (
            items.map((it) => (
              <div key={it.key} className="rounded-lg border border-border p-3 space-y-2 bg-card/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm leading-tight">{it.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {it.dateLabel || (it.paidAt ? new Date(it.paidAt).toLocaleDateString('id-ID') : '')}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {it.kind === 'show' ? 'Show' : 'Replay'}
                  </Badge>
                </div>
                <AccessInfoCard
                  token={it.token}
                  showId={it.kind === 'show' ? it.id : undefined}
                  replayId={it.kind === 'replay' ? it.id : undefined}
                  compact
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button variant="destructive" className="w-full" onClick={handleRemoveGuest}>
        <Trash2 className="w-4 h-4 mr-2" /> Hapus Akun Guest dari Perangkat Ini
      </Button>
    </main>
  );
}
