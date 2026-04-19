// Stable browser fingerprint stored in localStorage.
// Used to identify a user's browser for the DevTools block system.

const KEY = 'replaytime-browser-id';

export function getBrowserId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}
