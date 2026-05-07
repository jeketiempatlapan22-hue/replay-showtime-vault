import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, Loader2, Settings, Check } from 'lucide-react';

interface Props {
  src: string;
  title: string;
  onFatalError?: () => void;
  onPipChange?: (active: boolean) => void;
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

const HlsPlayer = forwardRef<HlsPlayerHandle, Props>(({ src, title, onFatalError, onPipChange }, ref) => {
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

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
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
    video.muted = true;
    video.setAttribute('playsinline', 'true');

    const safePlay = () => {
      try {
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
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
        if (now - last.checkedAt < 8000) return;

        setBuffering(true);
        lastProgressRef.current = { time: current, checkedAt: now, recoveries: last.recoveries + 1 };

        const hlsInstance = hlsRef.current;
        if (hlsInstance) {
          const liveTarget = isLiveRef.current ? hlsInstance.liveSyncPosition : null;
          if (typeof liveTarget === 'number' && Number.isFinite(liveTarget) && liveTarget > 0 && current < liveTarget - 18) {
            video.currentTime = liveTarget;
          }
          hlsInstance.startLoad(isLiveRef.current ? -1 : resumePosition());
          if (last.recoveries >= 2) hlsInstance.recoverMediaError();
        } else {
          video.load();
        }
        safePlay();
      }, 3000);
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: src.includes('.live') || src.includes('live'),
        // Buffer tuning untuk playback halus
        backBufferLength: 90,
        maxBufferLength: 90,
        maxMaxBufferLength: 180,
        maxBufferSize: 120 * 1000 * 1000,
        maxBufferHole: 0.75,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 8,
        // ABR: mulai dari kualitas terendah supaya cepat play, lalu naikkan
        startLevel: -1,
        autoStartLoad: true,
        abrEwmaDefaultEstimate: 700_000,
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
        // Autoplay (muted to satisfy browser policy). User can unmute manually.
        safePlay();
      });
      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        isLiveRef.current = !!data.details?.live;
        setIsLiveStream(!!data.details?.live);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (hls && hls.autoLevelEnabled) {
          const lvl = hls.levels[data.level];
          setAutoActiveLabel(lvl?.height ? `${lvl.height}p` : '');
        }
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        // Non-fatal errors: log only, hls.js handles internal retries.
        if (!data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttemptsRef.current < 2) {
            recoveryAttemptsRef.current += 1;
            try { hls?.recoverMediaError(); safePlay(); } catch { /* ignore */ }
          }
          return;
        }

        // Fatal: try to recover IN-PLACE, preserving currentTime.
        if (recoveryAttemptsRef.current < 3) {
          recoveryAttemptsRef.current += 1;
          const resumeTime = video.currentTime;
          const wasPlaying = !video.paused;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try {
              hls?.startLoad(isLiveRef.current ? -1 : resumeTime);
              if (wasPlaying) video.play().catch(() => {});
              return;
            } catch { /* ignore */ }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls?.recoverMediaError();
              // recoverMediaError preserves position; just resume play state
              if (wasPlaying) {
                const onReady = () => {
                  video.currentTime = resumeTime;
                  video.play().catch(() => {});
                  video.removeEventListener('loadedmetadata', onReady);
                };
                video.addEventListener('loadedmetadata', onReady, { once: true });
              }
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
      if (hls) hls.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  const selectQuality = (levelIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentQuality(levelIndex);
    setShowQualityMenu(false);
  };

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
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
    const onCanPlay = () => setBuffering(false);
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
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  // Fullscreen tracking
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [resetHideTimer]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video || isLiveStream) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
  };

  const seekTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video || isLiveStream) return;
    video.currentTime = Number(e.target.value);
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Number(e.target.value);
    video.volume = v;
    if (v > 0 && video.muted) video.muted = false;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
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
      className="relative w-full overflow-hidden rounded-xl bg-black group/player"
      style={{ paddingBottom: isFullscreen ? '0' : '56.25%', height: isFullscreen ? '100%' : undefined }}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        playsInline
        onClick={togglePlay}
        title={title}
      />

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

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%, rgba(0,0,0,0.3) 100%)',
        }}
      >
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {!isPlaying && !loading && (
            <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center backdrop-blur-sm transition-transform hover:scale-110">
              <Play className="w-10 h-10 text-primary-foreground ml-1" fill="currentColor" />
            </div>
          )}
        </button>

        <div className="relative z-10 px-3 sm:px-4 pb-3 sm:pb-4 space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-white text-xs">
            <span className="tabular-nums">{isLiveStream ? 'LIVE' : formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={isLiveStream ? 0 : currentTime}
              onChange={seekTo}
              disabled={isLiveStream}
              className="flex-1 h-1.5 accent-primary cursor-pointer disabled:cursor-default disabled:opacity-70"
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
            <span className="tabular-nums">{isLiveStream ? 'ON AIR' : formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button type="button" onClick={togglePlay} className="p-2 text-white hover:text-primary transition-colors" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button type="button" onClick={() => seek(-10)} disabled={isLiveStream} className="p-2 text-white hover:text-primary transition-colors disabled:opacity-40 disabled:hover:text-current" aria-label="Mundur 10 detik" title="Mundur 10 detik">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => seek(10)} disabled={isLiveStream} className="p-2 text-white hover:text-primary transition-colors disabled:opacity-40 disabled:hover:text-current" aria-label="Maju 10 detik" title="Maju 10 detik">
              <RotateCw className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1 group/volume">
              <button type="button" onClick={toggleMute} className="p-2 text-white hover:text-primary transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={changeVolume}
                className="w-16 sm:w-20 h-1 accent-primary cursor-pointer hidden sm:block"
              />
            </div>

            <div className="flex-1" />

            {qualities.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowQualityMenu(v => !v)}
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
                          onClick={() => selectQuality(q.index)}
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

            <button type="button" onClick={toggleFullscreen} className="p-2 text-white hover:text-primary transition-colors" aria-label="Fullscreen">
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
