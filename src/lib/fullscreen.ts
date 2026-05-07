// Cross-browser fullscreen helpers (Chrome/Firefox/Safari/Edge/iOS/Android/TV browsers)
type AnyEl = any;

export function isFullscreenActive(): boolean {
  const d = document as AnyEl;
  return !!(d.fullscreenElement || d.webkitFullscreenElement || d.webkitCurrentFullScreenElement || d.mozFullScreenElement || d.msFullscreenElement);
}

export async function requestFs(el: HTMLElement, fallbackVideo?: HTMLVideoElement | null) {
  const e = el as AnyEl;
  try {
    if (e.requestFullscreen) return await e.requestFullscreen({ navigationUI: 'hide' as any }).catch(() => e.requestFullscreen());
    if (e.webkitRequestFullscreen) return e.webkitRequestFullscreen();
    if (e.webkitRequestFullScreen) return e.webkitRequestFullScreen();
    if (e.mozRequestFullScreen) return e.mozRequestFullScreen();
    if (e.msRequestFullscreen) return e.msRequestFullscreen();
  } catch { /* ignore */ }
  // iOS Safari fallback: video element only
  const v = fallbackVideo as AnyEl;
  if (v?.webkitEnterFullscreen) { try { v.webkitEnterFullscreen(); } catch { /* ignore */ } }
}

export async function exitFs() {
  const d = document as AnyEl;
  try {
    if (d.exitFullscreen) return await d.exitFullscreen();
    if (d.webkitExitFullscreen) return d.webkitExitFullscreen();
    if (d.webkitCancelFullScreen) return d.webkitCancelFullScreen();
    if (d.mozCancelFullScreen) return d.mozCancelFullScreen();
    if (d.msExitFullscreen) return d.msExitFullscreen();
  } catch { /* ignore */ }
}

export function onFullscreenChange(handler: () => void): () => void {
  const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  events.forEach(ev => document.addEventListener(ev, handler));
  return () => events.forEach(ev => document.removeEventListener(ev, handler));
}
