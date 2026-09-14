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
  theme: string;
  promo_label: string;
  discount_idr: number;
  discount_coins: number;
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
    theme: String(row.theme || 'gold'),
    promo_label: String(row.promo_label || ''),
    discount_idr: Number(row.discount_idr || 0),
    discount_coins: Number(row.discount_coins || 0),
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

export interface BundleTheme {
  label: string;
  wrap: string;
  glow: string;
  badge: string;
  accent: string;
}

/** Preset tema kartu bundel (semua memakai token semantik + utilitas Tailwind). */
export const BUNDLE_THEMES: Record<string, BundleTheme> = {
  gold: {
    label: 'Emas',
    wrap: 'from-amber-500/20 via-amber-400/10 to-transparent border-amber-500/50',
    glow: 'shadow-[0_0_30px_-10px_hsl(45_93%_47%/0.7)]',
    badge: 'bg-amber-500 text-black',
    accent: 'text-amber-600 dark:text-amber-400',
  },
  neon: {
    label: 'Ungu Neon',
    wrap: 'from-fuchsia-500/20 via-violet-500/10 to-transparent border-fuchsia-500/50',
    glow: 'shadow-[0_0_30px_-10px_hsl(292_84%_61%/0.7)]',
    badge: 'bg-fuchsia-500 text-white',
    accent: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
  ocean: {
    label: 'Biru Laut',
    wrap: 'from-sky-500/20 via-cyan-500/10 to-transparent border-sky-500/50',
    glow: 'shadow-[0_0_30px_-10px_hsl(199_89%_48%/0.7)]',
    badge: 'bg-sky-500 text-white',
    accent: 'text-sky-600 dark:text-sky-400',
  },
  fire: {
    label: 'Merah Api',
    wrap: 'from-rose-500/20 via-orange-500/10 to-transparent border-rose-500/50',
    glow: 'shadow-[0_0_30px_-10px_hsl(347_77%_50%/0.7)]',
    badge: 'bg-rose-500 text-white',
    accent: 'text-rose-600 dark:text-rose-400',
  },
  neutral: {
    label: 'Netral',
    wrap: 'from-primary/15 via-primary/5 to-transparent border-primary/40',
    glow: 'shadow-[0_0_30px_-12px_hsl(var(--primary)/0.7)]',
    badge: 'bg-primary text-primary-foreground',
    accent: 'text-primary',
  },
};

export function bundleTheme(key?: string): BundleTheme {
  return BUNDLE_THEMES[key || 'gold'] || BUNDLE_THEMES.gold;
}
