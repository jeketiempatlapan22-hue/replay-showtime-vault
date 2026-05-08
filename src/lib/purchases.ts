// Persistent purchase records in localStorage.
// Survives across sessions so a user does not need to repurchase access.

export interface ShowPurchase {
  token: string;
  kind: 'show' | 'replay';
  paidAt: number;
}

export interface ReplayPurchase {
  token: string;
  password?: string;
  paidAt: number;
}

const SHOW_KEY = 'replaytime-show-purchased';
const REPLAY_KEY = 'replaytime-replay-purchased';

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, T> : {};
  } catch { return {}; }
}

function writeMap<T>(key: string, map: Record<string, T>) {
  try { localStorage.setItem(key, JSON.stringify(map)); } catch { /* ignore */ }
}

export function getShowPurchase(showId: string): ShowPurchase | null {
  return readMap<ShowPurchase>(SHOW_KEY)[showId] || null;
}

export function setShowPurchase(showId: string, value: ShowPurchase) {
  const map = readMap<ShowPurchase>(SHOW_KEY);
  map[showId] = value;
  writeMap(SHOW_KEY, map);
  try { window.dispatchEvent(new Event('replaytime-purchases-updated')); } catch { /* ignore */ }
}

export function getReplayPurchase(replayId: string): ReplayPurchase | null {
  return readMap<ReplayPurchase>(REPLAY_KEY)[replayId] || null;
}

export function setReplayPurchase(replayId: string, value: ReplayPurchase) {
  const map = readMap<ReplayPurchase>(REPLAY_KEY);
  map[replayId] = value;
  writeMap(REPLAY_KEY, map);
  try { window.dispatchEvent(new Event('replaytime-purchases-updated')); } catch { /* ignore */ }
}

export function getAllReplayPurchases(): Record<string, ReplayPurchase> {
  return readMap<ReplayPurchase>(REPLAY_KEY);
}
