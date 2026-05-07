// Lightweight prefetch helpers to warm browser cache for upcoming sources
// so that switching playlist or replays starts playback instantly.

const warmedManifests = new Set<string>();
const addedLinks = new Set<string>();

function ensureLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  if (typeof document === 'undefined') return;
  const key = `${rel}|${href}`;
  if (addedLinks.has(key)) return;
  const existing = document.head.querySelector(`link[rel="${rel}"][href="${href}"]`);
  if (existing) { addedLinks.add(key); return; }
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
  addedLinks.add(key);
}

export function preconnect(origin: string) {
  try {
    const u = new URL(origin);
    ensureLink('preconnect', u.origin, { crossorigin: '' });
    ensureLink('dns-prefetch', u.origin);
  } catch { /* ignore */ }
}

/** Warm an M3U8 manifest (and the first couple of segments if possible). */
export async function prefetchM3U8(url: string) {
  if (!url || warmedManifests.has(url)) return;
  warmedManifests.add(url);
  try {
    preconnect(url);
    const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!res.ok) return;
    const text = await res.text();
    // Parse first few segment URIs to warm them
    const lines = text.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
    const base = url.substring(0, url.lastIndexOf('/') + 1);
    const toFetch = lines.slice(0, 2).map(l => (l.startsWith('http') ? l : base + l));
    await Promise.all(
      toFetch.map(u =>
        fetch(u, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'force-cache' }).catch(() => {}),
      ),
    );
  } catch { /* ignore network errors */ }
}

export function prefetchYouTube(_id: string) {
  preconnect('https://www.youtube-nocookie.com');
  preconnect('https://i.ytimg.com');
  preconnect('https://yt3.ggpht.com');
  preconnect('https://www.google.com');
}

export function prefetchCloudflare(_uid: string) {
  preconnect('https://iframe.videodelivery.net');
  preconnect('https://videodelivery.net');
  preconnect('https://customer-cdn.cloudflarestream.com');
}
