import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Coins, Plus, Minus, KeyRound, RefreshCw, User as UserIcon, Mail, Phone } from 'lucide-react';

interface UserRow {
  user_id: string;
  email: string;
  phone: string | null;
  username: string | null;
  balance: number;
}

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [grant, setGrant] = useState<Record<string, { amount: string; reason: string }>>({});
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const q = search.trim();
      let query = supabase.from('profiles').select('user_id,email,phone,username').limit(100);
      if (q) query = query.or(`email.ilike.%${q}%,phone.ilike.%${q}%,username.ilike.%${q}%`);
      else query = query.order('created_at', { ascending: false });
      const { data: profs, error } = await query;
      if (error) { toast.error(error.message); return; }
      const ids = (profs || []).map((p: any) => p.user_id);
      const { data: bals } = ids.length
        ? await supabase.from('coin_balances').select('user_id,balance').in('user_id', ids)
        : { data: [] as any[] };
      const bmap = Object.fromEntries((bals || []).map((b: any) => [b.user_id, b.balance]));
      setUsers((profs || []).map((p: any) => ({ ...p, balance: bmap[p.user_id] || 0 })));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const grantCoins = async (u: UserRow, delta: number, reason?: string) => {
    if (!delta || isNaN(delta)) return toast.error('Masukkan jumlah koin');
    const { error } = await supabase.rpc('grant_coins', {
      _user_id: u.user_id,
      _delta: delta,
      _reason: delta > 0 ? 'admin_grant' : 'admin_revoke',
      _meta: reason ? { note: reason } : {},
      _order_id: null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success(`Saldo ${delta > 0 ? '+' : ''}${delta} koin untuk ${u.email}`);
    setGrant(g => ({ ...g, [u.user_id]: { amount: '', reason: '' } }));
    setUsers(us => us.map(x => x.user_id === u.user_id ? { ...x, balance: x.balance + delta } : x));
  };

  const submitNewPw = async () => {
    if (!pwUser) return;
    if (!newPw || newPw.length < 6) return toast.error('Password minimal 6 karakter');
    setPwSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
        body: { user_id: pwUser.user_id, password: newPw },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.message || (data as any)?.error || error?.message || 'Gagal mengubah sandi');
        return;
      }
      toast.success(`Sandi ${pwUser.email} berhasil diubah`);
      setPwUser(null);
      setNewPw('');
    } finally { setPwSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><UserIcon className="w-4 h-4" />Manajemen User</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari username, email, atau nomor HP…"
              onKeyDown={e => e.key === 'Enter' && load()}
            />
            <Button onClick={load} disabled={loading}>
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          <div className="space-y-2">
            {users.map(u => {
              const g = grant[u.user_id] || { amount: '', reason: '' };
              const amt = Number(g.amount || 0);
              return (
                <div key={u.user_id} className="border border-border rounded-lg p-3 bg-card/50 space-y-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-[200px] space-y-0.5">
                      <div className="flex items-center gap-1.5 font-medium text-sm">
                        <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        {u.username || <span className="italic text-muted-foreground">Tanpa username</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" />{u.email}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />{u.phone || '—'}
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      <Coins className="w-3 h-3 mr-1 text-primary" />{u.balance}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => { setPwUser(u); setNewPw(''); }}>
                      <KeyRound className="w-3.5 h-3.5 mr-1" />Sandi
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                    <Input
                      className="w-24"
                      type="number"
                      placeholder="Jumlah"
                      value={g.amount}
                      onChange={e => setGrant(s => ({ ...s, [u.user_id]: { ...g, amount: e.target.value } }))}
                    />
                    <Input
                      className="flex-1 min-w-[120px]"
                      placeholder="Catatan (opsional)"
                      value={g.reason}
                      onChange={e => setGrant(s => ({ ...s, [u.user_id]: { ...g, reason: e.target.value } }))}
                    />
                    <Button size="sm" disabled={!amt} onClick={() => grantCoins(u, Math.abs(amt), g.reason)}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Tambah
                    </Button>
                    <Button size="sm" variant="destructive" disabled={!amt} onClick={() => grantCoins(u, -Math.abs(amt), g.reason)}>
                      <Minus className="w-3.5 h-3.5 mr-1" />Kurangi
                    </Button>
                  </div>
                </div>
              );
            })}
            {users.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-6">Tidak ada user ditemukan.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!pwUser} onOpenChange={o => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ganti Sandi User</DialogTitle></DialogHeader>
          {pwUser && (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 bg-card/50 text-sm">
                <div className="font-medium">{pwUser.username || pwUser.email}</div>
                <div className="text-xs text-muted-foreground">{pwUser.email}</div>
                {pwUser.phone && <div className="text-xs text-muted-foreground">{pwUser.phone}</div>}
              </div>
              <div>
                <Label>Sandi baru (min. 6 karakter)</Label>
                <Input
                  type="text"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="Sandi baru"
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwUser(null)} disabled={pwSaving}>Batal</Button>
            <Button onClick={submitNewPw} disabled={pwSaving || newPw.length < 6}>
              {pwSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
