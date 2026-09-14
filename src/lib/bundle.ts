// Bundel Show: satu link + satu sandi untuk semua show yang tersedia.
import { supabase } from '@/integrations/supabase/client';
import { setShowPurchase } from '@/lib/purchases';

export interface ShowBundle {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  price_idr: number;
  price_coins: number;
  show_count: number;
  show_ids: string[];
}

export const BUNDLE_TOKEN_KEY = 'replaytime-bundle-token';

export async function getShowBundle(): Promise<ShowBundle | null> {
  const { data, error } = await (supabase as any).rpc('get_show_bundle');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || 'Bundel Semua Show',
    description: row.description || '',
    is_active: !!row.is_active,
    price_idr: Number(row.price_idr || 0),
    price_coins: Number(row.price_coins || 0),
    show_count: Number(row.show_count || 0),
    show_ids: (row.show_ids || []) as string[],
  };
}

export function rememberBundleToken(token: string) {
  if (!token) return;
  try { localStorage.setItem(BUNDLE_TOKEN_KEY, token); } catch { /* ignore */ }
}

export function getBundleToken(): string {
  try { return localStorage.getItem(BUNDLE_TOKEN_KEY) || ''; } catch { return ''; }
}

/** Simpan sub-token bundel per show supaya tiap kartu show langsung "Tonton". */
export function persistBundleShowTokens(map: Record<string, string>) {
  let changed = false;
  for (const [showId, token] of Object.entries(map || {})) {
    if (!token) continue;
    setShowPurchase(showId, { token, kind: 'show', paidAt: Date.now() });
    changed = true;
  }
  if (changed) {
    try { window.dispatchEvent(new Event('replaytime-purchases-updated')); } catch { /* ignore */ }
  }
}

export interface BundleAccess {
  ok: boolean;
  token: string;
  password: string;
  link: string;
  shows: { id: string; title: string; token: string; link: string; replay_link?: string }[];
}

/** Tukar token bundel menjadi akses semua show (dipakai link `?bt=`). */
export async function claimBundleToken(token: string): Promise<BundleAccess | null> {
  if (!token) return null;
  try {
    const { data } = await supabase.functions.invoke('get-access-info', { body: { token } });
    const d = data as any;
    if (!d?.ok || !d?.bundle) return null;
    const shows = (d.shows || []) as BundleAccess['shows'];
    persistBundleShowTokens(Object.fromEntries(shows.map((s) => [s.id, s.token])));
    rememberBundleToken(token);
    return { ok: true, token, password: String(d.password || ''), link: String(d.link || ''), shows };
  } catch {
    return null;
  }
}
