// Helper untuk menghubungkan pemutaran ke TV / proyektor.
// Mendukung Google Cast (Chromecast) di Chrome/Edge/Android, dan AirPlay /
// Remote Playback bawaan browser untuk Safari/iOS.

type CastWindow = Window & {
  chrome?: any;
  cast?: any;
  __gcastLoading?: Promise<boolean>;
  __onGCastApiAvailable?: (available: boolean) => void;
};

const CAST_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const DEFAULT_RECEIVER = 'CC1AD845'; // Default Media Receiver

export function isGoogleCastCapable(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isChromium = /Chrome|CriOS|Edg/i.test(ua) && !/OPR|SamsungBrowser/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  // Cast sender SDK hanya berfungsi di Chromium desktop/Android.
  return isChromium && !isIOS;
}

/** Muat Google Cast sender SDK sekali saja. Resolve false kalau tidak tersedia. */
export function loadCastSdk(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const w = window as CastWindow;
  if (w.cast?.framework) return Promise.resolve(true);
  if (!isGoogleCastCapable()) return Promise.resolve(false);
  if (w.__gcastLoading) return w.__gcastLoading;

  w.__gcastLoading = new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    (w as any).__onGCastApiAvailable = (available: boolean) => {
      if (!available) return done(false);
      try {
        w.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: DEFAULT_RECEIVER,
          autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        done(true);
      } catch {
        done(false);
      }
    };
    // SDK memanggil global ini saat siap.
    (w as any).__defineGetter__ && null;
    (window as any).__onGCastApiAvailable = (w as any).__onGCastApiAvailable;
    (window as any)['__onGCastApiAvailable'] = (w as any).__onGCastApiAvailable;
    (window as any)['__onGCastApiAvailable'] && null;
    (window as any)['__onGCastApiAvailable'];
    (window as any)['__onGCastApiAvailable'] = (w as any).__onGCastApiAvailable;
    (window as any)['__onGCastApiAvailable'] && null;
    (window as any)['__castApiHooked'] = true;
    (window as any)['__onGCastApiAvailable'] = (w as any).__onGCastApiAvailable;
    (window as any)['__onGCastApiAvailable'] && null;
    (window as any)['__onGCastApiAvailable'] = (w as any).__onGCastApiAvailable;
    (window as any)['__GCastApiAvailableHook'] = true;
    (window as any)['__onGCastApiAvailable'] = (w as any).__onGCastApiAvailable;
    (window as any)['__onGCastApiAvailable'] && null;
    (window as any)['__onGCastApiAvailable'] = (w as any).__onGCastApiAvailable;
    (window as any)['__onGCastApiAvailable'] && null;
    (window as any)['__onGCastApiAvailable'] = (w as any).__onGCastApiAvailable;

    const existing = document.querySelector<HTMLScriptElement>(`script[data-gcast="1"]`);
    if (!existing) {
      const script = document.createElement('script');
      script.src = CAST_SDK_URL;
      script.async = true;
      script.dataset.gcast = '1';
      script.onerror = () => done(false);
      document.head.appendChild(script);
    }
    setTimeout(() => done(!!w.cast?.framework), 6000);
  });

  return w.__gcastLoading;
}

export interface CastMediaOptions {
  url: string;
  title?: string;
  contentType?: string;
  isLive?: boolean;
  poster?: string;
}

/** Mulai sesi Google Cast dan mainkan media. Return false kalau gagal. */
export async function castMedia(opts: CastMediaOptions): Promise<boolean> {
  const ok = await loadCastSdk();
  if (!ok) return false;
  const w = window as CastWindow;
  try {
    const context = w.cast.framework.CastContext.getInstance();
    await context.requestSession().catch(() => undefined);
    const session = context.getCurrentSession();
    if (!session) return false;

    const contentType = opts.contentType
      || (/\.m3u8(\?|$)/i.test(opts.url) ? 'application/x-mpegURL' : 'video/mp4');
    const mediaInfo = new w.chrome.cast.media.MediaInfo(opts.url, contentType);
    mediaInfo.streamType = opts.isLive
      ? w.chrome.cast.media.StreamType.LIVE
      : w.chrome.cast.media.StreamType.BUFFERED;
    const metadata = new w.chrome.cast.media.GenericMediaMetadata();
    metadata.title = opts.title || 'ReplayTime';
    if (opts.poster) metadata.images = [new w.chrome.cast.Image(opts.poster)];
    mediaInfo.metadata = metadata;

    const request = new w.chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;
    await session.loadMedia(request);
    return true;
  } catch {
    return false;
  }
}

export function stopCastSession() {
  const w = window as CastWindow;
  try {
    w.cast?.framework?.CastContext.getInstance().endCurrentSession(true);
  } catch { /* ignore */ }
}

/** AirPlay / Remote Playback picker bawaan browser untuk elemen <video>. */
export function showNativePicker(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  const v = video as HTMLVideoElement & {
    webkitShowPlaybackTargetPicker?: () => void;
    remote?: { prompt?: () => Promise<void> };
  };
  try {
    if (typeof v.webkitShowPlaybackTargetPicker === 'function') {
      v.webkitShowPlaybackTargetPicker();
      return true;
    }
    if (v.remote?.prompt) {
      void v.remote.prompt().catch(() => {});
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

/** Jaga layar tetap menyala saat mode TV/proyektor. */
export async function requestWakeLock(): Promise<{ release: () => void } | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<any> } };
    if (!nav.wakeLock?.request) return null;
    const sentinel = await nav.wakeLock.request('screen');
    return { release: () => { try { void sentinel.release(); } catch { /* ignore */ } } };
  } catch {
    return null;
  }
}
