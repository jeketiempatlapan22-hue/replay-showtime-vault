// Sidik perangkat yang relatif sama di semua browser pada device yang sama
// (layar, zona waktu, CPU, memori, GPU). Dipakai game untuk membatasi 1 perangkat.
export async function getDeviceFp(): Promise<string> {
  const n = navigator as any;
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').replace(/\s*\(.*?\)\s*/g, '').replace(/ANGLE|Direct3D.*$/gi, '').trim().toLowerCase();
  } catch { /* ignore */ }
  const w = Math.max(screen.width, screen.height), h = Math.min(screen.width, screen.height);
  const raw = [w, h, Math.round((window.devicePixelRatio || 1) * 100), Intl.DateTimeFormat().resolvedOptions().timeZone,
    n.hardwareConcurrency || 0, n.maxTouchPoints || 0, gpu].join('|');
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  } catch { return raw.slice(0, 100); }
}
