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
    const run = async () => {
      // For non-logged-in users, hydrate from local storage credentials only.
      if (!user) {
        const local = readMembershipCredentials();
        if (local) {
          // No package data — minimal shim
          if (!cancelled) notify({
            token: local.token, password: local.password, expires_at: null,
            package_name: 'Membership', max_devices: 1, includes_replays: true,
            starts_at: null, duration_days: null, replay_info: '', days_remaining: null,
          });
        } else if (!cancelled) {
          notify(null);
        }
        if (!cancelled) setLoading(false);
        return;
      }
      setLoading(true);
      const m = await fetchMembership();
      if (cancelled) return;
      if (m) saveMembershipCredentials(m.token, m.password);
      else clearMembershipCredentials();
      notify(m);
      setLoading(false);
    };
    void run();
    const onUpd = () => { void run(); };
    window.addEventListener(MEMBERSHIP_UPDATED_EVENT, onUpd);
    // Auto-refresh tiap 60 detik supaya UI berpindah ke mode beli ketika expiry lewat.
    const interval = window.setInterval(() => { void run(); }, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener(MEMBERSHIP_UPDATED_EVENT, onUpd);
      window.clearInterval(interval);
    };
  }, [user?.id]);

  const refresh = () => {
    cached = undefined;
    void fetchMembership().then((m) => {
      if (m) saveMembershipCredentials(m.token, m.password);
      notify(m);
    });
  };

  return { membership, loading, refresh };
}
