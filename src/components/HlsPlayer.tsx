import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, Loader2, Settings, Check } from 'lucide-react';
import { isFullscreenActive, onFullscreenChange, requestFs, exitFs } from '@/lib/fullscreen';
import LiveWatermark from '@/components/LiveWatermark';

interface Props {
  src: string;
  title: string;
  watermark?: string;
  onFatalError?: () => void;
  onPipChange?: (active: boolean) => void;
  hideSeekButtons?: boolean;
}

export interface HlsPlayerHandle {
  requestPip: () => Promise<void>;
  exitPip: () => Promise<void>;
  isPipSupported: () => boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface QualityLevel {
  index: number;
  label: string;
  height?: number;
  bitrate?: number;
}

const HlsPlayer = forwardRef<HlsPlayerHandle, Props>(({ src, title, watermark, onFatalError, onPipChange, hideSeekButtons = false }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const loadingRef = useRef(true);
  const isLiveRef = useRef(false);
  const stallWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressRef = useRef({ time: 0, checkedAt: Date.now(), recoveries: 0 });
  const onFatalErrorRef = useRef(onFatalError);

  const initialVolume = (() => { try { const v = parseFloat(localStorage.getItem('replaytime-volume') || ''); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; } catch { return 1; } })();
  // Default unmuted; one-time per session, clear stale persisted mute so user starts with sound on.
  const initialMuted = (() => {
    try {
      if (!sessionStorage.getItem('replaytime-mute-reset')) {
        localStorage.removeItem('replaytime-muted');
        sessionStorage.setItem('replaytime-mute-reset', '1');
        return false;
      }
      return localStorage.getItem('replaytime-muted') === '1';
    } catch { return false; }
  })();
  const initialVolumeRef = useRef(initialVolume);
  const initialMutedRef = useRef(initialMuted);
  const savedQualityHeight = (() => { try { const v = parseInt(localStorage.getItem('replaytime-quality-height') || '', 10); return isFinite(v) ? v : null; } catch { return null; } })();
  const userQualityRef = useRef<number | null>(savedQualityHeight);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialVolume);
  const [muted, setMuted] = useState(initialMuted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true); // initial connect
  const [buffering, setBuffering] = useState(false); // mid-play stall
  const [error, setError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [autoActiveLabel, setAutoActiveLabel] = useState<string>('');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);

  // Expose PiP API to parent
  useImperativeHandle(ref, () => ({
    requestPip: async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        if (document.pictureInPictureElement === video) return;
        await video.requestPictureInPicture();
      } catch (e) { /* ignore */ }
    },
    exitPip: async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
      } catch (e) { /* ignore */ }
    },
    isPipSupported: () => {
      return typeof document !== 'undefined' && !!document.pictureInPictureEnabled;
    },
  }), []);

  // PiP enter/leave events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => onPipChange?.(true);
    const onLeave = () => onPipChange?.(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [onPipChange]);

  useEffect(() => {
    onFatalErrorRef.current = onFatalError;
  }, [onFatalError]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Setup HLS with optimized config
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setLoading(true);
    setBuffering(false);
    setError(null);
    setQualities([]);
    setCurrentQuality(-1);
    setAutoActiveLabel('');
    setIsLiveStream(false);
    recoveryAttemptsRef.current = 0;
    isLiveRef.current = false;
    lastProgressRef.current = { time: 0, checkedAt: Date.now(), recoveries: 0 };
    if (stallWatchdogRef.current) clearInterval(stallWatchdogRef.current);
    let hls: Hls | null = null;
    let nativeLoadedHandler: (() => void) | null = null;
    let nativeErrorHandler: (() => void) | null = null;

    video.preload = 'auto';
    video.autoplay = true;
    video.volume = initialVolumeRef.current;
    video.muted = initialMutedRef.current;
    video.setAttribute('playsinline', 'true');

    const safePlay = () => {
      try {
        // Try unmuted first if user prefers sound
        const tryPlay = video.play();
        if (tryPlay && typeof tryPlay.catch === 'function') {
          tryPlay.catch(() => {
            // Browser blocked autoplay with sound; fallback muted
            video.muted = true;
            setMuted(true);
            setNeedsUnmute(true);
            // Do NOT persist forced mute — keep user's preference intact
            video.play().catch(() => {});
          });
        }
      } catch { /* ignore */ }
    };

    const resumePosition = () => {
      const current = video.currentTime;
      return Number.isFinite(current) && current > 0 ? current : -1;
    };

    const startStallWatchdog = () => {
      if (stallWatchdogRef.current) clearInterval(stallWatchdogRef.current);
      stallWatchdogRef.current = setInterval(() => {
        if (!video || video.paused || video.ended || loadingRef.current) return;
        const now = Date.now();
        const last = lastProgressRef.current;
        const current = video.currentTime;
        if (Math.abs(current - last.time) > 0.25) {
          lastProgressRef.current = { time: current, checkedAt: now, recoveries: 0 };
          return;
        }
        // Only act after 12s of true stall to avoid interrupting normal playback
        if (now - last.checkedAt < 12000) return;

        setBuffering(true);
        lastProgressRef.current = { time: current, checkedAt: now, recoveries: last.recoveries + 1 };

        const hlsInstance = hlsRef.current;
        if (hlsInstance) {
          // For live streams: gently nudge to live edge if we've fallen far behind. Do NOT reload.
          if (isLiveRef.current) {
            const liveTarget = hlsInstance.liveSyncPosition;
            if (typeof liveTarget === 'number' && Number.isFinite(liveTarget) && liveTarget > 0 && current < liveTarget - 30) {
              try { video.currentTime = liveTarget; } catch { /* ignore */ }
            }
          }
          // Resume loading from CURRENT position (preserves playback). Never call recoverMediaError here
          // because it can reset position to 0 and make a live/VOD stream restart from the beginning.
          try { hlsInstance.startLoad(-1); } catch { /* ignore */ }
        }
        safePlay();
      }, 4000);
    };

    // Detect weak network → start bandwidth estimate low so ABR picks 360p/270p first
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; saveData?: boolean } }).connection;
    const effective = conn?.effectiveType || '';
    const downlink = typeof conn?.downlink === 'number' ? conn.downlink : 99;
    const isWeak = /^(slow-2g|2g|3g)$/i.test(effective) || downlink < 1.5 || conn?.saveData === true;
    const initialBwEstimate = isWeak ? 250_000 : 700_000;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        // Disable LL-HLS auto-detection: it caused stalls/restarts on regular streams whose URL contains "live"
        lowLatencyMode: false,
        // Buffer tuning: konservatif untuk sesi panjang (7+ jam) di perangkat mobile.
        // Back buffer pendek untuk menahan memory growth, max buffer cukup untuk smooth playback.
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.75,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 8,
        // ABR: mulai dari kualitas terendah supaya cepat play, lalu naikkan
        startLevel: -1,
        autoStartLoad: true,
        abrEwmaDefaultEstimate: initialBwEstimate,
        abrBandWidthFactor: 0.75,
        abrBandWidthUpFactor: 0.55,
        abrMaxWithRealBitrate: true,
        testBandwidth: true,
        capLevelToPlayerSize: true,
        // Retry stabil untuk sesi panjang dan penonton ramai
        manifestLoadingTimeOut: 18_000,
        manifestLoadingMaxRetry: 8,
        manifestLoadingRetryDelay: 800,
        manifestLoadingMaxRetryTimeout: 8_000,
        levelLoadingTimeOut: 18_000,
        levelLoadingMaxRetry: 8,
        levelLoadingRetryDelay: 800,
        levelLoadingMaxRetryTimeout: 8_000,
        fragLoadingTimeOut: 30_000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 800,
        fragLoadingMaxRetryTimeout: 10_000,
        // Stall detection
        maxStarvationDelay: 8,
        maxLoadingDelay: 8,
        // Hindari buffering ulang berlebihan
        appendErrorMaxRetry: 5,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 12,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLoading(false);
        const manifestLevels = (data.levels || []) as Array<{ details?: { live?: boolean }; height?: number; bitrate?: number }>;
        isLiveRef.current = manifestLevels.some(level => level.details?.live) || false;
        setIsLiveStream(isLiveRef.current);
        const levels: QualityLevel[] = manifestLevels.map((lvl, i) => ({
          index: i,
          label: lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 0) / 1000)}kbps`,
          height: lvl.height,
          bitrate: lvl.bitrate,
        }));
        levels.sort((a, b) => (b.height || 0) - (a.height || 0));
        setQualities([{ index: -1, label: 'Auto' }, ...levels]);
        // Restore saved quality preference
        if (userQualityRef.current && hls) {
          const match = levels.find(l => l.height === userQualityRef.current);
          if (match) {
            hls.currentLevel = match.index;
            hls.autoLevelCapping = match.index;
            hls.capLevelToPlayerSize = false;
            setCurrentQuality(match.index);
          }
        } else if (isWeak && hls) {
          // Weak network: cap ABR ceiling to lowest rendition <= 360p (fallback 270p) until network improves.
          // User can still pick higher manually; this only sets the *cap*, not a hard lock.
          const capCandidate = manifestLevels
            .map((lvl, i) => ({ i, h: lvl.height || 0 }))
            .filter(x => x.h > 0 && x.h <= 360)
            .sort((a, b) => b.h - a.h)[0];
          if (capCandidate) hls.autoLevelCapping = capCandidate.i;
        }
        safePlay();
      });
      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        const live = !!data.details?.live;
        isLiveRef.current = live;
        setIsLiveStream(live);
        if (!live) {
          const vodDuration = typeof data.details?.totalduration === 'number' ? data.details.totalduration : video.duration;
          if (Number.isFinite(vodDuration) && vodDuration > 0) setDuration(vodDuration);
        }
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (hls && hls.autoLevelEnabled) {
          const lvl = hls.levels[data.level];
          setAutoActiveLabel(lvl?.height ? `${lvl.height}p` : '');
        } else if (hls && userQualityRef.current) {
          // Enforce user's manual quality if hls.js drifted
          const lvl = hls.levels[data.level];
          if (lvl?.height && lvl.height !== userQualityRef.current) {
            const target = hls.levels.findIndex(l => l.height === userQualityRef.current);
            if (target >= 0 && target !== data.level) {
              try { hls.currentLevel = target; } catch { /* ignore */ }
            }
          }
        }
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR && data.response?.code && data.response.code >= 400) {
          setError('Sumber video tidak dapat diakses. Mencoba player lain…');
          setLoading(false);
          setBuffering(false);
          onFatalErrorRef.current?.();
          return;
        }
        // Non-fatal errors: let hls.js retry internally. Avoid media recovery here because it can restart/seek unexpectedly.
        if (!data.fatal) {
          return;
        }

        // Fatal: try to recover IN-PLACE, preserving currentTime.
        if (recoveryAttemptsRef.current < 3) {
          recoveryAttemptsRef.current += 1;
          const resumeTime = video.currentTime;
          const wasPlaying = !video.paused;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try {
              // Resume from current position; for live, -1 jumps to live edge (not start)
              hls?.startLoad(-1);
              if (wasPlaying) video.play().catch(() => {});
              return;
            } catch { /* ignore */ }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls?.recoverMediaError();
              // Restore the user's position after recovery (recoverMediaError can reset to 0)
              const restore = () => {
                if (!isLiveRef.current && resumeTime > 0 && Math.abs(video.currentTime - resumeTime) > 1) {
                  try { video.currentTime = resumeTime; } catch { /* ignore */ }
                }
                if (wasPlaying) video.play().catch(() => {});
              };
              video.addEventListener('loadedmetadata', restore, { once: true });
              // Also try after a short delay in case loadedmetadata doesn't fire
              setTimeout(restore, 800);
              return;
            } catch { /* ignore */ }
          }
        }
        setError('Gagal memuat video.');
        setLoading(false);
        setBuffering(false);
        onFatalErrorRef.current?.();
      });
      startStallWatchdog();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      nativeLoadedHandler = () => {
        setLoading(false);
        safePlay();
      };
      nativeErrorHandler = () => {
        setError('Gagal memuat video.');
        setLoading(false);
        onFatalErrorRef.current?.();
      };
      video.addEventListener('loadedmetadata', nativeLoadedHandler, { once: true });
      video.addEventListener('error', nativeErrorHandler, { once: true });
      startStallWatchdog();
    } else {
      setError('Browser ini tidak mendukung pemutaran HLS.');
      setLoading(false);
      onFatalErrorRef.current?.();
    }

    return () => {
      if (stallWatchdogRef.current) clearInterval(stallWatchdogRef.current);
      stallWatchdogRef.current = null;
      if (nativeLoadedHandler) video.removeEventListener('loadedmetadata', nativeLoadedHandler);
      if (nativeErrorHandler) video.removeEventListener('error', nativeErrorHandler);
      try { if (hls) hls.destroy(); } catch { /* ignore */ }
      hlsRef.current = null;
      // Reset native source to prevent leaked playback when switching providers
      try { video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
    };
  }, [src]);

  const selectQuality = (levelIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentQuality(levelIndex);
    setShowQualityMenu(false);
    if (levelIndex === -1) {
      // Auto: re-enable adaptive
      hlsRef.current.autoLevelCapping = -1;
      hlsRef.current.capLevelToPlayerSize = true;
      userQualityRef.current = null;
      try { localStorage.removeItem('replaytime-quality-height'); } catch { /* ignore */ }
    } else {
      const lvl = hlsRef.current.levels[levelIndex];
      const h = lvl?.height || null;
      // Lock the level so ABR/cap doesn't override user's choice
      hlsRef.current.autoLevelCapping = levelIndex;
      hlsRef.current.capLevelToPlayerSize = false;
      userQualityRef.current = h;
      if (h) try { localStorage.setItem('replaytime-quality-height', String(h)); } catch { /* ignore */ }
    }
  };

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => {
      const nextDuration = video.duration;
      if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
        setDuration(0);
        if (isLiveRef.current) setIsLiveStream(true);
        return;
      }
      setDuration(nextDuration);
      isLiveRef.current = false;
      setIsLiveStream(false);
    };
    const onWaiting = () => {
      // mid-play stall (not initial)
      if (!loadingRef.current) setBuffering(true);
    };
    const onPlaying = () => {
      setLoading(false);
      setBuffering(false);
      // Reset recovery counter on successful playback so future hiccups can recover too
      recoveryAttemptsRef.current = 0;
    };
    const onCanPlay = () => { setLoading(false); setBuffering(false); };
    const onLoadedMetadata = () => onDurationChange();
    const onProgress = () => {
      lastProgressRef.current = { time: video.currentTime, checkedAt: Date.now(), recoveries: 0 };
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('progress', onProgress);
    video.addEventListener('volumechange', onVolumeChange);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  // Fullscreen tracking (cross-browser)
  useEffect(() => {
    const onChange = () => setIsFullscreen(isFullscreenActive());
    return onFullscreenChange(onChange);
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !v.ended) setShowControls(false);
    }, 3000);
  }, []);

  const toggleControls = useCallback(() => {
    resetHideTimer();
  }, [resetHideTimer]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [resetHideTimer]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    resetHideTimer();
  };

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video || isLiveStream) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    resetHideTimer();
  };

  const seekTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video || isLiveStream || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, Number(e.target.value)));
    setCurrentTime(video.currentTime);
    resetHideTimer();
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Number(e.target.value);
    video.volume = v;
    if (v > 0 && video.muted) { video.muted = false; setNeedsUnmute(false); }
    try { localStorage.setItem('replaytime-volume', String(v)); } catch { /* ignore */ }
    try { localStorage.setItem('replaytime-muted', video.muted ? '1' : '0'); } catch { /* ignore */ }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted) {
      setNeedsUnmute(false);
      if (video.paused) video.play().catch(() => {});
    }
    try { localStorage.setItem('replaytime-muted', video.muted ? '1' : '0'); } catch { /* ignore */ }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreenActive()) requestFs(containerRef.current, videoRef.current);
    else exitFs();
  };

  if (error) {
    return (
      <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-6 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl bg-black group/player ${isFullscreen ? 'h-dvh' : ''} ${showControls || !isPlaying ? '' : 'cursor-none'}`}
      style={{ paddingBottom: isFullscreen ? '0' : '56.25%', height: isFullscreen ? '100dvh' : undefined }}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        playsInline
        onClick={toggleControls}
        title={title}
      />
      {watermark && <LiveWatermark code={watermark} />}

      {/* Initial loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm animate-fade-in">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="mt-3 text-sm font-medium text-white/90 animate-pulse">Menghubungkan ke server...</p>
        </div>
      )}

      {/* Mid-play buffering indicator (subtle, top-right) */}
      {!loading && buffering && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur px-3 py-1.5 pointer-events-none animate-fade-in">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          <span className="text-xs font-medium text-white/90">Memuat...</span>
        </div>
      )}

      {/* Unmute hint when browser blocked autoplay-with-sound */}
      {needsUnmute && muted && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg animate-fade-in"
        >
          🔊 Tap untuk aktifkan suara
        </button>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%, rgba(0,0,0,0.3) 100%)',
        }}
        onClick={(e) => {
          // Click on the empty overlay area (not on a control) toggles controls.
          if (e.target === e.currentTarget) toggleControls();
        }}
      >
        {!isPlaying && !loading && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center"
            aria-label="Play"
          >
            <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center backdrop-blur-sm transition-transform hover:scale-110">
              <Play className="w-10 h-10 text-primary-foreground ml-1" fill="currentColor" />
            </div>
          </button>
        )}

        <div className="relative z-10 px-2 sm:px-4 pb-2 sm:pb-4 space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5 sm:gap-2 text-white text-[10px] sm:text-xs min-w-0">
            <span className="w-10 sm:w-14 text-left shrink-0 tabular-nums">{isLiveStream ? 'LIVE' : formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={isLiveStream ? 1 : Math.max(1, duration || 1)}
              step={0.1}
              value={isLiveStream ? 0 : currentTime}
              onChange={seekTo}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              disabled={isLiveStream}
              className="min-w-0 flex-1 h-2 accent-primary cursor-pointer disabled:cursor-default disabled:opacity-70"
              style={{
                background: isLiveStream
                  ? 'linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) 100%)'
                  : `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${
                    duration ? (currentTime / duration) * 100 : 0
                  }%, rgba(255,255,255,0.3) ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.3) 100%)`,
                borderRadius: '999px',
                appearance: 'none',
              }}
            />
            <span className="w-10 sm:w-14 text-right shrink-0 tabular-nums">{isLiveStream ? 'ON AIR' : formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-2 min-w-0">
            <button type="button" onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="p-2 text-white hover:text-primary transition-colors shrink-0" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            {!hideSeekButtons && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); seek(-10); }} disabled={isLiveStream} className="p-2 text-white hover:text-primary transition-colors disabled:opacity-40 disabled:hover:text-current shrink-0" aria-label="Mundur 10 detik" title="Mundur 10 detik">
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); seek(10); }} disabled={isLiveStream} className="p-2 text-white hover:text-primary transition-colors disabled:opacity-40 disabled:hover:text-current shrink-0" aria-label="Maju 10 detik" title="Maju 10 detik">
                  <RotateCw className="w-5 h-5" />
                </button>
              </>
            )}

            <div className="flex items-center gap-0.5 sm:gap-1 group/volume shrink-0">
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleMute(); resetHideTimer(); }} className="p-2 text-white hover:text-primary transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={changeVolume}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="w-14 sm:w-20 h-2 accent-primary cursor-pointer hidden min-[360px]:block"
              />
            </div>

            <div className="flex-1" />

            {qualities.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowQualityMenu(v => !v); resetHideTimer(); }}
                  className="p-2 text-white hover:text-primary transition-colors flex items-center gap-1"
                  aria-label="Kualitas video"
                  title="Kualitas video"
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-[10px] font-medium hidden sm:inline">
                    {currentQuality === -1
                      ? `Auto${autoActiveLabel ? ` · ${autoActiveLabel}` : ''}`
                      : qualities.find(q => q.index === currentQuality)?.label || ''}
                  </span>
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 min-w-[140px] rounded-lg bg-card/95 backdrop-blur border border-border shadow-xl overflow-hidden z-30">
                    <div className="px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground border-b border-border">
                      Kualitas Video
                    </div>
                    {qualities.map(q => {
                      const active = currentQuality === q.index;
                      return (
                        <button
                          key={q.index}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); selectQuality(q.index); resetHideTimer(); }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors ${
                            active ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-secondary/60'
                          }`}
                        >
                          <span>
                            {q.label}
                            {q.index === -1 && autoActiveLabel && (
                              <span className="text-muted-foreground ml-1">({autoActiveLabel})</span>
                            )}
                          </span>
                          {active && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <button type="button" onClick={(e) => { e.stopPropagation(); toggleFullscreen(); resetHideTimer(); }} className="p-2 text-white hover:text-primary transition-colors" aria-label="Fullscreen">
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

HlsPlayer.displayName = 'HlsPlayer';

export default HlsPlayer;
