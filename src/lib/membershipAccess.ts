export interface MembershipCredentials {
  token: string;
  password: string;
  saved_at: number;
}

// Disimpan di localStorage agar persist across sessions selama durasi membership.
const MEMBERSHIP_KEY = 'replaytime-live-membership';
export const MEMBERSHIP_UPDATED_EVENT = 'replaytime-membership-updated';

function storages(): Storage[] {
  if (typeof window === 'undefined') return [];
  const list: Storage[] = [];
  try { list.push(window.localStorage); } catch { /* ignore */ }
  try { list.push(window.sessionStorage); } catch { /* ignore */ }
  return list;
}

export function saveMembershipCredentials(token: string, password = '') {
  if (typeof window === 'undefined' || !token.trim()) return;
  const payload: MembershipCredentials = { token: token.trim(), password: password || '', saved_at: Date.now() };
  const raw = JSON.stringify(payload);
  for (const s of storages()) {
    try { s.setItem(MEMBERSHIP_KEY, raw); } catch { /* ignore */ }
  }
  try { window.dispatchEvent(new Event(MEMBERSHIP_UPDATED_EVENT)); } catch { /* ignore */ }
}

export function readMembershipCredentials(): MembershipCredentials | null {
  if (typeof window === 'undefined') return null;
  for (const s of storages()) {
    try {
      const raw = s.getItem(MEMBERSHIP_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<MembershipCredentials>;
      if (typeof parsed.token === 'string' && parsed.token.trim()) {
        return {
          token: parsed.token.trim(),
          password: String(parsed.password || ''),
          saved_at: Number(parsed.saved_at || 0),
        };
      }
    } catch { /* ignore */ }
  }
  return null;
}

export function clearMembershipCredentials() {
  if (typeof window === 'undefined') return;
  for (const s of storages()) {
    try { s.removeItem(MEMBERSHIP_KEY); } catch { /* ignore */ }
  }
  try { window.dispatchEvent(new Event(MEMBERSHIP_UPDATED_EVENT)); } catch { /* ignore */ }
}
