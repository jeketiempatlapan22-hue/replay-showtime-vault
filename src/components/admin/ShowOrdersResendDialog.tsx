import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Send, Copy, UserPlus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Order {
  id: string;
  user_phone: string;
  item_title: string;
  status: string;
  kind: string;
  amount: number;
  coin_amount: number;
  created_at: string;
  paid_at: string | null;
  token_sent_at: string | null;
  access_token: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  showId: string;
  showTitle: string;
}

export default function ShowOrdersResendDialog({ open, onOpenChange, showId, showTitle }: Props) {
  const [rows, setRows] = useState<Order[]>([]);
  const [waStatus, setWaStatus] = useState<Record<string, 'sent' | 'failed' | 'none'>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [bulkSending, setBulkSending] = useState(false);
  const [filter, setFilter] = useState<'failed' | 'paid' | 'pending' | 'all'>('failed');
  const [search, setSearch] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualSending, setManualSending] = useState(false);

  const stringifyError = (value: unknown) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };

  const isFonnteTimeout = (value: unknown) => /timed out|TimeoutError|abort/i.test(stringifyError(value));
  const normalizeWa = (raw: string) => {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('0')) return '62' + d.slice(1);
    if (d.startsWith('62')) return d;
    if (d.startsWith('8')) return '62' + d;
    return d;
  };
  const isValidWa = (value: string) => /^628\d{8,11}$/.test(normalizeWa(value));

  const load = async () => {
    if (!showId) return;
    setLoading(true);
    // Limit ke 200 order terbaru agar dialog cepat dibuka.
    const ordersP = supabase
      .from('orders')
      .select('id,user_phone,item_title,status,kind,amount,coin_amount,created_at,paid_at,token_sent_at,access_token')
      .eq('show_id', showId)
      .order('created_at', { ascending: false })
      .limit(200);
    const { data } = await ordersP;
    const list = (data || []) as Order[];
    setRows(list);
    const ids = list.map((r) => r.id);
    const map: Record<string, 'sent' | 'failed' | 'none'> = {};
    if (ids.length) {
      const { data: outbox } = await supabase
        .from('wa_outbox')
        .select('related_order_id,status')
        .in('related_order_id', ids)
        .order('created_at', { ascending: false })
        .limit(1000);
      (outbox || []).forEach((o: any) => {
        if (!o.related_order_id) return;
        if (!map[o.related_order_id]) map[o.related_order_id] = o.status === 'sent' ? 'sent' : 'failed';
      });
    }
    list.forEach((r) => { if (!map[r.id]) map[r.id] = 'none'; });
    setWaStatus(map);
    setLoading(false);
  };

  const deleteLog = async (id: string) => {
    if (!confirm('Hapus log WA untuk order ini?')) return;
    const { data, error } = await supabase.rpc('admin_delete_wa_outbox_for_orders', { _order_ids: [id] });
    if (error) { toast({ title: 'Gagal hapus log', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Log dihapus (${data || 0})` });
    setWaStatus((p) => ({ ...p, [id]: 'none' }));
  };

  const deleteLogBulk = async (scope: 'filtered' | 'all') => {
    if (scope === 'all') {
      if (!confirm(`Hapus SEMUA log WA untuk show "${showTitle}"?`)) return;
      const { data, error } = await supabase.rpc('admin_delete_wa_outbox_for_show', { _show_id: showId });
      if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
      toast({ title: `Hapus log: ${data || 0}` });
      void load();
      return;
    }
    const ids = filtered.map((r) => r.id);
    if (!ids.length) { toast({ title: 'Tidak ada order pada filter ini', variant: 'destructive' }); return; }
    if (!confirm(`Hapus log WA untuk ${ids.length} order pada filter ini?`)) return;
    const { data, error } = await supabase.rpc('admin_delete_wa_outbox_for_orders', { _order_ids: ids });
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Hapus log: ${data || 0}` });
    void load();
  };

  useEffect(() => { if (open) void load(); /* eslint-disable-next-line */ }, [open, showId]);

  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const filtered = rows.filter((r) => {
    const w = waStatus[r.id] || 'none';
    let pass = false;
    if (filter === 'all') pass = true;
    else if (filter === 'pending') pass = r.status !== 'paid';
    else if (filter === 'paid') pass = r.status === 'paid';
    else if (filter === 'failed') {
      // Gagal/Belum: paid tapi WA gagal/belum, ATAU pending (admin bisa paksa kirim).
      if (r.status === 'paid') pass = w !== 'sent';
      else pass = r.kind !== 'coin_topup';
    }
    if (!pass) return false;
    if (!q) return true;
    const phoneDigits = (r.user_phone || '').replace(/\D/g, '');
    return (
      (r.user_phone || '').toLowerCase().includes(q) ||
      (qDigits && phoneDigits.includes(qDigits)) ||
      (r.item_title || '').toLowerCase().includes(q)
    );
  });

  const resendOne = async (id: string, shiftForce = false) => {
    const row = rows.find((r) => r.id === id);
    if (row && row.kind === 'coin_topup' && row.status !== 'paid') {
      toast({ title: 'Top-up koin butuh pembayaran nyata', variant: 'destructive' });
      return;
    }
    // Untuk order belum lunas, admin wajib konfirmasi paksa kirim.
    if (row && row.status !== 'paid') {
      if (!confirm(`Order ini BELUM LUNAS.\nTetap PAKSA kirim token ke ${row.user_phone}?`)) return;
    }
    // Auto-force untuk order belum lunas atau saat Shift+klik.
    const force = shiftForce || (row?.status !== 'paid');
    let phoneOverride = '';
    if (row && !isValidWa(row.user_phone)) {
      const input = prompt(`Nomor WA order ini tidak valid untuk Fonnte: ${row.user_phone}\n\nMasukkan nomor WhatsApp yang benar (contoh 0812xxxx / 62812xxxx):`);
      if (!input) return;
      const norm = normalizeWa(input);
      if (!/^628\d{8,11}$/.test(norm)) {
        toast({ title: 'Nomor WA masih tidak valid', description: 'Gunakan nomor Indonesia aktif, contoh 62812xxxx.', variant: 'destructive' });
        return;
      }
      phoneOverride = norm;
    }
    setSending((p) => ({ ...p, [id]: true }));
    const { data, error } = await supabase.functions.invoke('resend-show-wa', { body: { order_id: id, force, phone_override: phoneOverride || undefined } });
    setSending((p) => ({ ...p, [id]: false }));
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    const r = (data as any)?.results?.[0];
    if (r?.sent) toast({ title: `WA terkirim ke ${r.phone || ''}` });
    else if (r?.skipped === 'already_sent') toast({ title: 'Sudah terkirim sebelumnya', description: 'Shift+klik untuk paksa kirim ulang.' });
    else if (r?.skipped === 'topup_needs_payment') toast({ title: 'Top-up koin butuh pembayaran nyata', variant: 'destructive' });
    else if (r?.skipped) toast({ title: `Dilewati: ${r.skipped}`, variant: 'destructive' });
    else if (isFonnteTimeout(r?.error)) toast({ title: 'WhatsApp lambat merespons', description: 'Token sudah dibuat. Coba kirim ulang beberapa detik lagi bila belum masuk.', variant: 'default' });
    else toast({ title: 'Gagal kirim', description: stringifyError(r?.error) || 'unknown', variant: 'destructive' });
    void load();
  };

  const resendBulk = async (force = false) => {
    const targets = filtered.map((r) => r.id);
    if (!targets.length) { toast({ title: 'Tidak ada order pada filter ini', variant: 'destructive' }); return; }
    if (!confirm(`${force ? 'PAKSA kirim ulang' : 'Kirim ulang'} WA untuk ${targets.length} order?`)) return;
    setBulkSending(true);
    const { data, error } = await supabase.functions.invoke('resend-show-wa', { body: { order_ids: targets, force } });
    setBulkSending(false);
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    const d = data as any;
    toast({ title: `Bulk: ${d?.sent || 0}/${d?.total || 0} terkirim`, description: `${d?.skipped || 0} dilewati · ${d?.failed || 0} gagal` });
    void load();
  };

  const copyPhone = async (p: string) => {
    try { await navigator.clipboard.writeText(p); toast({ title: 'Nomor disalin' }); } catch { /* ignore */ }
  };

  const counts = rows.reduce((acc, r) => {
    if (r.status !== 'paid') { if (r.kind !== 'coin_topup') acc.pending++; return acc; }
    const w = waStatus[r.id] || 'none';
    if (w === 'sent') acc.sent++; else acc.failed++;
    return acc;
  }, { sent: 0, failed: 0, pending: 0 });

  const sendManual = async () => {
    const phoneDigits = manualPhone.replace(/\D/g, '').replace(/^0/, '62');
    if (!/^628[0-9]{8,11}$/.test(phoneDigits)) {
      toast({ title: 'Nomor tidak valid', description: 'Format: 628xxxxxxxxx', variant: 'destructive' });
      return;
    }
    setManualSending(true);
    const { data, error } = await supabase.functions.invoke('resend-show-wa', {
      body: { manual_send: true, show_id: showId, phone: phoneDigits },
    });
    setManualSending(false);
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    const d = data as any;
    if (d?.sent) {
      toast({ title: `Token baru terkirim ke ${d.phone}` });
      setManualPhone('');
      void load();
    } else {
      const errStr = stringifyError(d?.error || '');
      const isTimeout = isFonnteTimeout(errStr);
      toast({
        title: isTimeout ? 'WhatsApp lambat merespons' : 'Gagal kirim',
        description: isTimeout
          ? 'Token sudah dibuat. Pesan kemungkinan tetap terkirim — cek HP user / coba lagi beberapa detik.'
          : (errStr || 'unknown'),
        variant: isTimeout ? 'default' : 'destructive',
      });
      if (isTimeout) { setManualPhone(''); void load(); }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resend WhatsApp · Pembelian</DialogTitle>
          <DialogDescription className="truncate">{showTitle}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border p-2 bg-muted/30 space-y-1.5">
          <div className="text-[11px] font-semibold flex items-center gap-1">
            <UserPlus className="w-3 h-3" /> Kirim token baru ke nomor (tanpa order)
          </div>
          <div className="flex gap-1.5">
            <Input
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              placeholder="628xxxxxxxxx"
              inputMode="tel"
              className="h-8 text-xs flex-1"
              disabled={manualSending}
            />
            <Button size="sm" className="h-8 text-xs" onClick={sendManual} disabled={manualSending || !manualPhone}>
              {manualSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
              Kirim
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Token baru (1 perangkat) + info replay & sandi akan dikirim via WA.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={filter === 'failed' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setFilter('failed')}>
            Gagal/Belum: {counts.failed + counts.pending}
          </Badge>
          <Badge variant={filter === 'pending' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setFilter('pending')}>
            Pending/Batal: {counts.pending}
          </Badge>
          <Badge variant={filter === 'paid' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setFilter('paid')}>
            Paid: {counts.sent + counts.failed}
          </Badge>
          <Badge variant={filter === 'all' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setFilter('all')}>
            Semua: {rows.length}
          </Badge>
          <div className="ml-auto flex gap-1 flex-wrap">
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => resendBulk(false)} disabled={bulkSending}>
              {bulkSending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
              Kirim Ulang ({filtered.length})
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resendBulk(true)} disabled={bulkSending} title="Paksa kirim ulang — termasuk order yang belum lunas (admin only)">
              Paksa Kirim
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => deleteLogBulk('filtered')} title="Hapus log WA untuk order di filter">
              <Trash2 className="w-3 h-3 mr-1" /> Hapus Log
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteLogBulk('all')} title="Hapus SEMUA log WA untuk show ini">
              <Trash2 className="w-3 h-3 mr-1" /> Semua
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={load}><RefreshCw className="w-3 h-3" /></Button>
          </div>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor WA atau judul order…"
          className="h-8 text-xs"
        />

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Tidak ada pesanan.</p>
        ) : (
          <div className="space-y-1.5 text-xs">
            {filtered.map((r) => {
              const w = waStatus[r.id] || 'none';
              const wBadge = w === 'sent'
                ? 'bg-green-500/15 text-green-600 border-green-500/30'
                : w === 'failed'
                  ? 'bg-destructive/15 text-destructive border-destructive/30'
                  : 'bg-muted text-muted-foreground';
              const wLabel = w === 'sent' ? 'WA TERKIRIM' : w === 'failed' ? 'WA GAGAL' : 'BELUM DIKIRIM';
              const phoneInvalid = !isValidWa(r.user_phone);
              return (
                <div key={r.id} className="border border-border rounded-md p-2 flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{r.user_phone}</span>
                      <button title="Salin nomor" onClick={() => copyPhone(r.user_phone)}><Copy className="w-3 h-3 text-muted-foreground hover:text-primary" /></button>
                      {phoneInvalid && <Badge variant="destructive" className="text-[10px]">NOMOR TIDAK VALID</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{r.item_title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString('id-ID')}
                      {r.paid_at ? ` · paid ${new Date(r.paid_at).toLocaleString('id-ID')}` : ''}
                    </div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <Badge variant="outline" className="text-[10px]">{r.status.toUpperCase()}</Badge>
                    <div><Badge className={`text-[10px] ${wBadge}`} variant="outline">{wLabel}</Badge></div>
                    <div className="text-[11px] font-mono">
                      {r.kind === 'coin_topup' ? `${r.coin_amount} koin` : `Rp ${(r.amount || 0).toLocaleString('id-ID')}`}
                    </div>
                    <Button
                      size="sm" variant={r.status === 'paid' ? 'outline' : 'destructive'} className="h-7 mt-1"
                      onClick={(e) => resendOne(r.id, e.shiftKey)}
                      disabled={!!sending[r.id] || r.kind === 'coin_topup'}
                      title={r.status === 'paid'
                        ? 'Kirim ulang WA. Shift+klik = paksa kirim meski sudah terkirim'
                        : 'PAKSA kirim token meski belum lunas (admin only)'}
                    >
                      {sending[r.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" />Kirim</>}
                    </Button>
                    {w !== 'none' && (
                      <Button size="sm" variant="ghost" className="h-7 mt-1 text-destructive ml-1" title="Hapus log WA untuk order ini" onClick={() => deleteLog(r.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
