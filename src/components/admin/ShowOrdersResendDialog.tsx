import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Send, Copy } from 'lucide-react';
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
  const [filter, setFilter] = useState<'failed' | 'paid' | 'all'>('failed');

  const load = async () => {
    if (!showId) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('id,user_phone,item_title,status,kind,amount,coin_amount,created_at,paid_at,token_sent_at,access_token')
      .eq('show_id', showId)
      .order('created_at', { ascending: false })
      .limit(500);
    const list = (data || []) as Order[];
    setRows(list);
    const ids = list.map((r) => r.id);
    const map: Record<string, 'sent' | 'failed' | 'none'> = {};
    if (ids.length) {
      const { data: outbox } = await supabase
        .from('wa_outbox')
        .select('related_order_id,status,created_at')
        .in('related_order_id', ids)
        .order('created_at', { ascending: false });
      (outbox || []).forEach((o: any) => {
        if (!o.related_order_id) return;
        if (!map[o.related_order_id]) map[o.related_order_id] = o.status === 'sent' ? 'sent' : 'failed';
      });
    }
    list.forEach((r) => { if (!map[r.id]) map[r.id] = 'none'; });
    setWaStatus(map);
    setLoading(false);
  };

  useEffect(() => { if (open) void load(); /* eslint-disable-next-line */ }, [open, showId]);

  const filtered = rows.filter((r) => {
    if (r.status !== 'paid') return filter === 'all';
    const w = waStatus[r.id] || 'none';
    if (filter === 'failed') return w !== 'sent';
    if (filter === 'paid') return true;
    return true;
  });

  const resendOne = async (id: string, force = false) => {
    setSending((p) => ({ ...p, [id]: true }));
    const { data, error } = await supabase.functions.invoke('resend-show-wa', { body: { order_id: id, force } });
    setSending((p) => ({ ...p, [id]: false }));
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    const r = (data as any)?.results?.[0];
    if (r?.sent) toast({ title: `WA terkirim ke ${r.phone || ''}` });
    else if (r?.skipped === 'already_sent') toast({ title: 'Sudah terkirim sebelumnya', description: 'Shift+klik untuk paksa kirim ulang.' });
    else if (r?.skipped) toast({ title: `Dilewati: ${r.skipped}`, variant: 'destructive' });
    else toast({ title: 'Gagal kirim', description: r?.error || 'unknown', variant: 'destructive' });
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
    if (r.status !== 'paid') return acc;
    const w = waStatus[r.id] || 'none';
    if (w === 'sent') acc.sent++; else acc.failed++;
    return acc;
  }, { sent: 0, failed: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resend WhatsApp · Pembelian</DialogTitle>
          <DialogDescription className="truncate">{showTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={filter === 'failed' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setFilter('failed')}>
            Gagal/Belum: {counts.failed}
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
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resendBulk(true)} disabled={bulkSending} title="Paksa kirim meski sudah terkirim">
              Paksa Kirim
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={load}><RefreshCw className="w-3 h-3" /></Button>
          </div>
        </div>

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
              return (
                <div key={r.id} className="border border-border rounded-md p-2 flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{r.user_phone}</span>
                      <button title="Salin nomor" onClick={() => copyPhone(r.user_phone)}><Copy className="w-3 h-3 text-muted-foreground hover:text-primary" /></button>
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
                      size="sm" variant="outline" className="h-7 mt-1"
                      onClick={(e) => resendOne(r.id, e.shiftKey)}
                      disabled={!!sending[r.id] || r.status !== 'paid'}
                      title="Kirim ulang WA. Shift+klik = paksa kirim meski sudah terkirim"
                    >
                      {sending[r.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" />Kirim</>}
                    </Button>
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
