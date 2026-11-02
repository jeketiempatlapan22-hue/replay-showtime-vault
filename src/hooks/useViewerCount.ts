import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/backend';
import { getBrowserId } from '@/lib/browserId';

/**
 * Penghitung penonton bersama untuk satu show.
 * Halaman live berbayar dan halaman /free memakai channel yang sama
 * (`live-viewers:<showKey>`) sehingga jumlahnya menggabungkan penonton gratis + berbayar.
 * Sangat di-throttle agar ringan saat ribuan penonton bersamaan.
 */
export function useViewerCount(showKey: string, active: boolean): number | null {
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  useEffect(() => {
    if (!active) { setViewerCount(null); return; }
    const bid = getBrowserId();
    const channel = supabase.channel(`live-viewers:${showKey || 'global'}`, {
      config: { presence: { key: bid } },
    });
    let pending: number | null = null;
    let lastCount = 0;
    const recount = () => {
      if (pending || document.visibilityState !== 'visible') return;
      pending = window.setTimeout(() => {
        pending = null;
        try {
          const state = channel.presenceState() as Record<string, unknown[]>;
          let unique = 0;
          for (const k of Object.keys(state)) {
            if (k && Array.isArray(state[k]) && state[k].length > 0) unique++;
          }
          if (unique !== lastCount) { lastCount = unique; setViewerCount(unique); }
        } catch { /* ignore */ }
      }, 25000);
    };
    let tracked = false;
    let heartbeat: number | null = null;
    channel
      .on('presence', { event: 'sync' }, recount)
      .on('presence', { event: 'join' }, recount)
      .on('presence', { event: 'leave' }, recount)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !tracked) {
          tracked = true;
          try { await channel.track({ at: Date.now() }); } catch { /* ignore */ }
          recount();
          heartbeat = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
              channel.track({ at: Date.now() }).catch(() => {});
            }
          }, 300000);
        }
      });
    const onVis = () => {
      if (document.visibilityState === 'visible') channel.track({ at: Date.now() }).catch(() => {});
      else channel.untrack().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (pending) window.clearTimeout(pending);
      if (heartbeat) window.clearInterval(heartbeat);
      try { void channel.untrack(); } catch { /* ignore */ }
      supabase.removeChannel(channel);
    };
  }, [active, showKey]);

  return viewerCount;
}
