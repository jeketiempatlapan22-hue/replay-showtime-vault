import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/backend';

const REMEMBER_KEY = 'auth_remember';
const ALIVE_KEY = 'auth_session_alive';

/**
 * Enforce "remember me":
 * - If user logged in WITHOUT remember-me, the session is valid only as long
 *   as the browser tab/window stays open (sessionStorage marker).
 * - On a fresh browser session (no sessionStorage marker) we sign them out.
 */
export function enforceRememberMe(): boolean {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY);
    const alive = sessionStorage.getItem(ALIVE_KEY);
    if (remember === 'false' && !alive) {
      // Stale session-only login from a previous browser session — drop it.
      supabase.auth.signOut();
      return true;
    }
    sessionStorage.setItem(ALIVE_KEY, '1');
  } catch {
    /* ignore */
  }
  return false;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    enforceRememberMe();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}
