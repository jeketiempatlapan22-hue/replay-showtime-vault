// Sinkronisasi pembelian (QRIS / koin / approval admin) dari server ke localStorage.
// Berlaku untuk user login maupun anonim (dicocokkan lewat nomor WhatsApp terakhir).
import { supabase } from '@/integrations/supabase/client';
import { getShowPurchase, setShowPurchase, getReplayPurchase, setReplayPurchase } from '@/lib/purchases';

let lastRun = 0;

/** Nomor WhatsApp terakhir yang dipakai membeli (dipakai untuk user anon). */
export function getSyncPhone(): string {
  const keys = ['replaytime-phone', 'replaytime-last-phone', 'replaytime-wa'];
  for (const k of keys) {
    try {
      const v = (localStorage.getItem(k) || '').trim();
      if (v) return v;
    } catch { /* ignore */ }
  }
  return '';
}

export function rememberSyncPhone(phone: string) {
  const v = String(phone || '').trim();
  if (!v) return;
  try { localStorage.setItem('replaytime-phone', v); } catch { /* ignore */ }
}

export async function syncPurchases(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastRun < 10_000) return;
  lastRun = now;

  const phone = getSyncPhone();

  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = !!sessionData?.session;
  if (!hasSession && !phone) return;

  try {
    const { data, error } = await supabase.functions.invoke('my-purchases', { body: { phone } });
    if (error) return;
    const r = data as any;
    if (!r?.ok) return;

    let changed = false;
    for (const [showId, v] of Object.entries<any>(r.shows || {})) {
      if (!v?.token) continue;
      if (getShowPurchase(showId)?.token === v.token) continue;
      setShowPurchase(showId, { token: v.token, kind: v.kind === 'replay' ? 'replay' : 'show', paidAt: Date.now() });
      changed = true;
    }
    for (const [replayId, v] of Object.entries<any>(r.replays || {})) {
      if (!v?.token) continue;
      if (getReplayPurchase(replayId)?.token === v.token) continue;
      setReplayPurchase(replayId, { token: v.token, paidAt: Date.now() });
      changed = true;
    }
    if (changed) {
      try { window.dispatchEvent(new Event('replaytime-purchases-updated')); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}
