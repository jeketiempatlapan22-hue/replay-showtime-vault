import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Copy, Smartphone, ExternalLink, MessageCircle, AlertTriangle } from 'lucide-react';
import { setShowPurchase, setReplayPurchase } from '@/lib/purchases';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showId: string;
  showTitle: string;
  amount: number; // pakasir_amount in rupiah
  itemTitle: string; // e.g. "Show: Title" or "Replay: Title"
  replayId?: string | null;
  /** 'show' | 'replay' (tied to active show) | 'replay_only' (standalone replay card) */
  kind?: 'show' | 'replay' | 'replay_only';
}

type Status = 'form' | 'creating' | 'qr' | 'paid' | 'expired';

const EXPIRY_MS = 30 * 60 * 1000;

export default function BuyShowDialog({ open, onOpenChange, showId, showTitle, amount, itemTitle, replayId, kind = 'show' }: Props) {
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem('replaytime-phone') || ''; } catch { return ''; } });
  const [status, setStatus] = useState<Status>('form');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [qrString, setQrString] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [totalPayment, setTotalPayment] = useState<number>(0);
  const [pakasirOrderId, setPakasirOrderId] = useState<string>('');
  const [accessToken, setAccessToken] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [lastChecked, setLastChecked] = useState<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStatus('form');
      setOrderId(null);
      setQrUrl(''); setQrString(''); setQrDataUrl(''); setTotalPayment(0);
      setPakasirOrderId('');
      setAccessToken('');
      setCreatedAt(0);
      try { channelRef.current && supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
      channelRef.current = null;
    }
  }, [open]);

  // Tick clock for countdown
  useEffect(() => {
    if (status !== 'qr') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  // Auto-expire
  useEffect(() => {
    if (status !== 'qr' || !createdAt) return;
    if (now - createdAt > EXPIRY_MS) setStatus('expired');
  }, [now, createdAt, status]);

  // Persist purchase locally so user does not need to repurchase next visit.
  const persistPaid = (token: string) => {
    if (!token) return;
    if (kind === 'replay_only' && replayId) {
      setReplayPurchase(replayId, { token, paidAt: Date.now() });
    } else if (showId) {
      setShowPurchase(showId, { token, kind: kind === 'replay' ? 'replay' : 'show', paidAt: Date.now() });
    }
  };

  // Realtime subscribe to order status when QR shown
  useEffect(() => {
    if (status !== 'qr' || !orderId) return;
    const ch = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload: any) => {
        const row = payload?.new;
        if (row?.status === 'paid') {
          const tok = row.access_token || '';
          setAccessToken(tok);
          persistPaid(tok);
          setStatus('paid');
        }
      })
      .subscribe();
    channelRef.current = ch;
    // Also poll every 3s as fallback
    const poll = setInterval(async () => {
      const { data } = await supabase.from('orders').select('status, access_token').eq('id', orderId).maybeSingle();
      setLastChecked(Date.now());
      if (data?.status === 'paid') {
        const tok = (data as any).access_token || '';
        setAccessToken(tok);
        persistPaid(tok);
        setStatus('paid');
      }
    }, 3000);
    return () => {
      try { supabase.removeChannel(ch); } catch { /* ignore */ }
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, orderId]);

  const normalizePhone = (raw: string) => {
    const d = raw.replace(/\D/g, '');
    if (d.startsWith('62')) return d;
    if (d.startsWith('0')) return '62' + d.slice(1);
    if (d.startsWith('8')) return '62' + d;
    return d;
  };

  const handleCreate = async () => {
    const norm = normalizePhone(phone);
    if (!/^62\d{8,13}$/.test(norm)) {
      toast.error('Nomor WhatsApp tidak valid. Contoh: 0812xxxx');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Nominal pembayaran belum diatur. Hubungi admin.');
      return;
    }
    try { localStorage.setItem('replaytime-phone', phone); } catch { /* ignore */ }
    setStatus('creating');
    try {
      const { data, error } = await supabase.functions.invoke('create-pakasir-order', {
        body: {
          phone: norm,
          show_id: kind === 'replay_only' ? undefined : showId,
          replay_id: replayId || undefined,
          item_title: itemTitle,
          amount,
          kind,
        },
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error || 'Gagal membuat order');
      setOrderId(r.order_id);
      setPakasirOrderId(r.pakasir_order_id);
      setQrUrl(r.qr_url || '');
      setQrString(r.qr_string || '');
      setTotalPayment(Number(r.total_payment || amount));
      if (r.qr_string) {
        try {
          const dataUrl = await QRCode.toDataURL(r.qr_string, { width: 512, margin: 1, errorCorrectionLevel: 'M' });
          setQrDataUrl(dataUrl);
        } catch { /* ignore */ }
      }
      setCreatedAt(Date.now());
      setNow(Date.now());
      setStatus('qr');
    } catch (e: any) {
      toast.error(e?.message || 'Gagal membuat order. Coba lagi.');
      setStatus('form');
    }
  };

  const remaining = Math.max(0, EXPIRY_MS - (now - createdAt));
  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

  const copyToken = async () => {
    try { await navigator.clipboard.writeText(accessToken); toast.success('Token disalin'); } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{itemTitle}</DialogTitle>
          <DialogDescription className="line-clamp-2">{showTitle}</DialogDescription>
        </DialogHeader>

        {status === 'form' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
              <div className="text-xs text-muted-foreground">Total Pembayaran</div>
              <div className="text-2xl font-bold text-primary">Rp {amount.toLocaleString('id-ID')}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-buy">Nomor WhatsApp</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="phone-buy"
                  type="tel"
                  inputMode="numeric"
                  placeholder="0812xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">Token akses akan dikirim ke nomor ini setelah pembayaran lunas.</p>
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={!phone}>
              Lanjut ke Pembayaran
            </Button>
          </div>
        )}

        {status === 'creating' && (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Menyiapkan QRIS...</p>
          </div>
        )}

        {status === 'qr' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-4 text-center space-y-3">
              <div className="text-xs text-muted-foreground">Scan QRIS dengan e-wallet / m-banking</div>
              {qrDataUrl ? (
                <div className="mx-auto bg-white p-3 rounded-md inline-block">
                  <img src={qrDataUrl} alt="QRIS Pembayaran" width={260} height={260} className="block" />
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs text-muted-foreground">Membuat QR...</p>
                </div>
              )}
              <div className="text-base font-bold text-primary">
                Rp {(totalPayment || amount).toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-muted-foreground">Order ID: {pakasirOrderId}</div>
              {qrUrl && (
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Buka di halaman Pakasir
                </a>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">QRIS berlaku selama</span>
              <span className="font-mono font-semibold text-primary">{mm}:{ss}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="flex-1">Mengecek status pembayaran… otomatis berubah saat lunas.</span>
              {lastChecked > 0 && (
                <span className="font-mono text-[10px] opacity-70">
                  {new Date(lastChecked).toLocaleTimeString('id-ID', { hour12: false })}
                </span>
              )}
            </div>
          </div>
        )}

        {status === 'paid' && (
          <div className="space-y-3 py-2">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-base font-semibold text-foreground">Pembayaran Berhasil!</p>
              <p className="text-xs text-muted-foreground text-center">Token akses sudah dikirim via WhatsApp ke nomor Anda.</p>
            </div>
            {accessToken && (
              <div className="rounded-md border border-border bg-card p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Token Anda</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono break-all">{accessToken}</code>
                  <Button size="sm" variant="outline" onClick={copyToken}><Copy className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            )}
            <Button className="w-full" onClick={() => onOpenChange(false)}>Tutup</Button>
          </div>
        )}

        {status === 'expired' && (
          <div className="space-y-3 py-2 text-center">
            <p className="text-sm text-foreground">QRIS kadaluarsa. Silakan ulangi.</p>
            <Button className="w-full" onClick={() => setStatus('form')}>Buat Ulang</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
