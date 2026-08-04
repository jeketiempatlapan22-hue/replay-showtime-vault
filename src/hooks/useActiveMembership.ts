import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  MEMBERSHIP_UPDATED_EVENT,
  clearMembershipCredentials,
  readMembershipCredentials,
  saveMembershipCredentials,
} from '@/lib/membershipAccess';

export interface ActiveMembership {
  token: string;
  password: string;
  expires_at: string | null;
  package_name: string;
  max_devices: number;
  includes_replays: boolean;
  starts_at: string | null;
  duration_days: number | null;
  replay_info: string;
  days_remaining: number | null;
}

let cached: ActiveMembership | null | undefined;
const listeners = new Set<(v: ActiveMembership | null) => void>();

function notify(v: ActiveMembership | null) {
  cached = v;
  listeners.forEach((l) => l(v));
}

async function fetchMembership(): Promise<ActiveMembership | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_memberships');
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const now = Date.now();
    const active = (data as any[]).find(
      (r) =>
        r?.status === 'paid' &&
        !r?.revoked &&
        r?.token &&
        (!r?.expires_at || new Date(r.expires_at).getTime() > now),
    );
    if (!active) return null;
    return {
      token: String(active.token),
      password: String(active.password || ''),
      expires_at: active.expires_at || null,
      package_name: active.package_name || 'Membership',
      max_devices: Number(active.max_devices || 1),
      includes_replays: !!active.includes_replays,
      starts_at: active.starts_at || null,
      duration_days: active.duration_days ?? null,
      replay_info: active.replay_info || '',
      days_remaining: active.days_remaining ?? null,
    };
  } catch {
    return null;
  }
}

// --- Singleton loader -------------------------------------------------
// Hook ini dipakai oleh SETIAP kartu replay. Tanpa dedupe, ratusan kartu akan
// memicu ratusan RPC + ratusan interval 60 detik → website berat, error, dan
// tab bisa di-reload paksa oleh browser (terutama mobile).
let inFlight: Promise<ActiveMembership | null> | null = null;
let lastFetchAt = 0;
let subscriberCount = 0;
let sharedInterval: number | null = null;
let sharedUserId: string | undefined;

async function loadMembership(userId: string | undefined, force = false): Promise<ActiveMembership | null> {
  if (!userId) {
    const local = readMembershipCredentials();
    const value: ActiveMembership | null = local
      ? {
          token: local.token, password: local.password, expires_at: null,
          package_name: 'Membership', max_devices: 1, includes_replays: true,
          starts_at: null, duration_days: null, replay_info: '', days_remaining: null,
        }
      : null;
    notify(value);
    return value;
  }
  if (!force && inFlight) return inFlight;
  if (!force && cached !== undefined && Date.now() - lastFetchAt < 30_000) return cached ?? null;
  inFlight = (async () => {
    const m = await fetchMembership();
    if (m) saveMembershipCredentials(m.token, m.password);
    else clearMembershipCredentials();
    lastFetchAt = Date.now();
    notify(m);
    return m;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function useActiveMembership(): { membership: ActiveMembership | null; loading: boolean; refresh: () => void } {
  const { user } = useAuth();
  const [membership, setMembership] = useState<ActiveMembership | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    const listener = (v: ActiveMembership | null) => setMembership(v);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;
    if (sharedUserId !== userId) {
      sharedUserId = userId;
      cached = undefined;
      lastFetchAt = 0;
    }

    void loadMembership(userId).then(() => { if (!cancelled) setLoading(false); });

    const onUpd = () => { void loadMembership(sharedUserId, true); };
    window.addEventListener(MEMBERSHIP_UPDATED_EVENT, onUpd);

    // Satu interval global saja untuk semua komponen yang memakai hook ini.
    subscriberCount += 1;
    if (sharedInterval === null) {
      sharedInterval = window.setInterval(() => { void loadMembership(sharedUserId, true); }, 120_000);
    }

    return () => {
      cancelled = true;
      window.removeEventListener(MEMBERSHIP_UPDATED_EVENT, onUpd);
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (subscriberCount === 0 && sharedInterval !== null) {
        window.clearInterval(sharedInterval);
        sharedInterval = null;
      }
    };
  }, [user?.id]);

  const refresh = () => {
    void loadMembership(sharedUserId, true);
  };

  return { membership, loading, refresh };

}
