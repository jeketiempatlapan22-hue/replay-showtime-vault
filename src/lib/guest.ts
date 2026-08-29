// Akun "guest" ringan: hanya tersimpan di localStorage perangkat ini.
// Tidak dibuat di sistem autentikasi / user manager sama sekali.

export interface GuestAccount {
  id: string;
  name: string;
  createdAt: number;
}

const KEY = 'replaytime-guest-account';

function randomName() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `Guest-${suffix}`;
}

export function getGuestAccount(): GuestAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.name === 'string') {
      return parsed as GuestAccount;
    }
    return null;
  } catch {
    return null;
  }
}

export function createGuestAccount(): GuestAccount {
  const acc: GuestAccount = {
    id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    name: randomName(),
    createdAt: Date.now(),
  };
  try { localStorage.setItem(KEY, JSON.stringify(acc)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('replaytime-guest-updated')); } catch { /* ignore */ }
  return acc;
}

export function ensureGuestAccount(): GuestAccount {
  return getGuestAccount() || createGuestAccount();
}

export function renameGuestAccount(name: string): GuestAccount | null {
  const acc = getGuestAccount();
  if (!acc) return null;
  const next = { ...acc, name: name.trim().slice(0, 24) || acc.name };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('replaytime-guest-updated')); } catch { /* ignore */ }
  return next;
}

export function clearGuestAccount() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('replaytime-guest-updated')); } catch { /* ignore */ }
}
