import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Gift, RefreshCw, Link as LinkIcon, Timer, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { getDeviceFingerprint } from '@/lib/fingerprint';
import FreeScreenWatermark from '@/components/FreeScreenWatermark';
import { useViewerCount } from '@/hooks/useViewerCount';

const SETTING_KEYS = [
  'free_watermark_enabled',
  'free_watermark_text',
  'free_watermark_opacity',
  'free_watermark_size',
  'free_link_enabled',
  'free_link_url',
  'free_link_label',
  'free_duration_minutes',
  'free_started_at',
];

interface FreeConfig {
  wmEnabled: boolean;
  wmText: string;
  wmOpacity: number;
  wmSize: number;
  linkEnabled: boolean;
  linkUrl: string;
  linkLabel: string;
  durationMin: number;
  startedAt: string;
}

const DEFAULT_CONFIG: FreeConfig = {
  wmEnabled: false,
  wmText: '',
  wmOpacity: 25,
  wmSize: 12,
  linkEnabled: false,
  linkUrl: '',
  linkLabel: 'Join Saluran',
  durationMin: 0,
  startedAt: '',
};

const HlsPlayer = lazy(() => import('@/components/HlsPlayer'));
const LiveChat = lazy(() => import('@/components/LiveChat'));

interface FreeToken {
  title: string;
  xShowId: string;
  freeEndsAt?: string | null;
  showId?: string;
  xTokenId: string;
  xSecKey: string;
  xApiToken: string;
  playbackUrl: string;
  expiresAt: string;
  error?: string;
}

const REASONS: Record<string, string> = {
  free_off: 'Siaran gratis sedang tidak tersedia. Coba lagi nanti atau beli akses show.',
  free_show_mismatch: 'Show ini tidak termasuk siaran gratis saat ini.',
  belum_live: 'Siaran gratis belum dimulai. Halaman ini akan otomatis tersedia saat live dimulai.',
  idn_belum_diatur: 'Siaran gratis belum dikonfigurasi admin.',
  blocked: 'Perangkat kamu diblokir.',
  fingerprint_required: 'Perangkat tidak dikenali. Muat ulang halaman.',
  free_ended: 'Waktu siaran gratis sudah habis. Terima kasih sudah menonton!',
};

// Rotasi kredensial tiap 28 menit (token gratis berlaku 30 menit) agar tayangan tidak terputus.
const ROTATE_MS = 60 * 1000; // aturan HANABIRA48: rotasi kunci tiap 60 detik

