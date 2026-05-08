import { useEffect, useRef, useState } from 'react';
import { isFullscreenActive, onFullscreenChange, requestFs, exitFs } from '@/lib/fullscreen';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward } from 'lucide-react';
import LiveWatermark from '@/components/LiveWatermark';

interface Props {
  type: 'youtube' | 'cloudflare';
  source: string; // youtube id or url, cloudflare uid
  title: string;
  watermark?: string;
  hideSeekButtons?: boolean;
}

interface YoutubePlayerApi {
  getIframe?: () => HTMLIFrameElement;
  setVolume?: (volume: number) => void;
  mute?: () => void;
  unMute?: () => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  destroy?: () => void;
  getPlayerState?: () => number;
  getDuration?: () => number;
  getCurrentTime?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
}

interface YoutubeWindow extends Window {
  YT?: { Player: new (element: HTMLElement, options: Record<string, unknown>) => YoutubePlayerApi };
  onYouTubeIframeAPIReady?: () => void;
}

import { parseYouTubeId } from '@/lib/youtube';

function extractYoutubeId(raw: string): string {
  return parseYouTubeId(raw) || '';
}
function extractCloudflareUid(raw: string): string {
  const r = (raw || '').trim();
  const m = r.match(/([a-f0-9]{32})/i)?.[1];
  return m || r;
}

const VOL_KEY = 'replaytime-volume';
const MUTED_KEY = 'replaytime-muted';

