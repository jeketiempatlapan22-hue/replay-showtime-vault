// Sinkronisasi pembelian (QRIS / koin / approval admin) dari server ke localStorage.
// Berlaku untuk user login maupun anonim (dicocokkan lewat nomor WhatsApp terakhir).
import { supabase } from '@/integrations/supabase/client';
import { getShowPurchase, setShowPurchase, getReplayPurchase, setReplayPurchase } from '@/lib/purchases';

let lastRun = 0;

export async function syncPurchases(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastRun < 20_000) return;
  lastRun = now;

  let phone = '';
  try { phone = localStorage.getItem('replaytime-phone') || ''; } catch { /* ignore */ }

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
