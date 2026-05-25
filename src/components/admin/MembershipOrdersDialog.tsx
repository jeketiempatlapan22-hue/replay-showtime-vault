import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, ListOrdered, Copy, Check, Edit2, X, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Order {
  id: string;
  email: string;
  phone: string;
  kind: 'qris' | 'coins';
  amount: number;
  coin_amount: number;
  status: 'reserved' | 'paid' | 'expired' | 'cancelled';
  created_at: string;
  paid_at: string | null;
  reserved_until: string;
  membership_token_id: string | null;
}

const statusBadge = (s: Order['status']) => ({
  paid: 'bg-green-500/15 text-green-600 border-green-500/30',
  reserved: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  expired: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
}[s]);

const copyText = async (text: string, label: string) => {
  try { await navigator.clipboard.writeText(text); toast.success(`${label} disalin`); }
  catch { toast.error('Gagal menyalin'); }
};

const normalizePhone = (raw: string) => {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
};

export default function MembershipOrdersDialog({
  open, onOpenChange, packageId, packageName,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; packageId: string; packageName: string;
}) {
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'paid' | 'reserved'>('paid');
  const [editing, setEditing] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const load = async () => {
    if (!packageId) return;
    setLoading(true);
    const { data } = await supabase
      .from('membership_orders')
      .select('id,email,phone,kind,amount,coin_amount,status,created_at,paid_at,reserved_until,membership_token_id')
      .eq('package_id', packageId)
      .order('created_at', { ascending: false })
      .limit(500);
    setRows((data || []) as Order[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    void load();
    const ch = supabase
      .channel(`admin-membership-orders-${packageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_orders', filter: `package_id=eq.${packageId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, packageId]);

  const filtered = rows.filter((r) => filter === 'all' ? true : r.status === filter);
  const stats = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  const startEdit = (r: Order) => { setEditing(r.id); setEditEmail(r.email); setEditPhone(r.phone); };
  const saveEdit = async (id: string) => {
    const e = editEmail.trim().toLowerCase();
    const p = normalizePhone(editPhone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { toast.error('Email tidak valid'); return; }
    if (!/^62\d{8,13}$/.test(p)) { toast.error('Nomor WA tidak valid (format 62...)'); return; }
    const { error } = await supabase.from('membership_orders').update({ email: e, phone: p }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Data user diperbarui');
    setEditing(null);
    void load();
  };

  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [bulkSending, setBulkSending] = useState(false);
  const resendOne = async (id: string, force = false) => {
    setSending((p) => ({ ...p, [id]: true }));
    const { data, error } = await supabase.functions.invoke('resend-membership-wa', {
      body: { order_id: id, force, filter: { scope: 'single', filter, force } },
    });
    setSending((p) => ({ ...p, [id]: false }));
    if (error) { toast.error(error.message); return; }
    const r = (data as any)?.results?.[0];
    if (r?.sent) toast.success(`WA terkirim ke ${r.phone || ''}`);
    else if (r?.skipped === 'already_delivered') toast.info('Sudah pernah terkirim. Shift+klik untuk paksa kirim ulang.');
    else if (r?.skipped) toast.warning(`Dilewati: ${r.skipped}`);
    else toast.error(`Gagal: ${r?.error || 'unknown'}`);
    void load();
  };
  const resendBulk = async (force = false) => {
    const targets = filtered.map((r) => r.id);
    if (targets.length === 0) { toast.error('Tidak ada order pada filter ini'); return; }
    const label = force ? 'PAKSA kirim ulang' : 'Kirim ulang';
    if (!confirm(`${label} WA untuk ${targets.length} order pada filter "${filter}"?`)) return;
    setBulkSending(true);
    const { data, error } = await supabase.functions.invoke('resend-membership-wa', {
      body: { order_ids: targets, force, filter: { scope: 'bulk', filter, force, count: targets.length } },
    });
    setBulkSending(false);
    if (error) { toast.error(error.message); return; }
    const d = data as any;
    toast.success(`Bulk: ${d?.sent || 0}/${d?.total || 0} terkirim · ${d?.skipped || 0} dilewati · ${d?.failed || 0} gagal`);
    void load();
  };

  const copyAllEmails = () => {
    const list = filtered.map((r) => r.email).filter(Boolean).join('\n');
    if (!list) return toast.error('Kosong');
    void copyText(list, `${filtered.length} email`);
  };
  const copyAllPhones = () => {
    const list = filtered.map((r) => r.phone).filter(Boolean).join('\n');
    if (!list) return toast.error('Kosong');
    void copyText(list, `${filtered.length} nomor`);
  };
  const exportCsv = () => {
    const head = 'email,phone,status,kind,amount,coin_amount,created_at,paid_at\n';
    const body = filtered.map((r) =>
      [r.email, r.phone, r.status, r.kind, r.amount, r.coin_amount, r.created_at, r.paid_at || ''].map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([head + body], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `membership-${packageName.replace(/\s+/g, '_')}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="w-4 h-4 text-primary" /> Pesanan & User — {packageName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={filter === 'paid' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setFilter('paid')}>Paid: {stats.paid || 0}</Badge>
          <Badge variant={filter === 'reserved' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setFilter('reserved')}>Reserved: {stats.reserved || 0}</Badge>
          <Badge variant={filter === 'all' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setFilter('all')}>Semua: {rows.length}</Badge>
          <div className="ml-auto flex gap-1 flex-wrap">
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => resendBulk(false)} disabled={bulkSending}>
              {bulkSending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
              Kirim Ulang Semua ({filtered.length})
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resendBulk(true)} disabled={bulkSending} title="Paksa kirim ulang meski sudah terkirim">
              Paksa Kirim
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copyAllPhones}><Copy className="w-3 h-3 mr-1" />Salin Nomor</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copyAllEmails}><Copy className="w-3 h-3 mr-1" />Salin Email</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportCsv}>CSV</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={load}><RefreshCw className="w-3 h-3" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Belum ada pesanan.</p>
        ) : (
          <div className="space-y-1.5 text-xs">
            {filtered.map((r) => (
              <div key={r.id} className="border border-border rounded-md p-2 space-y-1.5">
                {editing === r.id ? (
                  <div className="space-y-1.5">
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email" className="h-8 text-xs" />
                    <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="62812..." className="h-8 text-xs" />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" className="h-7" onClick={() => saveEdit(r.id)}><Check className="w-3 h-3 mr-1" />Simpan</Button>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(null)}><X className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium truncate">{r.email}</span>
                        <button title="Salin email" onClick={() => copyText(r.email, 'Email')}><Copy className="w-3 h-3 text-muted-foreground hover:text-primary" /></button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-muted-foreground font-mono text-[11px]">
                        <span>{r.phone}</span>
                        <button title="Salin nomor" onClick={() => copyText(r.phone, 'Nomor')}><Copy className="w-3 h-3 hover:text-primary" /></button>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(r.created_at).toLocaleString('id-ID')}
                        {r.paid_at ? ` · paid ${new Date(r.paid_at).toLocaleString('id-ID')}` : ''}
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <Badge className={statusBadge(r.status)} variant="outline">{r.status.toUpperCase()}</Badge>
                      <div className="text-[11px] font-mono">
                        {r.kind === 'qris' ? `Rp ${(r.amount || 0).toLocaleString('id-ID')}` : `${r.coin_amount} koin`}
                      </div>
                      {r.membership_token_id && <div className="text-[10px] text-green-600">✓ token aktif</div>}
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="h-6 px-2" onClick={(e) => resendOne(r.id, e.shiftKey)} disabled={!!sending[r.id]} title="Kirim ulang WA. Shift+klik = paksa kirim meski sudah terkirim">
                          {sending[r.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => startEdit(r)}><Edit2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
