// Registrasi service worker untuk PWA (install + offline shell).
// Hanya aktif di produksi & bukan di preview/iframe Lovable.

const SW_URL = '/sw.js';

function isPreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith('id-preview--') ||
    hostname.startsWith('preview--') ||
    hostname === 'lovableproject.com' ||
    hostname.endsWith('.lovableproject.com') ||
    hostname === 'lovableproject-dev.com' ||
    hostname.endsWith('.lovableproject-dev.com') ||
    hostname === 'beta.lovable.dev' ||
    hostname.endsWith('.beta.lovable.dev')
  );
}

async function unregisterAppSw() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => (r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '').endsWith(SW_URL))
        .map((r) => r.unregister())
    );
  } catch { /* ignore */ }
}

// Cache lama (versi awal PWA) memakai strategi CacheFirst untuk file JS/CSS,
// sehingga rilis baru tidak pernah terlihat. Hapus sekali agar user keluar dari
// kondisi "website tidak berubah walau sudah publish".
async function purgeLegacyCaches() {
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k === 'static-assets').map((k) => caches.delete(k)));
  } catch { /* ignore */ }
}

function watchForUpdates(reg: ServiceWorkerRegistration) {
  // Cek update tiap 5 menit + saat tab kembali aktif.
  const check = () => { reg.update().catch(() => {}); };
  window.setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const inIframe = window.self !== window.top;
  const swOff = new URLSearchParams(window.location.search).get('sw') === 'off';
  const blocked = !import.meta.env.PROD || inIframe || swOff || isPreviewHost(window.location.hostname);

  if (blocked) {
    void unregisterAppSw();
    void purgeLegacyCaches();
    return;
  }

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    // Jangan ganggu user yang sedang menonton.
    const watching = location.pathname.startsWith('/live') ||
      Array.from(document.querySelectorAll('video')).some((v) => !v.paused && !v.ended) ||
      !!document.querySelector('iframe[src*="youtube"]');
    if (!watching) window.location.reload();
  });

  window.addEventListener('load', () => {
    void purgeLegacyCaches();
    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((reg) => watchForUpdates(reg))
      .catch(() => {});
  });
}
