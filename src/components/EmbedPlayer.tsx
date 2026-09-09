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
  setPlaybackRate?: (rate: number) => void;
  getPlaybackRate?: () => number;
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
    // Safety poll dalam kasus event tidak terpanggil. Jangan resolve sebelum API
    // tersedia karena itu membuat init retry tanpa batas saat script diblokir.
    const start = Date.now();
    const poll = setInterval(() => {
      if (w.YT?.Player) { clearInterval(poll); done(); }
      else if (Date.now() - start > 6000) {
        clearInterval(poll);
        ytApiLoadingPromise = null;
        resolve();
      }
    }, 150);
  });
  return ytApiLoadingPromise;
}

export default function EmbedPlayer({ type, source, title, watermark, hideSeekButtons = false, isLive = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ytPlayerRef = useRef<YoutubePlayerApi | null>(null);
  // Host div tempat YT.Player dibuat (API membuat iframe-nya sendiri → kontrol
  // seek/durasi/play-pause selalu tersedia, tidak bergantung attach ke iframe manual).
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const playbackRateRef = useRef(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const ytFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [pseudoFs, setPseudoFs] = useState(false);

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
    const target = ordered[idx];
    try { p.setPlaybackQuality(target); } catch { /* ignore */ }
    // Sebagian build YT hanya menghormati setPlaybackQualityRange.
    try {
      (p as unknown as { setPlaybackQualityRange?: (a: string, b: string) => void })
        .setPlaybackQualityRange?.(target, target);
    } catch { /* ignore */ }
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
  // Ditandai saat user sengaja menekan pause agar autoplay-guard tidak memaksa play lagi.
  const userPausedRef = useRef(false);
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

  // Lazy-load iframe: player baru dimuat ketika container mendekati viewport,
  // sehingga kartu/section yang belum terlihat tidak membebani browser.
  // Player utama (replay/live) hampir selalu langsung terlihat, jadi kita cek
  // posisi secara sinkron dulu agar embed tampil tanpa jeda.
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) { setInView(true); return; }
    const nearViewport = () => {
      const r = el.getBoundingClientRect();
      const h = window.innerHeight || document.documentElement.clientHeight || 0;
      // Elemen dengan ukuran 0 (belum layout) juga dianggap perlu dimuat.
      if (r.width === 0 && r.height === 0) return true;
      return r.top < h + 300 && r.bottom > -300;
    };
    if (nearViewport() || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin: '300px 0px' });
    io.observe(el);
    // Safety net: bila observer tidak pernah memicu (container tersembunyi/nol ukuran),
    // tetap muat player agar tidak stuck di placeholder.
    const safety = setTimeout(() => setInView(true), 1200);
    return () => { io.disconnect(); clearTimeout(safety); };
  }, []);



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
    plainModeRef.current = false;
    setPlainMode(false);
    setDetectedLive(!!isLive);

    // Reset adaptive-quality state untuk source baru.
    qualityCapIdxRef.current = 0;
    availableQualitiesRef.current = [];
    bufferEventsRef.current = [];
    lastDowngradeAtRef.current = 0;

    setDuration(0);
    setCurrentTime(0);
    if (ytFallbackTimerRef.current) clearTimeout(ytFallbackTimerRef.current);
    if (!inView) return;
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

    let initTries = 0;
    const init = () => {
      if (cancelled || plainModeRef.current || initialized) return;
      // Host div mungkin belum ter-mount pada tick pertama — coba lagi sebentar.
      if (!ytHostRef.current) {
        if (initTries++ < 40) setTimeout(init, 100);
        return;
      }

      const YT = (window as YoutubeWindow).YT;
      if (!YT?.Player) {
        // API diblokir/lambat → jatuh ke embed polos (kontrol bawaan YouTube).
        if (initTries++ < 20) setTimeout(init, 150);
        else {
          plainModeRef.current = true;
          setPlainMode(true);
          markReady(true);
        }
        return;
      }

      initialized = true;
      // YT API MENGGANTI elemen yang dioper dengan iframe buatannya. Kalau kita
      // oper div milik React, React kehilangan node-nya dan player bisa berakhir
      // di node lepas (tampil thumbnail saja / kontrol tidak nyambung).
      // Karena itu kita buat node mount sendiri di dalam host.
      const mount = document.createElement('div');
      mount.style.width = '100%';
      mount.style.height = '100%';
      ytHostRef.current.replaceChildren(mount);
      ytPlayerRef.current = new YT.Player(mount, {
        videoId: ytId,
        width: '100%',
        height: '100%',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          autoplay: 1,
          mute: 1,
          controls: 0,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          hl: 'id',
          disablekb: 1,
          enablejsapi: 1,
          ...(safeOrigin ? { origin: safeOrigin } : {}),
        },
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
              // Pulihkan kecepatan pemutaran pilihan user.
              if (playbackRateRef.current !== 1) {
                try { ytPlayerRef.current.setPlaybackRate?.(playbackRateRef.current); } catch { /* ignore */ }
              }
              // Durasi sering sudah tersedia tepat setelah ready.
              setTimeout(() => {
                try {
                  const d = ytPlayerRef.current?.getDuration?.() ?? 0;
                  if (d > 0) setDuration(d);
                } catch { /* ignore */ }
              }, 600);
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
          onError: (e?: { data?: number }) => {
            if (cancelled) return;
            const code = Number(e?.data ?? 0);
            // 153 = konfigurasi pemutar (origin) ditolak, 101/150 = embed dibatasi.
            // Muat ulang sebagai embed polos tanpa JS API agar video tetap tampil.
            if ((code === 153 || code === 101 || code === 150) && !plainModeRef.current) {
              plainModeRef.current = true;
              setPlainMode(true);
              markReady(false);
              return;
            }
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
      try { ytPlayerRef.current?.destroy?.(); } catch { /* ignore */ }
      try { ytHostRef.current?.replaceChildren(); } catch { /* ignore */ }
      ytPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId, type, inView, markReady, isLive, refreshAvailableQualities, applyQualityCap, disableCaptions]);

  // Cloudflare via Stream SDK postMessage (basic play/pause/volume via iframe contentWindow)
  const cfPost = (event: string, value?: number) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ event: 'command', func: event, args: value !== undefined ? [value] : [] }, '*');
  };

  // Fallback kontrol YouTube lewat postMessage (iframe API) — dipakai ketika
  // objek YT.Player belum/tidak pernah ter-attach (API diblokir, init lambat).
  const ytWindow = (): Window | null => {
    try {
      const ifr = ytPlayerRef.current?.getIframe?.();
      if (ifr?.contentWindow) return ifr.contentWindow;
    } catch { /* ignore */ }
    return iframeRef.current?.contentWindow ?? null;
  };
  const ytPost = (func: string, args: unknown[] = []) => {
    const w = ytWindow();
    if (!w) return;
    const msg = JSON.stringify({ event: 'command', func, args });
    try { w.postMessage(msg, 'https://www.youtube-nocookie.com'); } catch { /* ignore */ }
    try { w.postMessage(msg, 'https://www.youtube.com'); } catch { /* ignore */ }
    try { w.postMessage(msg, '*'); } catch { /* ignore */ }
  };

  // Handshake wajib agar iframe YouTube menerima perintah postMessage.
  const ytHandshake = () => {
    const w = ytWindow();
    if (!w) return;
    const msg = JSON.stringify({ event: 'listening', id: ytId || 'yt-embed', channel: 'widget' });
    try { w.postMessage(msg, 'https://www.youtube-nocookie.com'); } catch { /* ignore */ }
    try { w.postMessage(msg, 'https://www.youtube.com'); } catch { /* ignore */ }
    try { w.postMessage(msg, '*'); } catch { /* ignore */ }
  };

  // Jalankan aksi via JS API bila tersedia; kalau tidak, langsung pakai postMessage
  // agar tombol tetap responsif seketika (tanpa menunggu retry).
  const withYtPlayer = (action: (p: YoutubePlayerApi) => void, fallback?: () => void) => {
    const p = ytPlayerRef.current;
    if (p && typeof p.playVideo === 'function') {
      try { action(p); return; } catch { /* ignore */ }
    }
    fallback?.();
  };

  // Kirim perintah lewat JS API DAN postMessage sekaligus. Beberapa kondisi
  // (API lambat siap, iframe di-recreate, blokir script) membuat salah satu
  // jalur diam-diam gagal sehingga tombol play/pause terasa tidak berfungsi.
  const ytCommand = (func: 'playVideo' | 'pauseVideo') => {
    let handled = false;
    const p = ytPlayerRef.current;
    if (p && typeof p[func] === 'function') {
      try { p[func]?.(); handled = true; } catch { /* ignore */ }
    }
    ytHandshake();
    ytPost(func);
    return handled;
  };

  const togglePlay = () => {
    if (type === 'youtube') {
      // Ambil state nyata dari player bila tersedia; fallback ke state React.
      let state: number | undefined;
      try { state = ytPlayerRef.current?.getPlayerState?.(); } catch { /* ignore */ }
      const playing = state === undefined ? isPlayingRef.current : (state === 1 || state === 3);
      const next = !playing;
      ytCommand(next ? 'playVideo' : 'pauseVideo');
      setIsPlaying(next);
      isPlayingRef.current = next;
      userPausedRef.current = !next;
      // Verifikasi & ulangi sekali bila perintah pertama tidak berefek.
      setTimeout(() => {
        let s: number | undefined;
        try { s = ytPlayerRef.current?.getPlayerState?.(); } catch { /* ignore */ }
        if (s === undefined) return;
        const nowPlaying = s === 1 || s === 3;
        if (nowPlaying !== next) ytCommand(next ? 'playVideo' : 'pauseVideo');
      }, 400);
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
      withYtPlayer(
        (p) => {
          if (m) p.mute?.();
          else { p.unMute?.(); p.setVolume?.(Math.round(volumeRef.current * 100)); p.playVideo?.(); }
        },
        () => {
          if (m) ytPost('mute');
          else {
            ytPost('unMute');
            ytPost('setVolume', [Math.round(volumeRef.current * 100)]);
            ytPost('playVideo');
            setIsPlaying(true);
            isPlayingRef.current = true;
          }
        },
      );
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
      withYtPlayer(
        (p) => {
          p.setVolume?.(Math.round(v * 100));
          if (v > 0) p.unMute?.();
        },
        () => {
          ytPost('setVolume', [Math.round(v * 100)]);
          if (v > 0) ytPost('unMute');
        },
      );
    } else {
      cfPost('setVolume', v);
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(isFullscreenActive());
    return onFullscreenChange(onChange);
  }, []);

  // Esc keluar dari mode fullscreen CSS (fallback iOS/WebView).
  useEffect(() => {
    if (!pseudoFs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPseudoFs(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pseudoFs]);

  // Kunci resolusi (replay saja): YouTube sering menurunkan kualitas sendiri.
  // Setiap 5 detik kita cek kualitas aktif; bila lebih rendah dari cap saat ini,
  // paksa kembali ke cap. Cap hanya turun lewat logika buffering di onStateChange.
  useEffect(() => {
    if (type !== 'youtube' || isLive || !ready) return;
    const id = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p) return;
      if (!availableQualitiesRef.current.length) { refreshAvailableQualities(); return; }
      const ordered = YT_QUALITY_LADDER.filter(q => availableQualitiesRef.current.includes(q));
      if (!ordered.length) return;
      const targetIdx = Math.min(qualityCapIdxRef.current, ordered.length - 1);
      let current = '';
      try { current = p.getPlaybackQuality?.() || ''; } catch { /* ignore */ }
      const currentIdx = ordered.indexOf(current);
      if (current && currentIdx > targetIdx) applyQualityCap();
    }, 5000);
    return () => clearInterval(id);
  }, [type, isLive, ready, applyQualityCap, refreshAvailableQualities]);

  // Autoplay guard (YouTube): sebagian browser/TV mengabaikan autoplay pertama
  // sehingga video diam di frame awal. Setelah player siap, pastikan playback
  // benar-benar berjalan — kecuali user memang menekan pause.
  useEffect(() => {
    if (type !== 'youtube' || !ready || !ytId) return;
    let tries = 0;
    const kick = () => {
      if (userPausedRef.current) return;
      let state: number | undefined;
      try { state = ytPlayerRef.current?.getPlayerState?.(); } catch { /* ignore */ }
      // 1 = playing, 3 = buffering (sudah jalan)
      if (state === 1 || state === 3) { setIsPlaying(true); isPlayingRef.current = true; return; }
      ytHandshake();
      ytPost('playVideo');
      try { ytPlayerRef.current?.playVideo?.(); } catch { /* ignore */ }
    };
    const id = setInterval(() => {
      tries += 1;
      kick();
      if (tries >= 6) clearInterval(id);
    }, 700);
    kick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ready, ytId, plainMode]);


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
    let dur = duration;
    if (!dur) {
      try { dur = p?.getDuration?.() ?? 0; } catch { /* ignore */ }
      if (dur > 0) setDuration(dur);
    }
    if (!dur || !isFinite(dur)) return;
    const target = Math.max(0, Math.min(dur, t));
    let handled = false;
    if (p?.seekTo) {
      try { p.seekTo(target, true); handled = true; } catch { /* ignore */ }
    }
    if (!handled) { ytHandshake(); ytPost('seekTo', [target, true]); }
    setCurrentTime(target);
  };
  const skip = (delta: number) => {
    let base = currentTime || 0;
    try {
      const t = ytPlayerRef.current?.getCurrentTime?.();
      if (typeof t === 'number' && isFinite(t)) base = t;
    } catch { /* ignore */ }
    seekTo(base + delta);
  };
  const changeRate = (rate: number) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    setShowSpeedMenu(false);
    let handled = false;
    const p = ytPlayerRef.current;
    if (p?.setPlaybackRate) {
      try { p.setPlaybackRate(rate); handled = true; } catch { /* ignore */ }
    }
    if (!handled) { ytHandshake(); ytPost('setPlaybackRate', [rate]); }
  };
  const fmtTime = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    const mm = String(m).padStart(h ? 2 : 1, '0');
    const ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const lockLandscape = async (on: boolean) => {
    try {
      const so = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void>; unlock?: () => void } }).orientation;
      if (!so) return;
      if (on) await so.lock?.('landscape');
      else so.unlock?.();
    } catch { /* ignore */ }
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (isFullscreenActive() || pseudoFs) {
      await exitFs();
      setPseudoFs(false);
      void lockLandscape(false);
      return;
    }
    await requestFs(el, el.querySelector('video'));
    void lockLandscape(true);
    // Fallback: beberapa browser (iOS Safari, sebagian WebView TV) menolak
    // fullscreen untuk elemen non-video → pakai mode fullscreen CSS.
    setTimeout(() => {
      if (!isFullscreenActive()) setPseudoFs(true);
    }, 350);
  };

  // iOS/iPadOS tidak mendukung screen.orientation.lock. Saat mode fullscreen CSS
  // aktif sementara perangkat masih portrait, putar container 90° agar video
  // benar-benar tampil landscape memenuhi layar.
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    if (!pseudoFs) { setPortrait(false); return; }
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, [pseudoFs]);
  const rotateFs = pseudoFs && portrait;

  // Cegah scroll body saat fullscreen CSS aktif.
  useEffect(() => {
    if (!pseudoFs) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [pseudoFs]);


  // Origin hanya dikirim jika benar-benar valid. Di iframe sandbox/webview,
  // window.location.origin bisa bernilai "null" → YouTube menolak (Error 153) & layar hitam.
  const safeOrigin = (() => {
    try {
      const o = window.location.origin;
      return /^https?:\/\/[^/]+$/.test(o) ? o : '';
    } catch { return ''; }
  })();
  const ytBaseParams = 'rel=0&modestbranding=1&playsinline=1&autoplay=1&mute=1&controls=0&fs=0&iv_load_policy=3&cc_load_policy=0&hl=id&disablekb=1';
  const ytPlainParams = 'rel=0&modestbranding=1&playsinline=1&autoplay=1&mute=1&controls=1&fs=1&iv_load_policy=3&cc_load_policy=0&hl=id&enablejsapi=1';
  const ytEmbedUrl = ytId
    ? plainMode
      ? `https://www.youtube-nocookie.com/embed/${ytId}?${ytPlainParams}`
      : `https://www.youtube-nocookie.com/embed/${ytId}?${ytBaseParams}&enablejsapi=1${safeOrigin ? `&origin=${encodeURIComponent(safeOrigin)}` : ''}`
    : '';


  const cfEmbedUrl = cfUid
    ? `https://iframe.videodelivery.net/${cfUid}?autoplay=true&controls=false&preload=auto&muted=true`
    : '';

  // Stable iframe id required so YT.Player can reliably attach to the existing iframe.
  const ytIframeId = ytId ? `yt-embed-${ytId}` : 'yt-embed';

  const showSpinner = inView && !ready && (
    (type === 'youtube' && !!ytId) ||
    (type === 'cloudflare' && !!cfUid)
  );

  return (
    <div
      ref={containerRef}
      data-player-root

      className={`relative overflow-hidden bg-black select-none ${isFullscreen || pseudoFs ? 'rounded-none' : 'rounded-xl'} ${pseudoFs ? 'fixed z-[9999]' : 'w-full'} ${pseudoFs && !rotateFs ? 'inset-0 w-screen' : ''} ${showControls || !isPlaying ? '' : 'cursor-none'}`}
      style={{
        paddingBottom: isFullscreen || pseudoFs ? '0' : '56.25%',
        height: rotateFs ? '100vw' : (isFullscreen || pseudoFs ? '100dvh' : undefined),
        ...(rotateFs
          ? {
              width: '100dvh',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(90deg)',
              transformOrigin: 'center center',
            }
          : {}),
      }}


      onContextMenu={(e) => e.preventDefault()}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {!inView ? (
        <div className="absolute inset-0 bg-muted/20 animate-pulse" aria-hidden />
      ) : type === 'youtube' ? (
        ytId ? (
          plainMode ? (
            <iframe
              ref={iframeRef}
              key="plain"
              id={ytIframeId}
              src={ytEmbedUrl}
              onLoad={() => { handleFrameLoaded(); ytHandshake(); setTimeout(ytHandshake, 800); }}
              className="absolute inset-0 w-full h-full"
              title={title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope"
              allowFullScreen
              loading="eager"
              referrerPolicy="origin-when-cross-origin"
              // @ts-expect-error - fetchpriority valid HTML attr
              fetchpriority="high"
              style={{ border: 0 }}
            />
          ) : (
            // YT API akan mengganti div ini dengan iframe-nya sendiri.
            <div key="api" className="absolute inset-0 w-full h-full pointer-events-none">
              <div ref={ytHostRef} className="w-full h-full" />
            </div>
          )
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
            referrerPolicy="origin-when-cross-origin"
            // @ts-expect-error - fetchpriority valid HTML attr
            fetchpriority="high"
            style={{ border: 0 }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white/80 text-sm px-4 text-center">
            Sumber Cloudflare tidak valid. Hubungi admin untuk memeriksa sumber.
          </div>
        )
      )}


      {/* Click-shield over iframe — single tap toggles controls visibility instead of clicking through to YouTube logo. */}
      {!plainMode && (
        <div
          className="absolute inset-0 z-[5]"
          onClick={(e) => { e.preventDefault(); toggleControls(); }}
        />
      )}


      {watermark && <LiveWatermark code={watermark} />}

      {showSpinner && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-primary animate-spin" />
          <div className="text-white/90 text-xs font-medium tracking-wide">Menghubungkan ke pemutar…</div>
        </div>
      )}

      {showHint && !plainMode && (
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
          plainMode ? 'hidden' : showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
          {type === 'youtube' && !liveActive && (
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(v => !v); resetHideTimer(); }}
                aria-label="Kecepatan pemutaran"
                className="px-2 py-1.5 rounded-md text-white text-[11px] sm:text-xs font-semibold hover:text-primary active:scale-95 transition-all tabular-nums"
              >
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 rounded-lg bg-black/90 border border-white/15 p-1 shadow-xl flex flex-col min-w-[64px]">
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => (
                    <button
                      key={r}
                      onClick={(e) => { e.stopPropagation(); changeRate(r); resetHideTimer(); }}
                      className={`px-2 py-1 text-[11px] rounded text-left tabular-nums ${r === playbackRate ? 'bg-primary text-primary-foreground' : 'text-white hover:bg-white/10'}`}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} aria-label="Fullscreen" className="p-2.5 landscape:p-3 text-white hover:text-primary active:scale-95 transition-all">
            {isFullscreen || pseudoFs ? <Minimize className="w-5 h-5 landscape:w-6 landscape:h-6" /> : <Maximize className="w-5 h-5 landscape:w-6 landscape:h-6" />}
          </button>
        </div>
      </div>
    </div>
  );
}
