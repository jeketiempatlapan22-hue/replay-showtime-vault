import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Search, Coins, ArrowUp, ArrowDown, History, Minus, RefreshCw } from 'lucide-react';
import { upsertActiveShow } from '@/lib/activeShows';

interface Pkg { id: string; label: string; coins: number; price_idr: number; sort_order: number; enabled: boolean; }
interface ShowRow { id: string; title: string; price_show_coins: number; price_replay_coins: number; }
interface ReplayRow { id: string; title: string; show_name: string; price_coins: number; }
interface UserRow { user_id: string; email: string; phone: string | null; balance: number; }
interface Tx { id: string; user_id: string; delta: number; reason: string; meta: any; created_at: string; related_show_id: string | null; related_replay_id: string | null; related_order_id: string | null; }

const REASON_LABEL: Record<string, string> = {
  topup: 'Top-up QRIS',
  purchase_show: 'Beli Show',
  purchase_replay: 'Beli Replay',
  admin_grant: 'Admin +',
  admin_revoke: 'Admin −',
};

export default function CoinAdmin() {
  // Packages
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [newPkg, setNewPkg] = useState({ label: '', coins: 0, price_idr: 0 });
  // Pricing
  const [shows, setShows] = useState<ShowRow[]>([]);
  const [replays, setReplays] = useState<ReplayRow[]>([]);
  // Users
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [grant, setGrant] = useState<Record<string, { amount: string; reason: string }>>({});
  const [searching, setSearching] = useState(false);
  // Detail modal
  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [detailTxs, setDetailTxs] = useState<Tx[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  // Global tx history
  const [txs, setTxs] = useState<Tx[]>([]);

  const loadAll = async () => {
    const [p, s, r, t] = await Promise.all([
      supabase.from('coin_packages').select('*').order('sort_order'),
      supabase.from('active_shows').select('id,title,price_show_coins,price_replay_coins').order('show_date', { ascending: false }),
      supabase.from('replays').select('id,title,show_name,price_coins').order('date', { ascending: false }).limit(100),
      supabase.from('coin_transactions').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    setPackages((p.data as any) || []);
    setShows((s.data as any) || []);
    setReplays((r.data as any) || []);
    setTxs((t.data as any) || []);
  };
  useEffect(() => { loadAll(); }, []);

  // -------- Packages --------
  const addPkg = async () => {
    if (!newPkg.label || newPkg.coins <= 0 || newPkg.price_idr <= 0) return toast.error('Lengkapi data paket');
    const { error } = await supabase.from('coin_packages').insert({ ...newPkg, sort_order: packages.length });
    if (error) return toast.error(error.message);
    setNewPkg({ label: '', coins: 0, price_idr: 0 });
    toast.success('Paket ditambahkan');
    loadAll();
  };
  const updatePkg = async (id: string, patch: Partial<Pkg>) => {
    const { error } = await supabase.from('coin_packages').update(patch).eq('id', id);
    if (error) return toast.error(error.message);
    loadAll();
  };
  const delPkg = async (id: string) => {
    if (!confirm('Hapus paket ini?')) return;
    await supabase.from('coin_packages').delete().eq('id', id);
    toast.success('Paket dihapus');
    loadAll();
  };
  const movePkg = async (id: string, dir: -1 | 1) => {
    const idx = packages.findIndex(p => p.id === id);
    const swap = packages[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from('coin_packages').update({ sort_order: swap.sort_order }).eq('id', id),
      supabase.from('coin_packages').update({ sort_order: packages[idx].sort_order }).eq('id', swap.id),
    ]);
    loadAll();
  };

  // -------- Pricing --------
  const updateShowCoins = async (id: string, patch: Partial<ShowRow>) => {
    try {
      await upsertActiveShow({ id, ...patch } as any);
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success('Harga koin disimpan');
    loadAll();
  };
  const updateReplayCoins = async (id: string, price_coins: number) => {
    const { error } = await supabase.from('replays').update({ price_coins }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Harga koin disimpan');
    loadAll();
  };

  // -------- Users --------
  const searchUsers = async () => {
    setSearching(true);
    try {
      const q = search.trim();
      let query = supabase.from('profiles').select('user_id,email,phone').limit(50);
      if (q) query = query.or(`email.ilike.%${q}%,phone.ilike.%${q}%`);
      else query = query.order('created_at', { ascending: false });
      const { data: profs, error } = await query;
      if (error) { toast.error(error.message); return; }
      const ids = (profs || []).map((p: any) => p.user_id);
      const { data: bals } = ids.length
        ? await supabase.from('coin_balances').select('user_id,balance').in('user_id', ids)
        : { data: [] as any[] };
      const bmap = Object.fromEntries((bals || []).map((b: any) => [b.user_id, b.balance]));
      setUsers((profs || []).map((p: any) => ({ ...p, balance: bmap[p.user_id] || 0 })));
    } finally { setSearching(false); }
  };

  const grantCoins = async (user_id: string, delta: number, reason?: string) => {
    if (!delta || isNaN(delta)) return toast.error('Masukkan jumlah koin');
    const { error } = await supabase.rpc('grant_coins', {
      _user_id: user_id,
      _delta: delta,
      _reason: delta > 0 ? 'admin_grant' : 'admin_revoke',
      _meta: reason ? { note: reason } : {},
      _order_id: null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success(`Saldo ${delta > 0 ? '+' : ''}${delta} koin`);
    setGrant(g => ({ ...g, [user_id]: { amount: '', reason: '' } }));
    searchUsers();
    if (detailUser?.user_id === user_id) openUserDetail({ ...detailUser, balance: detailUser.balance + delta });
    loadAll();
  };

  const openUserDetail = async (u: UserRow) => {
    setDetailUser(u);
    setDetailLoading(true);
    const { data } = await supabase.from('coin_transactions').select('*').eq('user_id', u.user_id).order('created_at', { ascending: false }).limit(100);
    setDetailTxs((data as any) || []);
    setDetailLoading(false);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="packages" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="packages"><Coins className="w-4 h-4 mr-1" />Paket</TabsTrigger>
          <TabsTrigger value="users">User</TabsTrigger>
          <TabsTrigger value="pricing">Harga</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 mr-1" />Riwayat</TabsTrigger>
        </TabsList>

        {/* PACKAGES */}
        <TabsContent value="packages" className="mt-3 space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Tambah Paket Koin</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div><Label>Label</Label><Input value={newPkg.label} onChange={e => setNewPkg({ ...newPkg, label: e.target.value })} placeholder="Mis. Paket Hemat" /></div>
                <div><Label>Koin</Label><Input type="number" value={newPkg.coins || ''} onChange={e => setNewPkg({ ...newPkg, coins: Number(e.target.value) })} /></div>
                <div><Label>Harga (Rp)</Label><Input type="number" value={newPkg.price_idr || ''} onChange={e => setNewPkg({ ...newPkg, price_idr: Number(e.target.value) })} /></div>
                <Button onClick={addPkg}><Plus className="w-4 h-4 mr-1" />Tambah</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Daftar Paket ({packages.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {packages.map((p, i) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 border border-border rounded-md p-2 bg-card/50">
                  <div className="flex flex-col gap-0.5">
                    <Button size="icon" variant="ghost" className="h-5 w-5" disabled={i === 0} onClick={() => movePkg(p.id, -1)}><ArrowUp className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" disabled={i === packages.length - 1} onClick={() => movePkg(p.id, 1)}><ArrowDown className="w-3 h-3" /></Button>
                  </div>
                  <Input className="w-32 sm:w-40" value={p.label} onChange={e => setPackages(packages.map(x => x.id === p.id ? { ...x, label: e.target.value } : x))} onBlur={e => updatePkg(p.id, { label: e.target.value })} />
                  <div className="flex items-center gap-1">
                    <Input className="w-20" type="number" value={p.coins} onChange={e => setPackages(packages.map(x => x.id === p.id ? { ...x, coins: Number(e.target.value) } : x))} onBlur={e => updatePkg(p.id, { coins: Number(e.target.value) })} />
                    <span className="text-xs text-muted-foreground">koin</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Rp</span>
                    <Input className="w-28" type="number" value={p.price_idr} onChange={e => setPackages(packages.map(x => x.id === p.id ? { ...x, price_idr: Number(e.target.value) } : x))} onBlur={e => updatePkg(p.id, { price_idr: Number(e.target.value) })} />
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Switch checked={p.enabled} onCheckedChange={v => updatePkg(p.id, { enabled: v })} />
                    <span className="text-xs text-muted-foreground">{p.enabled ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => delPkg(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              ))}
              {packages.length === 0 && <p className="text-xs text-muted-foreground">Belum ada paket. Tambahkan di atas.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* USERS */}
        <TabsContent value="users" className="mt-3 space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Cari User</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Email atau nomor HP (kosongkan untuk semua)" onKeyDown={e => e.key === 'Enter' && searchUsers()} />
                <Button onClick={searchUsers} disabled={searching}>
                  {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              <div className="space-y-2">
                {users.map(u => {
                  const g = grant[u.user_id] || { amount: '', reason: '' };
                  const amt = Number(g.amount || 0);
                  return (
                    <div key={u.user_id} className="border border-border rounded-md p-3 bg-card/50 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-[180px]">
                          <div className="font-medium text-sm">{u.email}</div>
                          <div className="text-xs text-muted-foreground">{u.phone || 'No HP belum diisi'}</div>
                        </div>
                        <Badge variant="secondary" className="font-mono"><Coins className="w-3 h-3 mr-1 text-primary" />{u.balance}</Badge>
                        <Button size="sm" variant="outline" onClick={() => openUserDetail(u)}><History className="w-3.5 h-3.5 mr-1" />Detail</Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
                        <Input className="w-24" type="number" placeholder="Jumlah" value={g.amount} onChange={e => setGrant(s => ({ ...s, [u.user_id]: { ...g, amount: e.target.value } }))} />
                        <Input className="flex-1 min-w-[120px]" placeholder="Catatan (opsional)" value={g.reason} onChange={e => setGrant(s => ({ ...s, [u.user_id]: { ...g, reason: e.target.value } }))} />
                        <Button size="sm" variant="default" disabled={!amt} onClick={() => grantCoins(u.user_id, Math.abs(amt), g.reason)}><Plus className="w-3.5 h-3.5 mr-1" />Tambah</Button>
                        <Button size="sm" variant="destructive" disabled={!amt} onClick={() => grantCoins(u.user_id, -Math.abs(amt), g.reason)}><Minus className="w-3.5 h-3.5 mr-1" />Kurangi</Button>
                      </div>
                    </div>
                  );
                })}
                {users.length === 0 && <p className="text-xs text-muted-foreground">Klik cari (kosong) untuk lihat user terbaru, atau ketik email/HP.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRICING */}
        <TabsContent value="pricing" className="mt-3 space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Harga Koin – Show Aktif</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-auto">
              {shows.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 border border-border rounded-md p-2 text-sm">
                  <div className="flex-1 min-w-[140px] truncate font-medium">{s.title}</div>
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
            <CardHeader><CardTitle className="text-base">Harga Koin – Replay (100 terbaru)</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-auto">
              {replays.map(r => (
                <div key={r.id} className="flex items-center gap-2 border border-border rounded-md p-2 text-sm">
                  <div className="flex-1 min-w-0 truncate">{r.show_name} — {r.title}</div>
                  <Input className="w-20" type="number" defaultValue={r.price_coins} onBlur={e => updateReplayCoins(r.id, Number(e.target.value))} />
                  <span className="text-xs text-muted-foreground">koin</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history" className="mt-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Riwayat Transaksi (100)</CardTitle>
              <Button size="sm" variant="ghost" onClick={loadAll}><RefreshCw className="w-3.5 h-3.5" /></Button>
            </CardHeader>
            <CardContent className="space-y-1 max-h-[600px] overflow-auto text-xs">
              {txs.map(t => (
                <div key={t.id} className="flex items-center gap-2 border-b border-border/50 py-1.5">
                  <span className="text-muted-foreground w-32 shrink-0">{new Date(t.created_at).toLocaleString('id-ID')}</span>
                  <span className={`font-semibold w-14 text-right ${t.delta > 0 ? 'text-green-500' : 'text-destructive'}`}>{t.delta > 0 ? '+' : ''}{t.delta}</span>
                  <Badge variant="outline" className="text-[10px]">{REASON_LABEL[t.reason] || t.reason}</Badge>
                  <span className="font-mono text-[10px] text-muted-foreground truncate">{t.user_id?.slice(0, 8)}</span>
                </div>
              ))}
              {txs.length === 0 && <p className="text-muted-foreground">Belum ada transaksi.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User detail modal */}
      <Dialog open={!!detailUser} onOpenChange={o => !o && setDetailUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Detail User</DialogTitle></DialogHeader>
          {detailUser && (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 bg-card/50 space-y-1">
                <div className="font-medium">{detailUser.email}</div>
                <div className="text-sm text-muted-foreground">{detailUser.phone || 'No HP belum diisi'}</div>
                <div className="text-sm pt-1">Saldo: <span className="font-mono font-semibold text-primary">{detailUser.balance} koin</span></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input className="w-24" type="number" placeholder="Jumlah" id="detail-amt" />
                <Input className="flex-1 min-w-[120px]" placeholder="Catatan" id="detail-reason" />
                <Button size="sm" onClick={() => {
                  const amt = Math.abs(Number((document.getElementById('detail-amt') as HTMLInputElement)?.value || 0));
                  const reason = (document.getElementById('detail-reason') as HTMLInputElement)?.value || '';
                  if (amt) grantCoins(detailUser.user_id, amt, reason);
                }}><Plus className="w-3.5 h-3.5 mr-1" />Tambah</Button>
                <Button size="sm" variant="destructive" onClick={() => {
                  const amt = Math.abs(Number((document.getElementById('detail-amt') as HTMLInputElement)?.value || 0));
                  const reason = (document.getElementById('detail-reason') as HTMLInputElement)?.value || '';
                  if (amt) grantCoins(detailUser.user_id, -amt, reason);
                }}><Minus className="w-3.5 h-3.5 mr-1" />Kurangi</Button>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Riwayat Transaksi</div>
                <div className="max-h-80 overflow-auto space-y-1 text-xs border border-border rounded-md p-2">
                  {detailLoading && <p className="text-muted-foreground">Memuat...</p>}
                  {!detailLoading && detailTxs.length === 0 && <p className="text-muted-foreground">Belum ada transaksi.</p>}
                  {detailTxs.map(t => (
                    <div key={t.id} className="flex items-center gap-2 border-b border-border/40 py-1">
                      <span className="text-muted-foreground w-32 shrink-0">{new Date(t.created_at).toLocaleString('id-ID')}</span>
                      <span className={`font-semibold w-14 text-right ${t.delta > 0 ? 'text-green-500' : 'text-destructive'}`}>{t.delta > 0 ? '+' : ''}{t.delta}</span>
                      <Badge variant="outline" className="text-[10px]">{REASON_LABEL[t.reason] || t.reason}</Badge>
                      {t.meta?.note && <span className="text-muted-foreground truncate italic">"{t.meta.note}"</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
