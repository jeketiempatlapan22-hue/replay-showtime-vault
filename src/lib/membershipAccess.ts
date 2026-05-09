export interface MembershipCredentials {
  token: string;
  password: string;
  saved_at: number;
}

const MEMBERSHIP_SESSION_KEY = 'replaytime-live-membership';
export const MEMBERSHIP_UPDATED_EVENT = 'replaytime-membership-updated';

export function saveMembershipCredentials(token: string, password = '') {
  if (typeof window === 'undefined' || !token.trim()) return;
  const payload: MembershipCredentials = { token: token.trim(), password, saved_at: Date.now() };
  try {
    sessionStorage.setItem(MEMBERSHIP_SESSION_KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event(MEMBERSHIP_UPDATED_EVENT));
  } catch { /* ignore */ }
}

export function readMembershipCredentials(): MembershipCredentials | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(MEMBERSHIP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MembershipCredentials>;
    return typeof parsed.token === 'string' && parsed.token.trim()
      ? { token: parsed.token.trim(), password: String(parsed.password || ''), saved_at: Number(parsed.saved_at || 0) }
      : null;
  } catch {
    return null;
  }
}

export function clearMembershipCredentials() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(MEMBERSHIP_SESSION_KEY);
    window.dispatchEvent(new Event(MEMBERSHIP_UPDATED_EVENT));
  } catch { /* ignore */ }
}