function PlayerFallback() {
  return (
    <div className="aspect-video w-full rounded-2xl bg-card/80 border border-border flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}

interface FreeSession {
  url: string;
  headers: Record<string, string>;
  title: string;
}

export default function Free() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const showId = search.get('show') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState<FreeSession | null>(null);
  const [rotating, setRotating] = useState(false);
  const [config, setConfig] = useState<FreeConfig>(DEFAULT_CONFIG);
  const [activeShowId, setActiveShowId] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const nonceRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const fetchToken = useCallback(async (): Promise<FreeSession> => {
    const fingerprint = await getDeviceFingerprint();
    const { data, error: fnErr } = await supabase.functions.invoke('free-token', {
      body: { showId, fingerprint },
    });
    const j = (data || {}) as FreeToken;
    if (fnErr && !j?.playbackUrl) throw new Error((j?.error && REASONS[j.error]) || REASONS.free_off);
    if (j?.error) throw new Error(REASONS[j.error] || j.error);
    if (!j.playbackUrl || !j.xApiToken) throw new Error('Respon server tidak lengkap.');
    if (j.showId) setActiveShowId(String(j.showId));
    return {
      url: j.playbackUrl,
      title: j.title || 'Siaran Gratis',
      headers: {
        'x-api-token': j.xApiToken,
        'x-sec-key': j.xSecKey,
        'x-showid': j.xShowId,
        'x-token-id': j.xTokenId,
      },
    };
  }, [showId]);

  const start = useCallback(async () => {
    setLoading(true);
    setError('');
    setSession(null);
    try {
      const s = await fetchToken();
      nonceRef.current += 1;
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memulai siaran gratis.');
    } finally {
      setLoading(false);
    }
  }, [fetchToken]);

  useEffect(() => { void start(); }, [start]);

  // Pengaturan watermark & tombol saluran khusus halaman /free (diatur admin).
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.from('site_settings').select('key,value').in('key', SETTING_KEYS);
      if (!active) return;
      const map = Object.fromEntries((data || []).map((r: any) => [r.key, String(r.value ?? '')]));
      setConfig({
        wmEnabled: map.free_watermark_enabled === 'true',
        wmText: map.free_watermark_text || '',
        wmOpacity: Number(map.free_watermark_opacity) || DEFAULT_CONFIG.wmOpacity,
        wmSize: Number(map.free_watermark_size) || DEFAULT_CONFIG.wmSize,
        linkEnabled: map.free_link_enabled === 'true',
        linkUrl: map.free_link_url || '',
        linkLabel: map.free_link_label || DEFAULT_CONFIG.linkLabel,
        durationMin: Number(map.free_duration_minutes) || 0,
        startedAt: map.free_started_at || '',
      });
    };
    void load();
    const ch = supabase.channel('free-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => { void load(); })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, []);

  // Rotasi diam-diam: hanya memperbarui header (player tidak di-remount, tayangan tidak terputus).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const rotate = async () => {
      if (cancelled) return;
      setRotating(true);
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const s = await fetchToken();
          if (cancelled) return;
          setSession((prev) => (prev ? { ...prev, headers: s.headers, url: s.url } : prev));
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
      if (!cancelled) setRotating(false);
    };

    timerRef.current = window.setInterval(rotate, ROTATE_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [session, fetchToken]);

  // Batas waktu siaran gratis yang diatur admin (0 = tanpa batas).
  const endsAtMs = config.durationMin > 0 && config.startedAt
    ? new Date(config.startedAt).getTime() + config.durationMin * 60000
    : 0;
  const remainingMs = endsAtMs ? endsAtMs - nowMs : 0;

  useEffect(() => {
    if (!endsAtMs) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAtMs]);

  // Waktu habis → hentikan pemutaran dan tampilkan pesan.
  useEffect(() => {
    if (!endsAtMs || remainingMs > 0) return;
    setSession(null);
    setLoading(false);
    setError(REASONS.free_ended);
  }, [endsAtMs, remainingMs]);

  const viewerCount = useViewerCount(activeShowId || showId || 'global', !!session);

  const remainingLabel = (() => {
    const total = Math.max(0, Math.floor(remainingMs / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  })();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-400" /> Siaran Gratis
          </h1>
          <div className="flex items-center gap-2">
            {viewerCount !== null && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold">
                <Users className="w-3.5 h-3.5" /> {viewerCount.toLocaleString('id-ID')} menonton
              </span>
            )}
            {endsAtMs > 0 && remainingMs > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-semibold tabular-nums">
                <Timer className="w-3.5 h-3.5" /> {remainingLabel}
              </span>
            )}
          {rotating && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-semibold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menyegarkan
            </span>
          )}
          </div>
        </header>

        {loading ? (
          <PlayerFallback />
        ) : error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center space-y-3">
            <p className="text-sm">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => void start()}>Coba lagi</Button>
              <Button onClick={() => navigate('/')}>Kembali</Button>
            </div>
          </div>
        ) : session ? (
          <>
            <Suspense fallback={<PlayerFallback />}>
              <HlsPlayer
                key={`free-${nonceRef.current}`}
                src={session.url}
                headers={session.headers}
                title={session.title}
                hideSeekButtons
                overlay={config.wmEnabled ? (
                  <FreeScreenWatermark text={config.wmText} opacity={config.wmOpacity} size={config.wmSize} />
                ) : null}
              />
            </Suspense>

            {config.linkEnabled && config.linkUrl && (
              <a
                href={config.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 text-sm hover:opacity-90 transition"
              >
                <LinkIcon className="w-4 h-4" /> {config.linkLabel || 'Join Saluran'}
              </a>
            )}

            <Suspense fallback={null}>
              <LiveChat lite showId={showId} />
            </Suspense>
          </>
        ) : null}

        <p className="text-xs text-muted-foreground text-center">
          Siaran gratis berjalan penuh tanpa jeda — akses diperpanjang otomatis setiap 28 menit.
        </p>
      </div>
    </div>
  );
}
