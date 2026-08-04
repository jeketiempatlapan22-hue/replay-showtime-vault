import { useEffect, useRef, useState, useCallback } from 'react';
import { isFullscreenActive, onFullscreenChange, requestFs, exitFs } from '@/lib/fullscreen';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward } from 'lucide-react';
import LiveWatermark from '@/components/LiveWatermark';

interface Props {
  type: 'youtube' | 'cloudflare';
  source: string; // youtube id or url, cloudflare uid
  title: string;
  watermark?: string;
  hideSeekButtons?: boolean;
  isLive?: boolean;
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
  setPlaybackQuality?: (quality: string) => void;
  getPlaybackQuality?: () => string;
  getAvailableQualityLevels?: () => string[];
  getVideoLoadedFraction?: () => number;
  unloadModule?: (module: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
}

// Ladder kualitas YouTube dari tertinggi ke terendah.
// Dipakai untuk: (1) mengunci default ke resolusi tertinggi yang tersedia,
// (2) menurunkan satu tingkat saat user mengalami buffering berulang.
const YT_QUALITY_LADDER = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];

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

// Preconnect ke domain media — dipasang SEKALI per tipe player, idempotent,
// agar tidak ada churn DOM saat player re-mount (mempercepat handshake awal).
const PRECONNECT_HOSTS: Record<'youtube' | 'cloudflare', string[]> = {
  youtube: [
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://i.ytimg.com',
    'https://s.ytimg.com',
    'https://yt3.ggpht.com',
    'https://www.google.com',
  ],
  cloudflare: [
    'https://iframe.videodelivery.net',
    'https://videodelivery.net',
    'https://cloudflarestream.com',
  ],
};
const installedPreconnects = new Set<string>();
function ensurePreconnect(kind: 'youtube' | 'cloudflare') {
  if (typeof document === 'undefined') return;
  if (installedPreconnects.has(kind)) return;
  installedPreconnects.add(kind);
  const head = document.head;
  PRECONNECT_HOSTS[kind].forEach(href => {
    if (document.querySelector(`link[data-rt-preconnect="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    l.crossOrigin = 'anonymous';
    l.setAttribute('data-rt-preconnect', href);
    head.appendChild(l);
    const d = document.createElement('link');
    d.rel = 'dns-prefetch';
    d.href = href;
    d.setAttribute('data-rt-preconnect', href + '#dns');
    head.appendChild(d);
  });
}

// Loader YT IFrame API singleton — pastikan script hanya dimuat sekali.
let ytApiLoadingPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as YoutubeWindow;
  if (w.YT?.Player) return Promise.resolve();
  if (ytApiLoadingPromise) return ytApiLoadingPromise;
  ytApiLoadingPromise = new Promise<void>((resolve) => {
    const done = () => resolve();
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { try { prev?.(); } catch { /* ignore */ } done(); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
    // Safety poll dalam kasus event tidak terpanggil
    const start = Date.now();
    const poll = setInterval(() => {
      if (w.YT?.Player) { clearInterval(poll); done(); }
      else if (Date.now() - start > 10000) { clearInterval(poll); done(); }
    }, 150);
  });
  return ytApiLoadingPromise;
}

export default function EmbedPlayer({ type, source, title, watermark, hideSeekButtons = false, isLive = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ytPlayerRef = useRef<YoutubePlayerApi | null>(null);
  const ytFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
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
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Auto-detect live for YouTube (duration === 0/Infinity sambil currentTime jalan = live).
  // Prop `isLive` jadi initial hint; deteksi runtime bisa meng-override.
  const [detectedLive, setDetectedLive] = useState<boolean>(!!isLive);
  const liveActive = isLive || detectedLive;
  const liveEndedRef = useRef(false);
  // Fallback embed sederhana (tanpa JS API / origin) bila YouTube menolak konfigurasi
  // pemutar (error 153 / 101 / 150) sehingga video tidak muncul sama sekali.
  const [plainMode, setPlainMode] = useState(false);
  const plainModeRef = useRef(false);


  // Adaptive quality (replay only): mulai dari tertinggi yang tersedia,
  // turun satu tingkat hanya jika user kena buffering berulang dalam window pendek.
  const qualityCapIdxRef = useRef(0); // 0 = tertinggi di ladder yang tersedia
  const availableQualitiesRef = useRef<string[]>([]);
  const bufferEventsRef = useRef<number[]>([]);
  const lastDowngradeAtRef = useRef(0);

  const applyQualityCap = useCallback(() => {
    const p = ytPlayerRef.current;
    if (!p?.setPlaybackQuality) return;
    const avail = availableQualitiesRef.current;
    if (!avail.length) return;
    const ordered = YT_QUALITY_LADDER.filter(q => avail.includes(q));
    if (!ordered.length) return;
    const idx = Math.min(qualityCapIdxRef.current, ordered.length - 1);
    try { p.setPlaybackQuality(ordered[idx]); } catch { /* ignore */ }
  }, []);

  const refreshAvailableQualities = useCallback(() => {
    const p = ytPlayerRef.current;
    if (!p?.getAvailableQualityLevels) return;
    try {
      const levels = p.getAvailableQualityLevels() || [];
      if (levels.length) {
        availableQualitiesRef.current = levels;
        applyQualityCap();
      }
    } catch { /* ignore */ }
  }, [applyQualityCap]);


  // Matikan subtitle YouTube (captions) — dipanggil di beberapa titik karena YT
  // kadang mereload modul caption setelah quality switch / play.
  const disableCaptions = useCallback(() => {
    const p = ytPlayerRef.current;
    if (!p) return;
    try { p.unloadModule?.('captions'); } catch { /* ignore */ }
    try { p.unloadModule?.('cc'); } catch { /* ignore */ }
    try { p.setOption?.('captions', 'track', {}); } catch { /* ignore */ }
  }, []);

  const markReady = useCallback((value: boolean) => {
    readyRef.current = value;
    setReady(value);
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      // Only hide while actually playing
      setShowControls(prev => (isPlayingRef.current ? false : prev));
    }, 3000);
  }, []);

  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  // Track whether autoplay-mute coercion has already run for the current source so that
  // subsequent iframe.onLoad / YT onReady events don't re-force mute (and re-show the hint)
  // after the user has already interacted.
  const autoMuteAppliedRef = useRef(false);
  const userUnmutedRef = useRef(false);

  const toggleControls = useCallback(() => {
    resetHideTimer();
  }, [resetHideTimer]);

  const handleFrameLoaded = useCallback(() => {
    markReady(true);
    setIsPlaying(true);
    // Apply autoplay-mute coercion only ONCE per source. Once the user has unmuted, never force mute again.
    if (autoMuteAppliedRef.current || userUnmutedRef.current) return;
    autoMuteAppliedRef.current = true;
    if (!mutedRef.current) {
      mutedRef.current = true;
      setMuted(true);
      setShowHint(true);
    } else {
      // Persisted-mute case: still show the hint so user can unmute easily.
      setShowHint(true);
    }
  }, [markReady]);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [resetHideTimer]);

  const ytId = type === 'youtube' ? extractYoutubeId(source) : '';
  const cfUid = type === 'cloudflare' ? extractCloudflareUid(source) : '';

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // YouTube: tampilkan iframe langsung agar tidak blank/stuck, lalu attach IFrame API ke iframe yang sama
  // untuk kontrol replay (seek, durasi, play/pause, mute) saat API sudah siap.
  useEffect(() => {
    markReady(false);
    setIsPlaying(false);
    autoMuteAppliedRef.current = false;
    userUnmutedRef.current = false;
    liveEndedRef.current = false;
    setDetectedLive(!!isLive);
    // Reset adaptive-quality state untuk source baru.
    qualityCapIdxRef.current = 0;
    availableQualitiesRef.current = [];
    bufferEventsRef.current = [];
    lastDowngradeAtRef.current = 0;

    setDuration(0);
    setCurrentTime(0);
    if (ytFallbackTimerRef.current) clearTimeout(ytFallbackTimerRef.current);
    if (type !== 'youtube') {
      const id = setTimeout(() => { markReady(true); setIsPlaying(true); }, 400);
      return () => clearTimeout(id);
    }
    if (!ytId) {
      // Invalid YouTube id — clear loading so user sees error message instead of stuck spinner
      markReady(true);
      return;
    }
    let cancelled = false;
    let initialized = false;
    // Safety net: jangan biarkan overlay koneksi menutup iframe bila API/onLoad lambat atau diblokir.
    ytFallbackTimerRef.current = setTimeout(() => {
      if (cancelled || readyRef.current) return;
      markReady(true);
      setIsPlaying(true);
    }, 700);

    const init = () => {
      if (cancelled || !iframeRef.current) return;
      if (initialized) return;
      const YT = (window as YoutubeWindow).YT;
      if (!YT?.Player) { setTimeout(init, 200); return; }
      initialized = true;
      ytPlayerRef.current = new YT.Player(iframeRef.current, {
        events: {
          onReady: () => {
            if (cancelled) return;
            if (ytFallbackTimerRef.current) {
              clearTimeout(ytFallbackTimerRef.current);
              ytFallbackTimerRef.current = null;
            }
            // Force injected iframe to fill container & block native clicks
            try {
              const ifr = ytPlayerRef.current?.getIframe?.();
              if (ifr) {
                ifr.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;');
                ifr.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
                ifr.setAttribute('allowfullscreen', 'true');
              }
            } catch { /* ignore */ }
            markReady(true);
            try {
              ytPlayerRef.current.setVolume?.(Math.round(volumeRef.current * 100));
              if (userUnmutedRef.current) {
                // User already activated sound — keep it on.
                ytPlayerRef.current.unMute?.();
                mutedRef.current = false;
                setMuted(false);
                setShowHint(false);
              } else {
                // Embed dimulai muted agar autoplay stabil; user bisa aktifkan suara lewat tombol hint.
                ytPlayerRef.current.mute?.();
                if (!mutedRef.current) {
                  mutedRef.current = true;
                  setMuted(true);
                }
                setShowHint(true);
                autoMuteAppliedRef.current = true;
              }
              ytPlayerRef.current.playVideo?.();
              // Matikan subtitle di replay (jangan sentuh Live).
              if (!isLive) {
                disableCaptions();
                setTimeout(disableCaptions, 1500);
                setTimeout(disableCaptions, 4000);
              }
              // Coba kunci ke resolusi tertinggi (hanya untuk replay, bukan live).
              if (!isLive) {
                refreshAvailableQualities();
                // Available levels sering baru terisi beberapa detik setelah ready.
                setTimeout(refreshAvailableQualities, 1500);
                setTimeout(refreshAvailableQualities, 4000);
              }
            } catch { /* ignore */ }
          },
          onPlaybackQualityChange: () => {
            // Re-cek list — kadang baru terisi setelah quality pertama dipilih.
            if (!isLive) { refreshAvailableQualities(); disableCaptions(); }
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === 1 || e.data === 3) markReady(true);
            setIsPlaying(e.data === 1 || e.data === 3);
            // Setiap kali mulai PLAYING di replay, matikan captions lagi
            // (YT kadang me-reload modul caption saat transisi).
            if (e.data === 1 && !isLive) disableCaptions();
            // Adaptive downgrade: state 3 = BUFFERING. Hitung kejadian buffering
            // dalam 30 detik terakhir; jika ≥3 → turunkan 1 tingkat resolusi.
            // Hanya berlaku untuk replay (bukan live) agar tidak ganggu Live.
            if (e.data === 3 && !isLive) {
              const now = Date.now();
              const recent = bufferEventsRef.current.filter(t => now - t < 30000);
              recent.push(now);
              bufferEventsRef.current = recent;
              const cooldownOk = now - lastDowngradeAtRef.current > 15000;
              if (recent.length >= 3 && cooldownOk) {
                const avail = availableQualitiesRef.current;
                const ordered = YT_QUALITY_LADDER.filter(q => avail.includes(q));
                if (ordered.length && qualityCapIdxRef.current < ordered.length - 1) {
                  qualityCapIdxRef.current += 1;
                  lastDowngradeAtRef.current = now;
                  bufferEventsRef.current = [];
                  applyQualityCap();
                }
              }
            }
          },
          onError: () => {
            if (cancelled) return;
            markReady(true);
            setIsPlaying(true);
          },
        },
      });
    };

    void loadYouTubeApi().then(() => { if (!cancelled) init(); });
    return () => {
      cancelled = true;
      if (ytFallbackTimerRef.current) clearTimeout(ytFallbackTimerRef.current);
      try { ytPlayerRef.current?.pauseVideo?.(); } catch { /* ignore */ }
      ytPlayerRef.current = null;
    };
  }, [ytId, type, markReady, isLive, refreshAvailableQualities, applyQualityCap, disableCaptions]);

  // Cloudflare via Stream SDK postMessage (basic play/pause/volume via iframe contentWindow)
  const cfPost = (event: string, value?: number) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ event: 'command', func: event, args: value !== undefined ? [value] : [] }, '*');
  };

  const withYtPlayer = (action: (p: YoutubePlayerApi) => void) => {
    const apply = (attempt = 0) => {
      const p = ytPlayerRef.current;
      if (p && typeof p.playVideo === 'function') {
        try { action(p); } catch { /* ignore */ }
        return;
      }
      if (attempt < 20) setTimeout(() => apply(attempt + 1), 100);
    };
    apply();
  };

  const togglePlay = () => {
    if (type === 'youtube') {
      withYtPlayer((p) => {
        const state = p.getPlayerState?.();
        if (state === 1 || isPlayingRef.current) {
          p.pauseVideo?.();
          setIsPlaying(false);
        } else {
          p.playVideo?.();
          setIsPlaying(true);
        }
      });
    } else {
      if (iframeRef.current && iframeRef.current.src === 'about:blank') iframeRef.current.src = cfEmbedUrl;
      cfPost(isPlaying ? 'pause' : 'play');
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    if (!m) userUnmutedRef.current = true;
    try { localStorage.setItem(MUTED_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (type === 'youtube') {
      withYtPlayer((p) => {
        if (m) p.mute?.();
        else { p.unMute?.(); p.setVolume?.(Math.round(volumeRef.current * 100)); p.playVideo?.(); }
      });
    } else {
      cfPost(m ? 'mute' : 'unmute');
    }
    if (!m) setShowHint(false);
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    volumeRef.current = v;
    try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* ignore */ }
    if (v > 0 && muted) {
      setMuted(false);
      mutedRef.current = false;
      userUnmutedRef.current = true;
      setShowHint(false);
      try { localStorage.setItem(MUTED_KEY, '0'); } catch { /* ignore */ }
    }
    if (type === 'youtube') {
      withYtPlayer((p) => {
        p.setVolume?.(Math.round(v * 100));
        if (v > 0) p.unMute?.();
      });
    } else {
      cfPost('setVolume', v);
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(isFullscreenActive());
    return onFullscreenChange(onChange);
  }, []);

  // Poll YT time/duration — auto-pause saat tab hidden untuk hemat CPU & cegah throttling browser
  // membuat polling tertimbun antrian ketika tab kembali aktif.
  useEffect(() => {
    if (type !== 'youtube' || !ready) return;
    let liveProbeHits = 0;
    let lastSec = -1;
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const p = ytPlayerRef.current;
      if (!p) return;
      try {
        const d = p.getDuration?.() ?? 0;
        const t = p.getCurrentTime?.() ?? 0;
        const looksLive = !Number.isFinite(d) || d === 0;
        if (looksLive && t > 0) {
          liveProbeHits += 1;
          if (liveProbeHits >= 2 && !detectedLive) setDetectedLive(true);
        } else if (!looksLive && d > 0) {
          liveProbeHits = 0;
          if (detectedLive && !isLive) setDetectedLive(false);
        }
        if (liveActive) return;
        if (seeking) return;
        if (d && Math.abs(d - duration) >= 0.5) setDuration(d);
        const sec = Math.floor(t);
        if (sec !== lastSec) {
          lastSec = sec;
          setCurrentTime(t);
        }
      } catch { /* ignore */ }
    };
    const start = () => { if (!id) id = setInterval(tick, 1000); };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => { if (document.hidden) stop(); else start(); };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [ready, type, seeking, duration, isLive, detectedLive, liveActive]);

  // Preconnect ke domain media (singleton, dipasang sekali per tipe player).
  useEffect(() => { ensurePreconnect(type); }, [type]);

  // Saat YouTube live berakhir (state=0/ENDED): jangan restart, cukup tandai sebagai berakhir.
  useEffect(() => {
    if (type !== 'youtube' || !liveActive) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const p = ytPlayerRef.current;
      if (!p) return;
      try {
        const state = p.getPlayerState?.();
        if (state === 0 && !liveEndedRef.current) {
          liveEndedRef.current = true;
          setIsPlaying(false);
        }
      } catch { /* ignore */ }
    };
    const start = () => { if (!interval) interval = setInterval(tick, 3000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVis = () => { if (document.hidden) stop(); else start(); };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [type, liveActive]);

  const seekTo = (t: number) => {
    const p = ytPlayerRef.current;
    if (!p || !duration) return;
    const target = Math.max(0, Math.min(duration, t));
    try { p.seekTo(target, true); setCurrentTime(target); } catch { /* ignore */ }
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
    ? `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1&autoplay=1&mute=1&controls=0&fs=0&iv_load_policy=3&cc_load_policy=0&cc_lang_pref=none&hl=id&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
    : '';
  const cfEmbedUrl = cfUid
    ? `https://iframe.videodelivery.net/${cfUid}?autoplay=true&controls=false&preload=auto&muted=true`
    : '';

  // Stable iframe id required so YT.Player can reliably attach to the existing iframe.
  const ytIframeId = ytId ? `yt-embed-${ytId}` : 'yt-embed';

  const showSpinner = !ready && (
    (type === 'youtube' && !!ytId) ||
    (type === 'cloudflare' && !!cfUid)
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl bg-black select-none ${isFullscreen ? 'h-dvh' : ''} ${showControls || !isPlaying ? '' : 'cursor-none'}`}
      style={{ paddingBottom: isFullscreen ? '0' : '56.25%', height: isFullscreen ? '100dvh' : undefined }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {type === 'youtube' ? (
        ytId ? (
          <iframe
            ref={iframeRef}
            id={ytIframeId}
            src={ytEmbedUrl}
            onLoad={handleFrameLoaded}
            className="absolute inset-0 w-full h-full pointer-events-none"
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope"
            allowFullScreen
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            // @ts-expect-error - fetchpriority valid HTML attr
            fetchpriority="high"
            style={{ border: 0, willChange: 'transform' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white/80 text-sm px-4 text-center">
            Link YouTube tidak valid. Hubungi admin untuk memeriksa sumber.
          </div>
        )
      ) : (
        cfUid ? (
          <iframe
            ref={iframeRef}
            src={cfEmbedUrl}
            onLoad={handleFrameLoaded}
            className="absolute inset-0 w-full h-full pointer-events-none"
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope"
            allowFullScreen
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            // @ts-expect-error - fetchpriority valid HTML attr
            fetchpriority="high"
            style={{ border: 0, willChange: 'transform' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white/80 text-sm px-4 text-center">
            Sumber Cloudflare tidak valid. Hubungi admin untuk memeriksa sumber.
          </div>
        )
      )}

      {/* Click-shield over iframe — single tap toggles controls visibility instead of clicking through to YouTube logo. */}
      <div
        className="absolute inset-0 z-[5]"
        onClick={(e) => { e.preventDefault(); toggleControls(); }}
      />

      {watermark && <LiveWatermark code={watermark} />}

      {showSpinner && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-primary animate-spin" />
          <div className="text-white/90 text-xs font-medium tracking-wide">Menghubungkan ke pemutar…</div>
        </div>
      )}

      {showHint && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg animate-fade-in"
        >
          🔊 Tap untuk aktifkan suara
        </button>
      )}

      {/* Controls */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 px-2 sm:px-3 pb-2 sm:pb-3 pt-8 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ touchAction: 'manipulation' }}
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'youtube' && !liveActive && (
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 text-white text-[10px] sm:text-xs tabular-nums" onClick={(e) => e.stopPropagation()}>
            <span className="w-10 sm:w-14 text-left shrink-0">{duration > 0 ? fmtTime(currentTime) : '--:--'}</span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.1}
              value={duration > 0 ? Math.min(currentTime, duration) : 0}
              onChange={(e) => { setSeeking(true); setCurrentTime(Number(e.target.value)); }}
              onPointerDown={(e) => { e.stopPropagation(); setSeeking(true); }}
              onPointerUp={(e) => { e.stopPropagation(); if (duration > 0) seekTo(Number((e.target as HTMLInputElement).value)); setSeeking(false); resetHideTimer(); }}
              onMouseUp={(e) => { e.stopPropagation(); if (duration > 0) seekTo(Number((e.target as HTMLInputElement).value)); setSeeking(false); }}
              onTouchEnd={(e) => { e.stopPropagation(); if (duration > 0) seekTo(Number((e.target as HTMLInputElement).value)); setSeeking(false); }}
              aria-label="Seek"
              className="min-w-0 flex-1 h-2 accent-primary cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            />
            <span className="w-10 sm:w-14 text-right shrink-0">{duration > 0 ? fmtTime(duration) : '--:--'}</span>
          </div>
        )}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={(e) => { e.stopPropagation(); togglePlay(); resetHideTimer(); }} aria-label={isPlaying ? 'Pause' : 'Play'} className="p-2 sm:p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all shrink-0">
            {isPlaying ? <Pause className="w-5 h-5 landscape:w-6 landscape:h-6" /> : <Play className="w-5 h-5 landscape:w-6 landscape:h-6" />}
          </button>
          {type === 'youtube' && !hideSeekButtons && (
            <>
              <button onClick={(e) => { e.stopPropagation(); skip(-10); resetHideTimer(); }} aria-label="Mundur 10 detik" className="p-2 sm:p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all shrink-0">
                <SkipBack className="w-5 h-5 landscape:w-6 landscape:h-6" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); skip(10); resetHideTimer(); }} aria-label="Maju 10 detik" className="p-2 sm:p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all shrink-0">
                <SkipForward className="w-5 h-5 landscape:w-6 landscape:h-6" />
              </button>
            </>
          )}
          <button onClick={(e) => { e.stopPropagation(); toggleMute(); resetHideTimer(); }} aria-label={muted ? 'Unmute' : 'Mute'} className="p-2 sm:p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all shrink-0">
            {muted || volume === 0 ? <VolumeX className="w-5 h-5 landscape:w-6 landscape:h-6" /> : <Volume2 className="w-5 h-5 landscape:w-6 landscape:h-6" />}
          </button>
          <input
            type="range" min={0} max={1} step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => { e.stopPropagation(); changeVolume(e); }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            aria-label="Volume"
            className="w-14 sm:w-24 h-2 accent-primary cursor-pointer shrink-0"
            style={{ touchAction: 'manipulation' }}
          />
          <div className="flex-1" />
          <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} aria-label="Fullscreen" className="p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all">
            {isFullscreen ? <Minimize className="w-5 h-5 landscape:w-6 landscape:h-6" /> : <Maximize className="w-5 h-5 landscape:w-6 landscape:h-6" />}
          </button>
        </div>
      </div>
    </div>
  );
}
