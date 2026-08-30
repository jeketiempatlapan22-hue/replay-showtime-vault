import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Gift, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { getDeviceFingerprint } from '@/lib/fingerprint';

const HlsPlayer = lazy(() => import('@/components/HlsPlayer'));
const LiveChat = lazy(() => import('@/components/LiveChat'));

interface FreeToken {
  title: string;
  xShowId: string;
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
};

// Rotasi kredensial tiap 28 menit (token gratis berlaku 30 menit) agar tayangan tidak terputus.
const ROTATE_MS = 28 * 60 * 1000;

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-400" /> Siaran Gratis
          </h1>
          {rotating && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-semibold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menyegarkan
            </span>
          )}
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
                watermark="FREE"
                hideSeekButtons
              />
            </Suspense>

            <Suspense fallback={null}>
              <LiveChat lite />
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
