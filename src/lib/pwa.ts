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

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const inIframe = window.self !== window.top;
  const swOff = new URLSearchParams(window.location.search).get('sw') === 'off';
  const blocked = !import.meta.env.PROD || inIframe || swOff || isPreviewHost(window.location.hostname);

  if (blocked) {
    void unregisterAppSw();
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch(() => {});
  });
}
