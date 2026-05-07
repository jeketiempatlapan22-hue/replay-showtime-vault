import { ArrowLeft, Maximize, Minimize, Eye, Loader2, Lock, PictureInPicture2, ListVideo } from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type ReplayRow, getReplaySource, type ReplaySource, type PlaylistSource } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import RatingStars from '@/components/RatingStars';
import CommentSection from '@/components/CommentSection';
import HlsPlayer, { type HlsPlayerHandle } from '@/components/HlsPlayer';

interface Props {
  replay: ReplayRow;
  onBack: () => void;
}

function buildSources(source: ReplaySource | null, replay: ReplayRow): PlaylistSource[] {
  if (!source) return [];
  if (source.sources && source.sources.length > 0) return source.sources;
  // Fallback: build single source from legacy fields
  const fallback: PlaylistSource[] = [];
  if (source.m3u8_url) {
    fallback.push({ id: 'legacy-m3u8', label: 'M3U8', type: 'm3u8', url: source.m3u8_url, is_default: true });
  }
  if (source.youtube_id) {
    fallback.push({ id: 'legacy-yt', label: 'YouTube', type: 'youtube', url: source.youtube_id, is_default: !source.m3u8_url });
  }
  return fallback;
}

function extractYoutubeId(raw: string): string {
  const r = (raw || '').trim();
  const matched = r.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/)?.[1];
  const fallback = r.match(/([A-Za-z0-9_-]{11})/)?.[1];
  return (matched || fallback || '').slice(0, 11);
}

function extractCloudflareUid(raw: string): string {
  const r = (raw || '').trim();
  const m = r.match(/([a-f0-9]{32})/i)?.[1];
  return m || r;
}

