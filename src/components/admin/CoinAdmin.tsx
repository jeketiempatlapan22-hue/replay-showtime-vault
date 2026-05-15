import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Search, Coins, Save } from 'lucide-react';

interface Pkg { id: string; label: string; coins: number; price_idr: number; sort_order: number; enabled: boolean; }
interface ShowRow { id: string; title: string; price_show_coins: number; price_replay_coins: number; }
interface ReplayRow { id: string; title: string; show_name: string; price_coins: number; }
interface UserRow { user_id: string; email: string; phone: string | null; balance: number; }

export default function CoinAdmin() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [newPkg, setNewPkg] = useState({ label: '', coins: 0, price_idr: 0 });
  const [shows, setShows] = useState<ShowRow[]>([]);
  const [replays, setReplays] = useState<ReplayRow[]>([]);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [grant, setGrant] = useState<Record<string, string>>({});
  const [txs, setTxs] = useState<any[]>([]);

  const loadAll = async () => {
    const [p, s, r, t] = await Promise.all([
      supabase.from('coin_packages').select('*').order('sort_order'),
      supabase.from('active_shows').select('id,title,price_show_coins,price_replay_coins').order('show_date', { ascending: false }),
      supabase.from('replays').select('id,title,show_name,price_coins').order('date', { ascending: false }).limit(100),
      supabase.from('coin_transactions').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setPackages((p.data as any) || []);
    setShows((s.data as any) || []);
    setReplays((r.data as any) || []);
    setTxs(t.data || []);
  };
  useEffect(() => { loadAll(); }, []);

  const addPkg = async () => {
    if (!newPkg.label || newPkg.coins <= 0 || newPkg.price_idr <= 0) return toast.error('Lengkapi data paket');
    const { error } = await supabase.from('coin_packages').insert({ ...newPkg, sort_order: packages.length });
    if (error) return toast.error(error.message);
    setNewPkg({ label: '', coins: 0, price_idr: 0 });
    loadAll();
  };
  const updatePkg = async (id: string, patch: Partial<Pkg>) => {
    const { error } = await supabase.from('coin_packages').update(patch).eq('id', id);
    if (error) return toast.error(error.message);
    loadAll();
  };
  const delPkg = async (id: string) => {
    if (!confirm('Hapus paket?')) return;
    await supabase.from('coin_packages').delete().eq('id', id);
    loadAll();
  };

  const updateShowCoins = async (id: string, patch: Partial<ShowRow>) => {
    const { error } = await supabase.from('active_shows').update(patch).eq('id', id);
    if (error) return toast.error(error.message); else toast.success('Harga koin disimpan');
    loadAll();
  };
  const updateReplayCoins = async (id: string, price_coins: number) => {
    const { error } = await supabase.from('replays').update({ price_coins }).eq('id', id);
    if (error) return toast.error(error.message); else toast.success('Harga koin disimpan');
    loadAll();
  };

  const searchUsers = async () => {
    const q = search.trim();
    if (!q) return;
    let query = supabase.from('profiles').select('user_id,email,phone');
    query = query.or(`email.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data: profs } = await query.limit(20);
    if (!profs) return;
    const ids = profs.map(p => p.user_id);
    const { data: bals } = await supabase.from('coin_balances').select('user_id,balance').in('user_id', ids);
    const bmap = Object.fromEntries((bals || []).map((b: any) => [b.user_id, b.balance]));
    setUsers(profs.map((p: any) => ({ ...p, balance: bmap[p.user_id] || 0 })));
  };

  const grantCoins = async (user_id: string, delta: number) => {
    if (!delta) return;
    const { error } = await supabase.rpc('grant_coins', { _user_id: user_id, _delta: delta, _reason: delta > 0 ? 'admin_grant' : 'admin_revoke', _meta: {}, _order_id: null } as any);
    if (error) return toast.error(error.message);
    toast.success('Saldo diperbarui');
    setGrant(g => ({ ...g, [user_id]: '' }));
    searchUsers();
    loadAll();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Coins className="w-4 h-4" /> Paket Koin (Top-up)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            <div><Label>Label</Label><Input value={newPkg.label} onChange={e => setNewPkg({ ...newPkg, label: e.target.value })} placeholder="Mis. 10 Koin" /></div>
            <div><Label>Koin</Label><Input type="number" value={newPkg.coins || ''} onChange={e => setNewPkg({ ...newPkg, coins: Number(e.target.value) })} /></div>
            <div><Label>Harga (Rp)</Label><Input type="number" value={newPkg.price_idr || ''} onChange={e => setNewPkg({ ...newPkg, price_idr: Number(e.target.value) })} /></div>
            <Button onClick={addPkg}><Plus className="w-4 h-4 mr-1" /> Tambah</Button>
          </div>
          <div className="space-y-2">
            {packages.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 border border-border rounded-md p-2">
                <Input className="w-32" value={p.label} onChange={e => setPackages(packages.map(x => x.id === p.id ? { ...x, label: e.target.value } : x))} onBlur={e => updatePkg(p.id, { label: e.target.value })} />
                <Input className="w-20" type="number" value={p.coins} onChange={e => setPackages(packages.map(x => x.id === p.id ? { ...x, coins: Number(e.target.value) } : x))} onBlur={e => updatePkg(p.id, { coins: Number(e.target.value) })} />
                <span className="text-xs text-muted-foreground">koin =</span>
                <Input className="w-28" type="number" value={p.price_idr} onChange={e => setPackages(packages.map(x => x.id === p.id ? { ...x, price_idr: Number(e.target.value) } : x))} onBlur={e => updatePkg(p.id, { price_idr: Number(e.target.value) })} />
                <Switch checked={p.enabled} onCheckedChange={v => updatePkg(p.id, { enabled: v })} />
                <Button size="sm" variant="ghost" onClick={() => delPkg(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            ))}
            {packages.length === 0 && <p className="text-xs text-muted-foreground">Belum ada paket.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Saldo Koin User</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari email atau nomor HP" onKeyDown={e => e.key === 'Enter' && searchUsers()} />
            <Button onClick={searchUsers}><Search className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.user_id} className="flex flex-wrap items-center gap-2 border border-border rounded-md p-2 text-sm">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.phone || '—'}</div>
                </div>
                <div className="font-mono text-primary">{u.balance} koin</div>
                <Input className="w-24" type="number" placeholder="±koin" value={grant[u.user_id] || ''} onChange={e => setGrant(g => ({ ...g, [u.user_id]: e.target.value }))} />
                <Button size="sm" onClick={() => grantCoins(u.user_id, Number(grant[u.user_id] || 0))}>Apply</Button>
              </div>
            ))}
            {users.length === 0 && <p className="text-xs text-muted-foreground">Cari user untuk mengelola saldo.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Harga Koin – Streaming Show</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {shows.map(s => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 border border-border rounded-md p-2 text-sm">
              <div className="flex-1 min-w-[140px] truncate">{s.title}</div>
              <Label className="text-xs">Show</Label>
              <Input className="w-20" type="number" defaultValue={s.price_show_coins} onBlur={e => updateShowCoins(s.id, { price_show_coins: Number(e.target.value) })} />
              <Label className="text-xs">Replay</Label>
              <Input className="w-20" type="number" defaultValue={s.price_replay_coins} onBlur={e => updateShowCoins(s.id, { price_replay_coins: Number(e.target.value) })} />
            </div>
          ))}
          {shows.length === 0 && <p className="text-xs text-muted-foreground">Tidak ada show.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Harga Koin – Replay (50 terbaru)</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-96 overflow-auto">
          {replays.slice(0, 50).map(r => (
            <div key={r.id} className="flex items-center gap-2 border border-border rounded-md p-2 text-sm">
              <div className="flex-1 min-w-0 truncate">{r.show_name} — {r.title}</div>
              <Input className="w-20" type="number" defaultValue={r.price_coins} onBlur={e => updateReplayCoins(r.id, Number(e.target.value))} />
              <span className="text-xs text-muted-foreground">koin</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat Transaksi Koin (50)</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-80 overflow-auto text-xs">
          {txs.map((t: any) => (
            <div key={t.id} className="flex items-center gap-2 border-b border-border/50 py-1">
              <span className="text-muted-foreground">{new Date(t.created_at).toLocaleString('id-ID')}</span>
              <span className={t.delta > 0 ? 'text-green-500 font-semibold' : 'text-destructive font-semibold'}>{t.delta > 0 ? '+' : ''}{t.delta}</span>
              <span className="text-muted-foreground">{t.reason}</span>
              <span className="font-mono text-[10px] truncate">{t.user_id?.slice(0, 8)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
