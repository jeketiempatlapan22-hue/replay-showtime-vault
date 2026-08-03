import type { ActiveMembership } from '@/hooks/useActiveMembership';

/**
 * Aturan akses replay untuk membership:
 * replay tercakup bila tanggal replay berada dalam periode membership
 * (starts_at s/d expires_at) dan paket membership memuat replay.
 */
export function isReplayCoveredByMembership(
  replayDate: string | null | undefined,
  membership: ActiveMembership | null,
): boolean {
  if (!membership || !membership.token) return false;
  if (!membership.includes_replays) return false;
  if (!replayDate) return false;

  const replayTime = new Date(`${replayDate}T12:00:00`).getTime();
  if (!Number.isFinite(replayTime)) return false;

  const now = Date.now();
  const expires = membership.expires_at ? new Date(membership.expires_at).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isFinite(expires) && expires < now) return false;

  // Toleransi 1 hari di awal periode agar replay pada hari mulai tetap tercakup.
  const starts = membership.starts_at
    ? new Date(membership.starts_at).getTime() - 24 * 3600 * 1000
    : 0;

  return replayTime >= starts && replayTime <= expires;
}
