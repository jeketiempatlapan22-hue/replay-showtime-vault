// Sesi TV: menjaga tayangan di browser TV tetap hidup (rotasi grant tiap 28 menit),
// dan menyiapkan alamat sementara untuk Chromecast.

import { supabase } from '@/integrations/backend';

export const SS_UNLOCK_BASE = 'replaytime-live-unlocked';
const SS_TV_SESSION = 'replaytime-tv-session';

// Grant TV berlaku 35 menit → rotasi 28 menit agar tidak pernah ada jeda.
export const TV_ROTATE_MS = 28 * 60 * 1000;

export function unlockKey(showId?: string) {
  return `${SS_UNLOCK_BASE}${showId ? `-${showId}` : ''}`;
}

export function readUnlockPayload(showId?: string): Record<string, unknown> | null {
  try {
    let raw = sessionStorage.getItem(unlockKey(showId)) || '';
    if (!raw) {
      const matches: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i) || '';
        if (k === SS_UNLOCK_BASE || k.startsWith(`${SS_UNLOCK_BASE}-`)) matches.push(k);
      }
      // Jangan pernah memilih akses show lain secara acak. Fallback hanya aman
      // saat memang ada satu-satunya payload akses di tab ini.
      if (matches.length === 1) raw = sessionStorage.getItem(matches[0]) || '';
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function saveTvSession(token: string) {
  try { sessionStorage.setItem(SS_TV_SESSION, token); } catch { /* ignore */ }
}

export function getTvSession(): string {
  try { return sessionStorage.getItem(SS_TV_SESSION) || ''; } catch { return ''; }
}

export function clearTvSession() {
  try { sessionStorage.removeItem(SS_TV_SESSION); } catch { /* ignore */ }
}

/** Minta grant baru untuk sesi TV. Mengembalikan grant baru atau '' bila gagal. */
export async function renewTvGrant(showId?: string): Promise<string> {
  const session = getTvSession();
  if (!session) return '';
  try {
    const { data } = await supabase.functions.invoke('tv-pair', {
      body: { action: 'renew', session_token: session },
    });
    if (!data?.ok || !data?.grant) {
      if (data?.error === 'session_invalid' || data?.error === 'session_expired') clearTvSession();
      return '';
    }
    try {
      // ID show dari server adalah sumber kebenaran sesi TV.
      const resolvedShowId = String(data.show_id || showId || '');
      const key = unlockKey(resolvedShowId);
      const prev = readUnlockPayload(resolvedShowId) || {};
      sessionStorage.setItem(key, JSON.stringify({ ...prev, ...(data.payload || {}), grant: data.grant }));
    } catch { /* ignore */ }
    return String(data.grant);
  } catch {
    return '';
  }
}

/** Alamat sementara yang bisa dibuka Chromecast (server yang menempelkan kredensial). */
export async function requestCastUrl(grant: string): Promise<string> {
  if (!grant) return '';
  try {
    const { data } = await supabase.functions.invoke('tv-pair', {
      body: { action: 'cast', grant },
    });
    return data?.ok && data?.url ? String(data.url) : '';
  } catch {
    return '';
  }
}
