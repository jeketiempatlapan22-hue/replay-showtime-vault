import { useEffect, useRef, useState } from 'react';
import { isFullscreenActive, onFullscreenChange, requestFs, exitFs } from '@/lib/fullscreen';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import LiveWatermark from '@/components/LiveWatermark';

interface Props {
  type: 'youtube' | 'cloudflare';
  source: string; // youtube id or url, cloudflare uid
  title: string;
  watermark?: string;
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

const VOL_KEY = 'replaytime-volume';
const MUTED_KEY = 'replaytime-muted';

export default function EmbedPlayer({ type, source, title, watermark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const initialMuted = (() => { try { return localStorage.getItem(MUTED_KEY) === '1'; } catch { return false; } })();
  const initialVolume = (() => { try { const v = parseFloat(localStorage.getItem(VOL_KEY) || ''); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; } catch { return 1; } })();
  const [muted, setMuted] = useState(initialMuted);
  const [volume, setVolume] = useState(initialVolume);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  const ytId = type === 'youtube' ? extractYoutubeId(source) : '';
  const cfUid = type === 'cloudflare' ? extractCloudflareUid(source) : '';

  // YouTube IFrame API
  useEffect(() => {
    if (type !== 'youtube' || !ytId) return;
    let cancelled = false;

    const init = () => {
      if (cancelled || !iframeRef.current) return;
      const YT = (window as any).YT;
      if (!YT?.Player) { setTimeout(init, 200); return; }
      ytPlayerRef.current = new YT.Player(iframeRef.current, {
        events: {
          onReady: () => {
            if (cancelled) return;
            setReady(true);
            try {
              ytPlayerRef.current.setVolume(Math.round(volume * 100));
              if (muted) ytPlayerRef.current.mute(); else ytPlayerRef.current.unMute();
              const p = ytPlayerRef.current.playVideo();
              // detect autoplay block
              setTimeout(() => {
                try {
                  const state = ytPlayerRef.current.getPlayerState();
                  if (state !== 1 && !muted) {
                    // try muted autoplay fallback (do NOT persist forced mute)
                    ytPlayerRef.current.mute();
                    setMuted(true);
                    ytPlayerRef.current.playVideo();
                    setShowHint(true);
                  }
                } catch { /* ignore */ }
              }, 800);
            } catch { /* ignore */ }
          },
          onStateChange: (e: any) => {
            setIsPlaying(e.data === 1);
          },
        },
      });
    };

    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      (window as any).onYouTubeIframeAPIReady = init;
    } else {
      init();
    }
    return () => { cancelled = true; try { ytPlayerRef.current?.destroy(); } catch { /* ignore */ } };
  }, [ytId, type]);

  // Cloudflare via Stream SDK postMessage (basic play/pause/volume via iframe contentWindow)
  const cfPost = (event: string, value?: any) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ event: 'command', func: event, args: value !== undefined ? [value] : [] }, '*');
  };

  const togglePlay = () => {
    if (type === 'youtube') {
      const p = ytPlayerRef.current;
      if (!p) return;
      if (isPlaying) p.pauseVideo(); else p.playVideo();
    } else {
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
      if (!p) return;
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
      if (!p) return;
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

  // Poll YT current time / duration
  useEffect(() => {
    if (type !== 'youtube') return;
    const id = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        if (!seeking) setCurrentTime(p.getCurrentTime() || 0);
        const d = p.getDuration() || 0;
        if (d && d !== duration) setDuration(d);
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(id);
  }, [type, seeking, duration]);

  const onSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setCurrentTime(v);
  };
  const onSeekCommit = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (type === 'youtube') {
      try { ytPlayerRef.current?.seekTo(v, true); } catch { /* ignore */ }
    }
    setSeeking(false);
  };
  const seekBy = (delta: number) => {
    if (type !== 'youtube') return;
    const p = ytPlayerRef.current;
    if (!p?.getCurrentTime) return;
    try {
      const t = Math.max(0, Math.min((p.getDuration() || 0), (p.getCurrentTime() || 0) + delta));
      p.seekTo(t, true);
      setCurrentTime(t);
    } catch { /* ignore */ }
  };
  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${(m % 60).toString().padStart(2, '0')}:${sec}`;
    return `${m}:${sec}`;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreenActive()) requestFs(containerRef.current);
    else exitFs();
  };

  const ytEmbedUrl = ytId
    ? `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1&autoplay=1&controls=0&fs=0&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
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
      <iframe
        ref={iframeRef}
        src={type === 'youtube' ? ytEmbedUrl : cfEmbedUrl}
        className="absolute inset-0 w-full h-full pointer-events-none"
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ border: 0 }}
      />

      {/* Anti-click overlay - covers entire iframe to block YouTube logo / Watch on YT button. Click does NOT toggle play. */}
      <div className="absolute inset-0" onClick={(e) => e.preventDefault()} />

      {watermark && <LiveWatermark code={watermark} />}

      {showHint && (
        <button
          onClick={toggleMute}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg animate-fade-in"
        >
          🔊 Tap untuk aktifkan suara
        </button>
      )}

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-8 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={togglePlay} className="p-2 text-white hover:text-primary transition-colors">
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button onClick={toggleMute} className="p-2 text-white hover:text-primary transition-colors">
            {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <input
            type="range" min={0} max={1} step={0.05}
            value={muted ? 0 : volume}
            onChange={changeVolume}
            className="w-20 h-1 accent-primary cursor-pointer"
          />
          <div className="flex-1" />
          <button onClick={toggleFullscreen} className="p-2 text-white hover:text-primary transition-colors">
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
