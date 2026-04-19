import { ArrowLeft, Maximize, Minimize, Eye, Loader2, Lock } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type ReplayRow, getReplaySource, type ReplaySource } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import RatingStars from '@/components/RatingStars';
import CommentSection from '@/components/CommentSection';
import HlsPlayer from '@/components/HlsPlayer';

interface Props {
  replay: ReplayRow;
  onBack: () => void;
}

export default function YouTubePlayer({ replay, onBack }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewCount, setViewCount] = useState(replay.view_count ?? 0);
  const [hlsFailed, setHlsFailed] = useState(false);
  const [source, setSource] = useState<ReplaySource | null>(null);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwChecking, setPwChecking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setViewCount(replay.view_count ?? 0);
  }, [replay.id, replay.view_count]);

  // Fetch source server-side via edge function (uses sandi from sessionStorage)
  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setSourceLoading(true);
    setSourceError(null);
    setHlsFailed(false);
    setNeedsPassword(false);
    setPwInput('');
    setPwError('');

    const password = (() => {
      try { return sessionStorage.getItem(`replaytime-pw-${replay.id}`) || ''; } catch { return ''; }
    })();

    if (!password) {
      setSourceLoading(false);
      setNeedsPassword(true);
      return;
    }

    getReplaySource(replay.id, password).then((src) => {
      if (cancelled) return;
      if (!src) {
        try { sessionStorage.removeItem(`replaytime-pw-${replay.id}`); } catch { /* ignore */ }
        setSourceLoading(false);
        setNeedsPassword(true);
        return;
      }
      setSource(src);
      setSourceLoading(false);
    });

    return () => { cancelled = true; };
  }, [replay.id]);

  const handleSubmitPassword = async () => {
    const trimmed = pwInput.trim();
    if (!trimmed) {
      setPwError('Sandi wajib diisi.');
      return;
    }
    setPwChecking(true);
    setPwError('');
    const src = await getReplaySource(replay.id, trimmed);
    setPwChecking(false);
    if (src) {
      try { sessionStorage.setItem(`replaytime-pw-${replay.id}`, trimmed); } catch { /* ignore */ }
      setSource(src);
      setNeedsPassword(false);
      setPwInput('');
    } else {
      setPwError('Sandi salah. Coba lagi.');
    }
  };


  useEffect(() => {
    const incrementView = async () => {
      try {
        const { data } = await supabase.rpc('increment_view_count', { _replay_id: replay.id });
        if (typeof data === 'number') setViewCount(data);
      } catch { /* ignore */ }
    };
    incrementView();
  }, [replay.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`replay-views-${replay.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'replays', filter: `id=eq.${replay.id}`,
      }, (payload) => {
        const newRow = payload.new as { view_count?: number };
        if (typeof newRow.view_count === 'number') setViewCount(newRow.view_count);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [replay.id]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.() ||
        (containerRef.current as any).webkitRequestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.() || (document as any).webkitExitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  const m3u8Url = (source?.m3u8_url || '').trim();
  const rawId = (source?.youtube_id || '').trim();
  const matchedId = rawId.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/)?.[1];
  const fallbackId = rawId.match(/([A-Za-z0-9_-]{11})/)?.[1];
  const extractedId = (matchedId || fallbackId || '').slice(0, 11);
  const isValidYoutube = /^[A-Za-z0-9_-]{11}$/.test(extractedId);

  // Priority: M3U8 first if present and not failed → otherwise YouTube
  const useM3u8 = !!m3u8Url && !hlsFailed;
  const useYoutube = !useM3u8 && isValidYoutube;

  // Set iframe src via JS after mount so YouTube ID is not in initial HTML.
  useEffect(() => {
    if (!useYoutube || !iframeRef.current) return;
    const url = `https://www.youtube-nocookie.com/embed/${extractedId}?rel=0&modestbranding=1&playsinline=1&autoplay=0&iv_load_policy=3&enablejsapi=0&origin=${encodeURIComponent(window.location.origin)}`;
    iframeRef.current.src = url;
  }, [useYoutube, extractedId, replay.id]);

  const lineup = replay.lineup || [];

  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold truncate font-sans">{replay.title}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{replay.criteria}</p>
        </div>
        {useYoutube && (
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="shrink-0">
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </Button>
        )}
      </div>

      <div
        ref={containerRef}
        className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-4 select-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {sourceLoading ? (
          <div className="relative w-full overflow-hidden rounded-xl bg-black flex items-center justify-center" style={{ paddingBottom: '56.25%' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          </div>
        ) : needsPassword ? (
          <div className="rounded-xl bg-card/80 border border-border p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-foreground font-semibold mb-1">Masukkan Sandi</p>
              <p className="text-sm text-muted-foreground">Sesi sandi tidak ditemukan. Masukkan ulang untuk menonton.</p>
            </div>
            <div className="max-w-xs mx-auto space-y-2">
              <Input
                type="password"
                placeholder="Sandi replay..."
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitPassword()}
                autoFocus
              />
              {pwError && <p className="text-xs text-destructive">{pwError}</p>}
              <Button className="w-full" onClick={handleSubmitPassword} disabled={pwChecking}>
                {pwChecking ? 'Memeriksa...' : 'Buka Replay'}
              </Button>
            </div>
          </div>
        ) : sourceError ? (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-6 text-center">
            <p className="text-destructive font-medium">{sourceError}</p>
          </div>
        ) : useM3u8 ? (
          <HlsPlayer
            src={m3u8Url}
            title={replay.title}
            onFatalError={() => { if (isValidYoutube) setHlsFailed(true); }}
          />
        ) : useYoutube ? (
          <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingBottom: '56.25%' }}>
            <iframe
              ref={iframeRef}
              key={replay.id}
              className="absolute inset-0 w-full h-full"
              title={replay.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              style={{ border: 0 }}
            />
          </div>
        ) : (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-6 text-center">
            <p className="text-destructive font-medium">Video belum tersedia. Hubungi admin.</p>
          </div>
        )}

        <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="w-4 h-4" />
              <span>{viewCount} kali ditonton</span>
            </div>
            <RatingStars replayId={replay.id} />
          </div>

          <p className="text-muted-foreground text-sm">
            {new Date(replay.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          {lineup.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {lineup.map((m, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm">{m}</span>
              ))}
            </div>
          )}

          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-border">
            <CommentSection replayId={replay.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
