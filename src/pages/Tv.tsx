import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { saveTvSession } from '@/lib/tvSession';

const HlsPlayer = lazy(() => import('@/components/HlsPlayer'));
const EmbedPlayer = lazy(() => import('@/components/EmbedPlayer'));

interface ReplayTvPayload {
  kind: 'replay';
  replay_id: string;
  title: string;
  source_type: 'youtube' | 'cloudflare' | 'm3u8';
  source: string;
  youtube_alt_id?: string;
}

const SS_KEY_BASE = 'replaytime-live-unlocked';

const reason = (code?: string) => {
  switch (code) {
    case 'bad_code': return 'Kode harus 6 angka.';
    case 'not_found': return 'Kode tidak ditemukan. Periksa lagi angkanya.';
    case 'used': return 'Kode ini sudah dipakai. Buat kode baru di HP.';
    case 'expired': return 'Kode sudah kedaluwarsa. Buat kode baru di HP.';
    default: return 'Gagal membuka siaran. Coba lagi.';
  }
};

export default function TvPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [replay, setReplay] = useState<ReplayTvPayload | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) { setError('Masukkan 6 angka.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await supabase.functions.invoke('tv-pair', {
        body: { action: 'claim', code: clean },
      });
      if (data?.ok && data?.payload) {
        const payload = data.payload as Record<string, unknown>;
        if (payload.kind === 'replay' && typeof payload.replay_id === 'string' && typeof payload.source === 'string') {
          setReplay(payload as unknown as ReplayTvPayload);
          setLoading(false);
          return;
        }
        const showId = String(data.show_id || '');
        const key = `${SS_KEY_BASE}${showId ? '-' + showId : ''}`;
        try { sessionStorage.setItem(key, JSON.stringify(data.payload)); } catch { /* ignore */ }
        if (data?.session_token) saveTvSession(String(data.session_token));
        navigate(`/live${showId ? `?show=${showId}` : ''}`, { replace: true });
        return;
      }
      setError(reason(data?.error));
    } catch {
      setError('Gagal terhubung ke server.');
    }
    setLoading(false);
  };

  if (replay) {
    return (
      <div className="min-h-screen bg-background px-2 py-3 sm:px-4 sm:py-6">
        <div className="mx-auto w-full max-w-screen-2xl space-y-3">
          <div className="flex items-center gap-3 px-1">
            <Tv className="h-5 w-5 text-primary" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Replay di TV</p>
              <h1 className="truncate text-base font-bold text-foreground sm:text-lg">{replay.title || 'ReplayTime'}</h1>
            </div>
          </div>
          <Suspense fallback={<div className="aspect-video w-full rounded-xl bg-card flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            {replay.source_type === 'm3u8' ? (
              <HlsPlayer src={replay.source} title={replay.title || 'ReplayTime'} />
            ) : (
              <EmbedPlayer
                type={replay.source_type === 'cloudflare' ? 'cloudflare' : 'youtube'}
                source={replay.source}
                title={replay.title || 'ReplayTime'}
                altYoutubeId={replay.youtube_alt_id || ''}
              />
            )}
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative z-10 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-card/80 border border-border p-6 sm:p-8 space-y-6 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Tv className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Tonton di TV</h1>
          <p className="text-sm text-muted-foreground">
            Buka pemutar di HP Anda, ketuk ikon TV, lalu pilih <span className="font-semibold text-foreground">Kode untuk TV</span>.
            Masukkan 6 angka yang muncul di bawah ini.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Input
            inputMode="numeric"
            autoFocus
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-center text-3xl sm:text-4xl h-16 tracking-[0.4em] font-bold"
          />
          <Button type="submit" size="lg" className="w-full text-base" disabled={loading || code.length !== 6}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Mulai Menonton'}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Kode berlaku 10 menit dan hanya bisa dipakai sekali. TV tidak dihitung sebagai perangkat baru,
          jadi token Anda tidak perlu direset.
        </p>
      </div>
    </div>
  );
}
