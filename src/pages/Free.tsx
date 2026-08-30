import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Gift, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { getDeviceFingerprint } from '@/lib/fingerprint';

const HlsPlayer = lazy(() => import('@/components/HlsPlayer'));

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

function PlayerFallback() {
  return (
    <div className="aspect-video w-full rounded-2xl bg-card/80 border border-border flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}

export default function Free() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const showId = search.get('show') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState<{ url: string; headers: Record<string, string>; title: string; expiresAt: number } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [expired, setExpired] = useState(false);
  const nonceRef = useRef(0);

  const start = useCallback(async () => {
    setLoading(true);
    setError('');
    setExpired(false);
    setSession(null);
    try {
      const fingerprint = await getDeviceFingerprint();
      const { data, error: fnErr } = await supabase.functions.invoke('free-token', {
        body: { showId, fingerprint },
      });
      const j = (data || {}) as FreeToken;
      if (fnErr && !j?.playbackUrl) {
        const msg = (j?.error && REASONS[j.error]) || REASONS.free_off;
        throw new Error(msg);
      }
      if (j?.error) throw new Error(REASONS[j.error] || j.error);
      if (!j.playbackUrl || !j.xApiToken) throw new Error('Respon server tidak lengkap.');
      setSession({
        url: j.playbackUrl,
        title: j.title || 'Siaran Gratis',
        headers: {
          'x-api-token': j.xApiToken,
          'x-sec-key': j.xSecKey,
          'x-showid': j.xShowId,
          'x-token-id': j.xTokenId,
        },
        expiresAt: new Date(j.expiresAt).getTime(),
      });
      nonceRef.current += 1;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memulai siaran gratis.');
    } finally {
      setLoading(false);
    }
  }, [showId]);

  useEffect(() => { void start(); }, [start]);

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) { setExpired(true); setSession(null); }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-400" /> Siaran Gratis
          </h1>
          {session && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-semibold">
              <Clock className="w-3.5 h-3.5" /> {mm}:{ss}
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
        ) : expired ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center space-y-3">
            <p className="text-sm font-semibold">Sesi gratis 30 menit sudah berakhir.</p>
            <p className="text-xs text-muted-foreground">Mulai sesi baru untuk melanjutkan menonton.</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => void start()}>Mulai sesi baru</Button>
              <Button variant="outline" onClick={() => navigate('/shows')}>Beli akses show</Button>
            </div>
          </div>
        ) : session ? (
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
        ) : null}

        <p className="text-xs text-muted-foreground text-center">
          Sesi gratis berlaku 30 menit per perangkat. Untuk menonton penuh tanpa batas, beli akses show atau membership.
        </p>
      </div>
    </div>
  );
}
