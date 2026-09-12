import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Tv, MonitorSmartphone, Copy, Check, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';
import { readUnlockPayload } from '@/lib/tvSession';
import { siteLink } from '@/lib/siteOrigin';

type Platform = 'android' | 'ios' | 'desktop';

const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
};

const MIRROR_STEPS: Record<Platform, { title: string; steps: string[]; note: string }> = {
  android: {
    title: 'Android — Siarkan layar (Screen Cast)',
    steps: [
      'Pastikan HP dan TV tersambung ke WiFi yang sama.',
      'Tarik panel notifikasi dari atas layar, lalu geser sekali lagi agar semua tombol terlihat.',
      'Ketuk tombol "Siarkan layar" / "Smart View" / "Cast".',
      'Pilih nama TV atau perangkat Chromecast Anda dari daftar.',
      'Kembali ke halaman ini, lalu tekan tombol layar penuh pada pemutar.',
    ],
    note: 'Biarkan layar HP tetap menyala selama menonton. Atur volume lewat remote TV.',
  },
  ios: {
    title: 'iPhone / iPad — Screen Mirroring (AirPlay)',
    steps: [
      'Pastikan iPhone dan TV (Apple TV / TV dengan AirPlay) di WiFi yang sama.',
      'Buka Pusat Kontrol: geser dari sudut kanan atas layar.',
      'Ketuk "Screen Mirroring" / "Duplikat Layar".',
      'Pilih nama TV Anda, masukkan kode yang muncul di TV jika diminta.',
      'Kembali ke halaman ini, lalu tekan tombol layar penuh pada pemutar.',
    ],
    note: 'Gunakan Screen Mirroring, bukan tombol AirPlay video, agar siaran pasti tampil.',
  },
  desktop: {
    title: 'Laptop / PC — Kirim tab ke TV',
    steps: [
      'Gunakan Google Chrome atau Microsoft Edge di jaringan WiFi yang sama dengan TV.',
      'Klik menu titik tiga di kanan atas, pilih "Cast" / "Transmisikan".',
      'Klik "Sumber" lalu pilih "Cast tab" (atau "Cast desktop" untuk seluruh layar).',
      'Pilih nama TV / Chromecast Anda.',
      'Kembali ke halaman ini dan tekan tombol layar penuh pada pemutar.',
    ],
    note: 'Bisa juga sambungkan kabel HDMI dari laptop ke TV/proyektor.',
  },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: 'code' | 'mirror';
  showId?: string;
}

export default function TvConnectDialog({ open, onOpenChange, initialTab = 'code', showId = '' }: Props) {
  const [tab, setTab] = useState<'code' | 'mirror'>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  const tvUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return siteLink('/tv').replace(/^https?:\/\//, '');
  }, []);

  useEffect(() => { setPlatform(detectPlatform()); }, []);

  useEffect(() => {
    if (!open || !expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, expiresAt]);

  const createCode = useCallback(async () => {
    setLoading(true); setError(''); setCode('');
    try {
      const payload = readUnlockPayload(showId);
      if (!payload || typeof payload.grant !== 'string' || !payload.grant) {
        setError('Akses belum terbuka di perangkat ini. Buka siarannya dulu, lalu coba lagi.');
        setLoading(false);
        return;
      }
      const { data, error: fnErr } = await supabase.functions.invoke('tv-pair', {
        body: { action: 'create', payload, show_id: showId, browser_id: getBrowserId() },
      });
      if (fnErr || !data?.ok || !data?.code) {
        setError('Gagal membuat kode. Coba lagi sebentar.');
      } else {
        setCode(String(data.code));
        setExpiresAt(new Date(data.expires_at).getTime());
        setNow(Date.now());
      }
    } catch {
      setError('Gagal membuat kode. Coba lagi sebentar.');
    }
    setLoading(false);
  }, [showId]);

  useEffect(() => {
    if (open && tab === 'code' && !code && !loading && !error) void createCode();
  }, [open, tab, code, loading, error, createCode]);

  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(siteLink('/tv'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  const guide = MIRROR_STEPS[platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tv className="w-4 h-4 text-primary" />
            Tonton di TV / Proyektor
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pilih cara yang paling cocok dengan TV Anda.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setTab('code')}
            className={`rounded-md px-2 py-2 transition-colors ${tab === 'code' ? 'bg-background text-foreground shadow' : 'text-muted-foreground'}`}
          >
            Kode untuk TV
          </button>
          <button
            type="button"
            onClick={() => setTab('mirror')}
            className={`rounded-md px-2 py-2 transition-colors ${tab === 'mirror' ? 'bg-background text-foreground shadow' : 'text-muted-foreground'}`}
          >
            Siarkan layar HP
          </button>
        </div>

        {tab === 'code' ? (
          <div className="space-y-3">
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
              <li>Buka browser di TV (Smart TV, Android TV, atau Fire Stick).</li>
              <li>Ketik alamat: <span className="font-semibold text-foreground">{tvUrl}</span></li>
              <li>Masukkan kode di bawah ini pada layar TV.</li>
            </ol>

            <div className="rounded-xl border border-border bg-card/70 p-4 text-center">
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
              ) : error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : (
                <>
                  <div className="text-3xl font-bold tracking-[0.35em] text-foreground">{code || '------'}</div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {remaining > 0 ? `Berlaku ${mm}:${ss} lagi` : 'Kode kedaluwarsa, buat baru.'}
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => { setError(''); void createCode(); }} disabled={loading}>
                <RefreshCw className="w-3.5 h-3.5" /> Buat kode baru
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={copyUrl}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Salin alamat TV
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              TV tidak dihitung sebagai perangkat baru, jadi token Anda tidak perlu direset. Kode hanya bisa dipakai sekali dan hangus dalam 10 menit.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1 text-[11px]">
              {(['android', 'ios', 'desktop'] as Platform[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`flex-1 rounded-md border px-2 py-1.5 transition-colors ${platform === p ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
                >
                  {p === 'android' ? 'Android' : p === 'ios' ? 'iPhone' : 'Laptop'}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card/70 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <MonitorSmartphone className="w-4 h-4 text-primary" />
                {guide.title}
              </div>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
                {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <p className="text-[10px] text-muted-foreground border-t border-border pt-2">{guide.note}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
