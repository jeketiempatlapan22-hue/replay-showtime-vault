import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, Loader2, Settings, Check } from 'lucide-react';

interface Props {
  src: string;
  title: string;
  onFatalError?: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface QualityLevel {
  index: number; // -1 = auto
  label: string;
  height?: number;
  bitrate?: number;
}

export default function HlsPlayer({ src, title, onFatalError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [autoActiveLabel, setAutoActiveLabel] = useState<string>('');
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Setup HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setLoading(true);
    setError(null);
    setQualities([]);
    setCurrentQuality(-1);
    setAutoActiveLabel('');
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLoading(false);
        const levels: QualityLevel[] = (data.levels || []).map((lvl, i) => ({
          index: i,
          label: lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 0) / 1000)}kbps`,
          height: lvl.height,
          bitrate: lvl.bitrate,
        }));
        levels.sort((a, b) => (b.height || 0) - (a.height || 0));
        setQualities([{ index: -1, label: 'Auto' }, ...levels]);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (hls && hls.autoLevelEnabled) {
          const lvl = hls.levels[data.level];
          setAutoActiveLabel(lvl?.height ? `${lvl.height}p` : '');
        }
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError('Gagal memuat video.');
          setLoading(false);
          onFatalError?.();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => setLoading(false), { once: true });
      video.addEventListener('error', () => {
        setError('Gagal memuat video.');
        setLoading(false);
        onFatalError?.();
      }, { once: true });
    } else {
      setError('Browser ini tidak mendukung pemutaran HLS.');
      setLoading(false);
      onFatalError?.();
    }

    return () => {
      if (hls) hls.destroy();
      hlsRef.current = null;
    };
  }, [src, onFatalError]);

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
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
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
    video.addEventListener('volumechange', onVolumeChange);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  // Fullscreen tracking
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Auto-hide controls
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
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
  };

  const seekTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
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

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
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
        {/* Center play button */}
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

        {/* Bottom controls */}
        <div className="relative z-10 px-3 sm:px-4 pb-3 sm:pb-4 space-y-2" onClick={(e) => e.stopPropagation()}>
          {/* Progress bar */}
          <div className="flex items-center gap-2 text-white text-xs">
            <span className="tabular-nums">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={seekTo}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${
                  duration ? (currentTime / duration) * 100 : 0
                }%, rgba(255,255,255,0.3) ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.3) 100%)`,
                borderRadius: '999px',
                appearance: 'none',
              }}
            />
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 text-white hover:text-primary transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => seek(-10)}
              className="p-2 text-white hover:text-primary transition-colors"
              aria-label="Mundur 10 detik"
              title="Mundur 10 detik"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => seek(10)}
              className="p-2 text-white hover:text-primary transition-colors"
              aria-label="Maju 10 detik"
              title="Maju 10 detik"
            >
              <RotateCw className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1 group/volume">
              <button
                type="button"
                onClick={toggleMute}
                className="p-2 text-white hover:text-primary transition-colors"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
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

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 text-white hover:text-primary transition-colors"
              aria-label="Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