export default function EmbedPlayer({ type, source, title, watermark, hideSeekButtons = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ytMountRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YoutubePlayerApi | null>(null);
  const ytFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [useYoutubeFallback, setUseYoutubeFallback] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Default unmuted: clear stale persisted mute one time per session.
  const initialMuted = (() => {
    try {
      if (!sessionStorage.getItem('replaytime-mute-reset')) {
        localStorage.removeItem(MUTED_KEY);
        sessionStorage.setItem('replaytime-mute-reset', '1');
        return false;
      }
      return localStorage.getItem(MUTED_KEY) === '1';
    } catch { return false; }
  })();
  const initialVolume = (() => { try { const v = parseFloat(localStorage.getItem(VOL_KEY) || ''); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; } catch { return 1; } })();
  const [muted, setMuted] = useState(initialMuted);
  const [volume, setVolume] = useState(initialVolume);
  const mutedRef = useRef(initialMuted);
  const volumeRef = useRef(initialVolume);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  const ytId = type === 'youtube' ? extractYoutubeId(source) : '';
  const cfUid = type === 'cloudflare' ? extractCloudflareUid(source) : '';

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // YouTube IFrame API — instantiate via div mount so YT injects an iframe sized 100% inside our container.
  // Penting: untuk replay, seek bar/durasi mengandalkan IFrame API. Jadi kita TIDAK auto-fallback hanya
  // karena timer pendek — fallback iframe (tanpa API) hanya dipakai bila API gagal (onError) atau setelah
  // safety timeout panjang.
  useEffect(() => {
    setReady(false);
    setIsPlaying(false);
    setUseYoutubeFallback(false);
    setDuration(0);
    setCurrentTime(0);
    if (ytFallbackTimerRef.current) clearTimeout(ytFallbackTimerRef.current);
    if (type !== 'youtube') {
      const id = setTimeout(() => { setReady(true); setIsPlaying(true); }, 600);
      return () => clearTimeout(id);
    }
    if (!ytId) {
      // Invalid YouTube id — clear loading so user sees error message instead of stuck spinner
      setReady(true);
      return;
    }
    let cancelled = false;
    // Safety net: kalau API benar-benar gagal load (script blocked / network), pakai fallback iframe.
    ytFallbackTimerRef.current = setTimeout(() => {
      if (cancelled || ready) return;
      setUseYoutubeFallback(true);
      setReady(true);
      setIsPlaying(true);
      if (!mutedRef.current) {
        setMuted(true);
        setShowHint(true);
      }
    }, 7000);

    const init = () => {
      if (cancelled || !ytMountRef.current) return;
      const YT = (window as YoutubeWindow).YT;
      if (!YT?.Player) { setTimeout(init, 200); return; }
      ytPlayerRef.current = new YT.Player(ytMountRef.current, {
        videoId: ytId,
        width: '100%',
        height: '100%',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          rel: 0, modestbranding: 1, playsinline: 1, autoplay: 1,
          controls: 0, fs: 0, iv_load_policy: 3, disablekb: 1,
          enablejsapi: 1, origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            if (ytFallbackTimerRef.current) clearTimeout(ytFallbackTimerRef.current);
            // Force injected iframe to fill container & block native clicks
            try {
              const ifr = ytPlayerRef.current?.getIframe?.();
              if (ifr) {
                ifr.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;');
                ifr.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
                ifr.setAttribute('allowfullscreen', 'true');
              }
            } catch { /* ignore */ }
            setReady(true);
            try {
              ytPlayerRef.current.setVolume?.(Math.round(volumeRef.current * 100));
              if (mutedRef.current) ytPlayerRef.current.mute?.(); else ytPlayerRef.current.unMute?.();
              ytPlayerRef.current.playVideo();
              setTimeout(() => {
                try {
                  const state = ytPlayerRef.current.getPlayerState();
                  if (state !== 1 && !mutedRef.current) {
                    ytPlayerRef.current.mute();
                    setMuted(true);
                    ytPlayerRef.current.playVideo();
                    setShowHint(true);
                  }
                } catch { /* ignore */ }
              }, 800);
            } catch { /* ignore */ }
          },
          onStateChange: (e: { data: number }) => {
            setIsPlaying(e.data === 1);
          },
          onError: () => {
            if (cancelled) return;
            setUseYoutubeFallback(true);
            setReady(true);
            setIsPlaying(true);
          },
        },
      });
    };

    if (!(window as YoutubeWindow).YT) {
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const ytWindow = window as YoutubeWindow;
      const prev = ytWindow.onYouTubeIframeAPIReady;
      ytWindow.onYouTubeIframeAPIReady = () => { try { prev?.(); } catch { /* ignore */ } init(); };
      // Also poll in case API was already loading
      const poll = setInterval(() => { if ((window as YoutubeWindow).YT?.Player) { clearInterval(poll); init(); } }, 200);
      setTimeout(() => clearInterval(poll), 10000);
    } else {
      init();
    }
    return () => {
      cancelled = true;
      if (ytFallbackTimerRef.current) clearTimeout(ytFallbackTimerRef.current);
      try { ytPlayerRef.current?.pauseVideo?.(); ytPlayerRef.current?.destroy?.(); } catch { /* ignore */ }
    };
  }, [ytId, type]);

  // Cloudflare via Stream SDK postMessage (basic play/pause/volume via iframe contentWindow)
  const cfPost = (event: string, value?: number) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ event: 'command', func: event, args: value !== undefined ? [value] : [] }, '*');
  };

  const togglePlay = () => {
    if (type === 'youtube') {
      const p = ytPlayerRef.current;
      if (useYoutubeFallback) {
        if (iframeRef.current) iframeRef.current.src = isPlaying ? 'about:blank' : ytEmbedUrl;
        setIsPlaying(!isPlaying);
        return;
      }
      if (!p || typeof p.pauseVideo !== 'function') return;
      if (isPlaying) p.pauseVideo(); else p.playVideo();
    } else {
      if (iframeRef.current) iframeRef.current.src = isPlaying ? 'about:blank' : cfEmbedUrl;
      cfPost(isPlaying ? 'pause' : 'play');
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    try { localStorage.setItem(MUTED_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (type === 'youtube') {
      const p = ytPlayerRef.current;
      if (!p || typeof p.mute !== 'function') return;
      if (m) p.mute(); else { p.unMute(); p.setVolume(Math.round(volume * 100)); }
    } else {
      cfPost(m ? 'mute' : 'unmute');
    }
    if (!m) setShowHint(false);
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* ignore */ }
    if (v > 0 && muted) { setMuted(false); try { localStorage.setItem(MUTED_KEY, '0'); } catch { /* ignore */ } }
    if (type === 'youtube') {
      const p = ytPlayerRef.current;
      if (!p || typeof p.setVolume !== 'function') return;
      p.setVolume(Math.round(v * 100));
      if (v > 0) p.unMute();
    } else {
      cfPost('setVolume', v);
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(isFullscreenActive());
    return onFullscreenChange(onChange);
  }, []);

  // Poll YT time/duration
  useEffect(() => {
    if (type !== 'youtube' || !ready) return;
    const id = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || seeking) return;
      try {
        const d = p.getDuration?.() || 0;
        const t = p.getCurrentTime?.() || 0;
        if (d && d !== duration) setDuration(d);
        setCurrentTime(t);
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(id);
  }, [ready, type, seeking, duration]);

  const seekTo = (t: number) => {
    const p = ytPlayerRef.current;
    if (!p) return;
    try { p.seekTo(Math.max(0, Math.min(duration || t, t)), true); setCurrentTime(t); } catch { /* ignore */ }
  };
  const skip = (delta: number) => seekTo((currentTime || 0) + delta);
  const fmtTime = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    const mm = String(m).padStart(h ? 2 : 1, '0');
    const ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreenActive()) requestFs(containerRef.current);
    else exitFs();
  };

  const ytEmbedUrl = ytId
    ? `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1&autoplay=1&mute=${muted || showHint || useYoutubeFallback ? 1 : 0}&controls=0&fs=0&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
    : '';
  const cfEmbedUrl = cfUid
    ? `https://iframe.videodelivery.net/${cfUid}?autoplay=true&controls=false&preload=auto&muted=${muted}`
    : '';

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl bg-black select-none"
      style={{ paddingBottom: isFullscreen ? '0' : '56.25%', height: isFullscreen ? '100%' : undefined }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {type === 'youtube' ? (
        ytId ? (
          useYoutubeFallback ? (
            <iframe
              ref={iframeRef}
              src={ytEmbedUrl}
              onLoad={() => { setReady(true); setIsPlaying(true); }}
              className="absolute inset-0 w-full h-full pointer-events-none"
              title={title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ border: 0 }}
            />
          ) : (
            <div ref={ytMountRef} className="absolute inset-0 w-full h-full" />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white/80 text-sm px-4 text-center">
            Link YouTube tidak valid. Hubungi admin untuk memeriksa sumber.
          </div>
        )
      ) : (
        <iframe
          ref={iframeRef}
          src={cfEmbedUrl}
          onLoad={() => { setReady(true); setIsPlaying(true); }}
          className="absolute inset-0 w-full h-full pointer-events-none"
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ border: 0 }}
        />
      )}

      {/* Anti-click overlay - covers entire iframe to block YouTube logo / Watch on YT button. Click does NOT toggle play. */}
      <div className="absolute inset-0" onClick={(e) => e.preventDefault()} />

      {watermark && <LiveWatermark code={watermark} />}

      {!ready && ytId !== '' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-primary animate-spin" />
          <div className="text-white/90 text-xs font-medium tracking-wide">Menghubungkan ke pemutar…</div>
        </div>
      )}

      {showHint && (
        <button
          onClick={toggleMute}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg animate-fade-in"
        >
          🔊 Tap untuk aktifkan suara
        </button>
      )}

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-8 bg-gradient-to-t from-black/80 to-transparent" style={{ touchAction: 'manipulation' }}>
        {type === 'youtube' && duration > 0 && (
          <div className="flex items-center gap-2 mb-2 text-white text-[11px] landscape:text-xs tabular-nums" onClick={(e) => e.stopPropagation()}>
            <span>{fmtTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={Math.min(currentTime, duration)}
              onChange={(e) => { setSeeking(true); setCurrentTime(Number(e.target.value)); }}
              onMouseUp={(e) => { seekTo(Number((e.target as HTMLInputElement).value)); setSeeking(false); }}
              onTouchEnd={(e) => { seekTo(Number((e.target as HTMLInputElement).value)); setSeeking(false); }}
              aria-label="Seek"
              className="flex-1 h-2 accent-primary cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            />
            <span>{fmtTime(duration)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 landscape:gap-3" onClick={(e) => e.stopPropagation()}>
          <button onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} className="p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all">
            {isPlaying ? <Pause className="w-5 h-5 landscape:w-6 landscape:h-6" /> : <Play className="w-5 h-5 landscape:w-6 landscape:h-6" />}
          </button>
          {type === 'youtube' && (
            <>
              <button onClick={() => skip(-10)} aria-label="Mundur 10 detik" className="p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all">
                <SkipBack className="w-5 h-5 landscape:w-6 landscape:h-6" />
              </button>
              <button onClick={() => skip(10)} aria-label="Maju 10 detik" className="p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all">
                <SkipForward className="w-5 h-5 landscape:w-6 landscape:h-6" />
              </button>
            </>
          )}
          <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all">
            {muted || volume === 0 ? <VolumeX className="w-5 h-5 landscape:w-6 landscape:h-6" /> : <Volume2 className="w-5 h-5 landscape:w-6 landscape:h-6" />}
          </button>
          <input
            type="range" min={0} max={1} step={0.05}
            value={muted ? 0 : volume}
            onChange={changeVolume}
            aria-label="Volume"
            className="w-24 h-2 accent-primary cursor-pointer"
            style={{ touchAction: 'manipulation' }}
          />
          <div className="flex-1" />
          <button onClick={toggleFullscreen} aria-label="Fullscreen" className="p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all">
            {isFullscreen ? <Minimize className="w-5 h-5 landscape:w-6 landscape:h-6" /> : <Maximize className="w-5 h-5 landscape:w-6 landscape:h-6" />}
          </button>
        </div>
      </div>
    </div>
  );
}
