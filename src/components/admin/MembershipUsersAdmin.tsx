import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Copy, Edit2, Trash2, RotateCcw, Search, RefreshCw, Link2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type Row = {
  order_id: string; user_id: string | null; email: string; phone: string; kind: string;
  amount: number; coin_amount: number; paid_at: string | null; created_at: string;
  package_id: string | null; package_name: string;
  token_id: string | null; token: string; password: string;
  starts_at: string | null; expires_at: string | null; duration_days: number | null;
  max_devices: number; includes_replays: boolean; revoked: boolean;
  devices_used: number; days_remaining: number | null; status: string;
};

const SITE = (typeof window !== 'undefined' ? window.location.origin : 'https://realtime48stream.my.id');

export default function MembershipUsersAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all'|'active'|'expired'|'revoked'>('all');
  const [edit, setEdit] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; phone: string; expires_at: string; max_devices: number; includes_replays: boolean; revoked: boolean }>({ email: '', phone: '', expires_at: '', max_devices: 1, includes_replays: true, revoked: false });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_membership_users', { _q: q, _status: status });
    setLoading(false);
    if (error) { toast({ title: 'Gagal memuat', description: error.message, variant: 'destructive' }); return; }
    setRows((data || []) as any);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${label} disalin` }); }
    catch { toast({ title: 'Gagal menyalin', variant: 'destructive' }); }
  };

  const linkFor = (r: Row) => r.token ? `${SITE}/live?mtoken=${encodeURIComponent(r.token)}` : '';

  const openEdit = (r: Row) => {
    setEdit(r);
    setEditForm({
      email: r.email || '',
      phone: r.phone || '',
      expires_at: r.expires_at ? new Date(r.expires_at).toISOString().slice(0,16) : '',
      max_devices: r.max_devices || 1,
      includes_replays: r.includes_replays,
      revoked: r.revoked,
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    const { error } = await supabase.rpc('admin_update_membership_user', {
      _order_id: edit.order_id,
      _email: editForm.email || null,
      _phone: editForm.phone || null,
      _expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null,
      _max_devices: editForm.max_devices,
      _includes_replays: editForm.includes_replays,
      _revoked: editForm.revoked,
    });
    if (error) { toast({ title: 'Gagal menyimpan', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Tersimpan' });
    setEdit(null);
    load();
  };

  const resetDevices = async (r: Row) => {
    if (!r.token_id) return;
    const { error } = await supabase.rpc('admin_reset_token_devices', { _kind: 'membership', _token_id: r.token_id });
    if (error) return toast({ title: 'Gagal reset', description: error.message, variant: 'destructive' });
    toast({ title: 'Device direset', description: 'Kuota kembali ke 0.' });
    load();
  };

  const remove = async (r: Row) => {
    const { error } = await supabase.rpc('admin_delete_membership_user', { _order_id: r.order_id });
    if (error) return toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    toast({ title: 'User membership dihapus' });
    load();
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter(r =>
      r.email?.toLowerCase().includes(s) ||
      r.phone?.toLowerCase().includes(s) ||
      r.token?.toLowerCase().includes(s) ||
      r.package_name?.toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans text-base sm:text-lg flex items-center justify-between gap-2">
          <span>User Membership ({filtered.length})</span>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading?'animate-spin':''}`} />Muat</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cari email / phone / token / paket" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key==='Enter' && load()} className="pl-8" />
          </div>
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="expired">Kadaluarsa</SelectItem>
              <SelectItem value="revoked">Dicabut</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.order_id} className="border border-border rounded-lg p-3 bg-card/50">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.email || '(no email)'}</span>
                    <Badge variant={r.status==='active'?'default':r.status==='expired'?'secondary':'destructive'}>{r.status}</Badge>
                    <Badge variant="outline">{r.kind}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div>📱 {r.phone || '-'} · 📦 {r.package_name || '-'}</div>
                    <div>🕒 Dibeli: {r.paid_at ? new Date(r.paid_at).toLocaleString('id-ID') : '-'}</div>
                    <div>⏳ Berakhir: {r.expires_at ? new Date(r.expires_at).toLocaleString('id-ID') : '-'} {r.days_remaining!=null && r.days_remaining >= 0 && ` (${r.days_remaining}h lagi)`}</div>
                    <div>📲 Device: {r.devices_used}/{r.max_devices}</div>
                    {r.token && (<div className="font-mono text-foreground/80 break-all">🔑 {r.token}</div>)}
                    {r.password && (<div className="font-mono text-foreground/80">🔒 {r.password}</div>)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 mt-2">
                {r.token && <Button size="sm" variant="outline" onClick={() => copy(r.token, 'Token')}><Copy className="w-3.5 h-3.5 mr-1" />Token</Button>}
                {r.password && <Button size="sm" variant="outline" onClick={() => copy(r.password, 'Sandi')}><Copy className="w-3.5 h-3.5 mr-1" />Sandi</Button>}
                {r.token && <Button size="sm" variant="outline" onClick={() => copy(linkFor(r), 'Link')}><Link2 className="w-3.5 h-3.5 mr-1" />Link</Button>}
                <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
                {r.token_id && <Button size="sm" variant="outline" onClick={() => resetDevices(r)}><RotateCcw className="w-3.5 h-3.5 mr-1" />Reset</Button>}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive"><Trash2 className="w-3.5 h-3.5 mr-1" />Hapus</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Hapus user membership ini?</AlertDialogTitle>
                      <AlertDialogDescription>Order dan token akan dihapus permanen. Aksi ini tidak bisa dibatalkan.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(r)}>Hapus</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
          {!filtered.length && !loading && <div className="text-center text-sm text-muted-foreground py-8">Tidak ada data.</div>}
        </div>
      </CardContent>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User Membership</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Phone (628xxx)</Label><Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Berakhir</Label><Input type="datetime-local" value={editForm.expires_at} onChange={e => setEditForm(f => ({ ...f, expires_at: e.target.value }))} /></div>
            <div><Label>Max Device</Label><Input type="number" min={1} value={editForm.max_devices} onChange={e => setEditForm(f => ({ ...f, max_devices: parseInt(e.target.value)||1 }))} /></div>
            <div className="flex items-center justify-between"><Label>Termasuk replay</Label><Switch checked={editForm.includes_replays} onCheckedChange={(v) => setEditForm(f => ({ ...f, includes_replays: v }))} /></div>
            <div className="flex items-center justify-between"><Label>Dicabut (revoked)</Label><Switch checked={editForm.revoked} onCheckedChange={(v) => setEditForm(f => ({ ...f, revoked: v }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Batal</Button>
            <Button onClick={saveEdit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