export default function YouTubePlayer({ replay, onBack }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewCount, setViewCount] = useState(replay.view_count ?? 0);
  const [hlsFailed, setHlsFailed] = useState(false);
  const [source, setSource] = useState<ReplaySource | null>(null);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwChecking, setPwChecking] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsPlayerRef = useRef<HlsPlayerHandle>(null);
  const [pipActive, setPipActive] = useState(false);
  const pipSupported = typeof document !== 'undefined' && !!document.pictureInPictureEnabled;

  useEffect(() => {
    setViewCount(replay.view_count ?? 0);
  }, [replay.id, replay.view_count]);

  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setSourceLoading(true);
    setHlsFailed(false);
    setNeedsPassword(false);
    setPwInput('');
    setPwError('');
    setActiveSourceId(null);

    let password = '';
    let token = '';
    try {
      password = sessionStorage.getItem(`replaytime-pw-${replay.id}`) || '';
      token = sessionStorage.getItem(`replaytime-tok-${replay.id}`) || '';
    } catch { /* ignore */ }

    if (!password && !token) {
      setSourceLoading(false);
      setNeedsPassword(true);
      return;
    }

    getReplaySource(replay.id, token ? { accessToken: token } : { password }).then((src) => {
      if (cancelled) return;
      if (!src) {
        try {
          sessionStorage.removeItem(`replaytime-pw-${replay.id}`);
          sessionStorage.removeItem(`replaytime-tok-${replay.id}`);
        } catch { /* ignore */ }
        setSourceLoading(false);
        setNeedsPassword(true);
        return;
      }
      setSource(src);
      setSourceLoading(false);
    });

    return () => { cancelled = true; };
  }, [replay.id]);

  const sources = useMemo(() => buildSources(source, replay), [source, replay]);

  // Pick default active source when sources arrive
  useEffect(() => {
    if (!sources.length || activeSourceId) return;
    const def = sources.find(s => s.is_default) || sources[0];
    setActiveSourceId(def.id);
  }, [sources, activeSourceId]);

  const activeSource = useMemo(
    () => sources.find(s => s.id === activeSourceId) || null,
    [sources, activeSourceId],
  );

  const handleSubmitPassword = async () => {
    const trimmed = pwInput.trim();
    if (!trimmed) { setPwError('Sandi wajib diisi.'); return; }
    setPwChecking(true);
    setPwError('');
    const src = await getReplaySource(replay.id, { password: trimmed });
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

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  const handleHlsFatalError = useCallback(() => {
    // Try to switch to next source automatically
    if (!activeSource) return;
    const idx = sources.findIndex(s => s.id === activeSource.id);
    const next = sources.find((s, i) => i !== idx);
    if (next) {
      setActiveSourceId(next.id);
      setHlsFailed(false);
    } else {
      setHlsFailed(true);
    }
  }, [activeSource, sources]);

  // Build YouTube embed URL with autoplay+mute
  const ytEmbedUrl = useMemo(() => {
    if (!activeSource || activeSource.type !== 'youtube') return '';
    const id = extractYoutubeId(activeSource.url);
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return '';
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1&mute=1&iv_load_policy=3&enablejsapi=0&origin=${encodeURIComponent(window.location.origin)}`;
  }, [activeSource]);

  const cfEmbedUrl = useMemo(() => {
    if (!activeSource || activeSource.type !== 'cloudflare') return '';
    const uid = extractCloudflareUid(activeSource.url);
    if (!uid) return '';
    return `https://iframe.videodelivery.net/${uid}?autoplay=true&muted=true`;
  }, [activeSource]);

  // Set iframe src after mount
  useEffect(() => {
    if (!iframeRef.current) return;
    const url = activeSource?.type === 'youtube' ? ytEmbedUrl : activeSource?.type === 'cloudflare' ? cfEmbedUrl : '';
    if (url) iframeRef.current.src = url;
  }, [activeSource, ytEmbedUrl, cfEmbedUrl]);

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
        {activeSource && activeSource.type !== 'm3u8' && (
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
              <Input type="password" placeholder="Sandi replay..." value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitPassword()} autoFocus />
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
        ) : !activeSource ? (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-6 text-center">
            <p className="text-destructive font-medium">Video belum tersedia. Hubungi admin.</p>
          </div>
        ) : activeSource.type === 'm3u8' && !hlsFailed ? (
          <HlsPlayer
            ref={hlsPlayerRef}
            key={activeSource.id}
            src={activeSource.url}
            title={replay.title}
            onFatalError={handleHlsFatalError}
            onPipChange={setPipActive}
          />
        ) : (
          <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingBottom: '56.25%' }}>
            <iframe
              ref={iframeRef}
              key={activeSource.id}
              src={activeSource.type === 'youtube' ? ytEmbedUrl : cfEmbedUrl}
              className="absolute inset-0 w-full h-full"
              title={replay.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="eager"
              style={{ border: 0 }}
            />
          </div>
        )}

        {/* Playlist chips */}
        {sources.length > 1 && activeSource && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <ListVideo className="w-3.5 h-3.5" />
              <span>Pilih playlist</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              {sources.map(s => {
                const active = s.id === activeSourceId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setHlsFailed(false); setActiveSourceId(s.id); }}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-md'
                        : 'bg-card/60 text-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {s.label || s.type.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="w-4 h-4" />
              <span>{viewCount} kali ditonton</span>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto">
              <RatingStars replayId={replay.id} />
              {activeSource?.type === 'm3u8' && pipSupported && (
                <div className="flex flex-col items-end">
                  <Button
                    type="button"
                    variant={pipActive ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5 h-8 px-2.5"
                    onClick={async () => {
                      if (!hlsPlayerRef.current) return;
                      if (pipActive) await hlsPlayerRef.current.exitPip();
                      else await hlsPlayerRef.current.requestPip();
                    }}
                    title="Picture-in-Picture: tonton video di jendela kecil mengambang"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                    <span className="text-xs font-medium">{pipActive ? 'Tutup PiP' : 'PiP'}</span>
                  </Button>
                  <p className="mt-1 text-[10px] text-muted-foreground text-right max-w-[180px] leading-tight">
                    Tonton di jendela kecil mengambang sambil membuka tab/aplikasi lain
                  </p>
                </div>
              )}
            </div>
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
