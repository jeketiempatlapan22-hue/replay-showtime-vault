// Stable browser fingerprint stored in localStorage.
// Used to identify a user's browser for the DevTools block system.

const KEY = 'replaytime-browser-id';
let memoryId = '';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getBrowserId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch { /* storage may be blocked on iOS/private mode */ }

  try {
    const saved = document.cookie.split('; ').find((part) => part.startsWith(`${KEY}=`))?.slice(KEY.length + 1);
    if (saved) return decodeURIComponent(saved);
    const id = createId();
    document.cookie = `${KEY}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
    return id;
  } catch { /* cookies may also be unavailable */ }

  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) { id = createId(); sessionStorage.setItem(KEY, id); }
    return id;
  } catch {
    if (!memoryId) memoryId = createId();
    return memoryId;
  }
}
