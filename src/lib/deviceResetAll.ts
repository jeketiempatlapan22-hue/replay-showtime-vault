// Reset semua perangkat dari menu: kumpulkan seluruh akses live/membership milik
// penonton (akun + yang tersimpan di HP), lalu reset satu per satu lewat fungsi
// reset per-token yang sudah ada. Kuota 3x per hari, terisi ulang 00.00 WIB.
import { supabase } from '@/integrations/backend';
import { getBrowserId } from '@/lib/browserId';
import { readMembershipCredentials } from '@/lib/membershipAccess';
import { getAllShowPurchases } from '@/lib/purchases';

export const RESET_ALL_MAX_PER_DAY = 3;
const QUOTA_KEY = 'rt-reset-all-quota';

export interface ResetAllTarget {
  kind: 'show' | 'membership';
  token: string;
  password?: string;
  label: string;
}

/** Tanggal WIB (YYYY-MM-DD); hari baru dimulai pukul 00.00 WIB. */
export function wibDay(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}

export function quotaRemaining(raw: string | null, now = Date.now(), max = RESET_ALL_MAX_PER_DAY): number {
  try {
    const q = raw ? JSON.parse(raw) as { day?: string; used?: number } : null;
    const used = q && q.day === wibDay(now) ? Number(q.used || 0) : 0;
    return Math.max(0, max - used);
  } catch { return max; }
}

export function nextQuota(raw: string | null, now = Date.now()): string {
  const day = wibDay(now);
  let used = 0;
  try { const q = raw ? JSON.parse(raw) : null; if (q?.day === day) used = Number(q.used || 0); } catch { /* ignore */ }
  return JSON.stringify({ day, used: used + 1 });
}

export function getResetAllRemaining(): number {
  let raw: string | null = null;
  try { raw = localStorage.getItem(QUOTA_KEY); } catch { /* ignore */ }
  return quotaRemaining(raw);
}

function consumeResetAll() {
  try { localStorage.setItem(QUOTA_KEY, nextQuota(localStorage.getItem(QUOTA_KEY))); } catch { /* ignore */ }
}

export function dedupeTargets(list: ResetAllTarget[]): ResetAllTarget[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = `${t.kind}:${t.token}`;
    if (!t.token || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Semua akses live & membership (replay tidak terkunci perangkat). */
export async function collectResetTargets(userId?: string | null): Promise<ResetAllTarget[]> {
  const list: ResetAllTarget[] = [];
  const mem = readMembershipCredentials();
  if (mem?.token && mem.password) list.push({ kind: 'membership', token: mem.token, password: mem.password, label: 'Membership' });
  for (const p of Object.values(getAllShowPurchases())) {
    if (p?.token && p.kind === 'show') list.push({ kind: 'show', token: p.token, label: 'Akses Live' });
  }
  if (userId) {
    const [{ data: ms }, { data: orders }] = await Promise.all([
      supabase.rpc('get_my_memberships' as any),
      supabase.from('orders').select('access_token,item_title,show_id,replay_id')
        .eq('user_id', userId).eq('status', 'paid').not('access_token', 'is', null)
        .not('show_id', 'is', null).order('paid_at', { ascending: false }).limit(20),
    ]);
    for (const m of (Array.isArray(ms) ? ms : []) as any[]) {
      const expired = m.expires_at && new Date(m.expires_at).getTime() < Date.now();
      if (m.status === 'paid' && !m.revoked && m.token && m.password && !expired) {
        list.push({ kind: 'membership', token: m.token, password: m.password, label: `Membership · ${m.package_name || ''}`.trim() });
      }
    }
    for (const o of (orders || []) as any[]) {
      if (o.access_token && !o.replay_id) list.push({ kind: 'show', token: o.access_token, label: o.item_title || 'Akses Live' });
    }
  }
  return dedupeTargets(list);
}

export interface ResetAllResult { reset: number; skipped: number; failed: number }

export async function resetAllDevices(targets: ResetAllTarget[]): Promise<ResetAllResult> {
  const browser_id = getBrowserId();
  const results = await Promise.all(targets.map(async (t) => {
    const fn = t.kind === 'show' ? 'show-token-self-reset' : 'membership-self-reset';
    const body = t.kind === 'show' ? { token: t.token, browser_id } : { mtoken: t.token, mpassword: t.password, browser_id };
    try {
      const { data } = await supabase.functions.invoke(fn, { body });
      if (data?.ok) return 'reset';
      // Token multi-perangkat / kedaluwarsa / dicabut tidak perlu direset.
      return ['multi_device_no_reset', 'expired', 'revoked', 'token_not_found'].includes(data?.reason) ? 'skipped' : 'failed';
    } catch { return 'failed'; }
  }));
  const out = {
    reset: results.filter((r) => r === 'reset').length,
    skipped: results.filter((r) => r === 'skipped').length,
    failed: results.filter((r) => r === 'failed').length,
  };
  if (out.reset > 0) consumeResetAll();
  return out;
}
