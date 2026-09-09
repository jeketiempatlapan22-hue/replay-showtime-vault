// Sesi TV: menjaga tayangan di browser TV tetap hidup (rotasi grant tiap 28 menit),
// dan menyiapkan alamat sementara untuk Chromecast.

import { supabase } from '@/integrations/supabase/client';

export const SS_UNLOCK_BASE = 'replaytime-live-unlocked';
const SS_TV_SESSION = 'replaytime-tv-session';

// Grant TV berlaku 35 menit → rotasi 28 menit agar tidak pernah ada jeda.
export const TV_ROTATE_MS = 28 * 60 * 1000;

export function unlockKey(showId?: string) {
  return `${SS_UNLOCK_BASE}${showId ? `-${showId}` : ''}`;
}

export function readUnlockPayload(showId?: string): Record<string, any> | null {
  try {
    let raw = sessionStorage.getItem(unlockKey(showId)) || '';
    if (!raw) {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i) || '';
        if (k.startsWith(SS_UNLOCK_BASE)) { raw = sessionStorage.getItem(k) || ''; break; }
      }
    }
    return raw ? JSON.parse(raw) : null;
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
      const key = unlockKey(showId || data.show_id || '');
      const prev = readUnlockPayload(showId || data.show_id || '') || {};
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
