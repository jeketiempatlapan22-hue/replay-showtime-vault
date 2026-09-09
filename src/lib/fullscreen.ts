// Cross-browser fullscreen helpers (Chrome/Firefox/Safari/Edge/iOS/Android/TV browsers)
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyEl = any;

export function isFullscreenActive(): boolean {
  const d = document as AnyEl;
  return !!(d.fullscreenElement || d.webkitFullscreenElement || d.webkitCurrentFullScreenElement || d.mozFullScreenElement || d.msFullscreenElement);
}

/** iOS <video> yang sedang tampil fullscreen native tidak terdaftar di document.fullscreenElement. */
export function isVideoFullscreen(video?: HTMLVideoElement | null): boolean {
  const v = video as AnyEl;
  return !!(v && (v.webkitDisplayingFullscreen || v.webkitPresentationMode === 'fullscreen'));
}

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Minta fullscreen. Mengembalikan true bila benar-benar aktif (native element
 * fullscreen ATAU fullscreen native <video> ala iOS), false bila ditolak browser
 * sehingga pemanggil bisa memakai fallback fullscreen CSS.
 */
export async function requestFs(el: HTMLElement, fallbackVideo?: HTMLVideoElement | null): Promise<boolean> {
  const e = el as AnyEl;
  const attempts: Array<() => any> = [];
  if (e.requestFullscreen) attempts.push(() => e.requestFullscreen({ navigationUI: 'hide' }));
  if (e.requestFullscreen) attempts.push(() => e.requestFullscreen());
  if (e.webkitRequestFullscreen) attempts.push(() => e.webkitRequestFullscreen());
  if (e.webkitRequestFullScreen) attempts.push(() => e.webkitRequestFullScreen());
  if (e.mozRequestFullScreen) attempts.push(() => e.mozRequestFullScreen());
  if (e.msRequestFullscreen) attempts.push(() => e.msRequestFullscreen());

  for (const run of attempts) {
    try {
      await run();
    } catch { /* coba cara berikutnya */ }
    if (isFullscreenActive()) return true;
    await wait(60);
    if (isFullscreenActive()) return true;
  }

  // iOS Safari: hanya elemen <video> yang bisa fullscreen.
  const v = fallbackVideo as AnyEl;
  if (v?.webkitEnterFullscreen) {
    try {
      v.webkitEnterFullscreen();
      await wait(120);
      if (isFullscreenActive() || isVideoFullscreen(fallbackVideo)) return true;
    } catch { /* ignore */ }
  }
  return isFullscreenActive();
}

export async function exitFs(video?: HTMLVideoElement | null) {
  const d = document as AnyEl;
  try {
    if (d.exitFullscreen) return await d.exitFullscreen();
    if (d.webkitExitFullscreen) return d.webkitExitFullscreen();
    if (d.webkitCancelFullScreen) return d.webkitCancelFullScreen();
    if (d.mozCancelFullScreen) return d.mozCancelFullScreen();
    if (d.msExitFullscreen) return d.msExitFullscreen();
  } catch { /* ignore */ }
  const v = video as AnyEl;
  if (v?.webkitExitFullscreen) { try { v.webkitExitFullscreen(); } catch { /* ignore */ } }
}

/** Perangkat layar sentuh kecil — hanya di sini rotasi paksa masuk akal. */
export function isMobileLike(): boolean {
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    const small = Math.min(window.innerWidth, window.innerHeight) <= 900;
    return !!coarse && small;
  } catch { return false; }
}

/**
 * Kunci/lepas orientasi landscape. Aman dipanggil di PC & iOS: API yang tidak
 * didukung atau ditolak (butuh fullscreen, desktop, dsb.) diabaikan diam-diam.
 */
export async function lockLandscape(on: boolean): Promise<void> {
  try {
    const so = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void>; unlock?: () => void; type?: string } }).orientation;
    if (!so) return;
    if (!on) { try { so.unlock?.(); } catch { /* ignore */ } return; }
    if (!isMobileLike()) return;
    if (typeof so.lock !== 'function') return;
    await so.lock('landscape').catch(() => undefined);
  } catch { /* ignore */ }
}

export function onFullscreenChange(handler: () => void): () => void {
  const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange', 'webkitbeginfullscreen', 'webkitendfullscreen'];
  events.forEach(ev => document.addEventListener(ev, handler, true));
  return () => events.forEach(ev => document.removeEventListener(ev, handler, true));
}
