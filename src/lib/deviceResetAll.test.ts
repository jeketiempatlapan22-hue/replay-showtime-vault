import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/backend', () => ({ supabase: {} }));
import { quotaRemaining, nextQuota, wibDay, dedupeTargets } from './deviceResetAll';

// 6 Nov 2026 20:00 WIB = 13:00 UTC
const evening = Date.parse('2026-11-06T13:00:00Z');
// 7 Nov 2026 00:01 WIB = 6 Nov 17:01 UTC
const afterMidnight = Date.parse('2026-11-06T17:01:00Z');

describe('reset semua perangkat', () => {
  it('memberi 3 kesempatan per hari', () => {
    let raw: string | null = null;
    expect(quotaRemaining(raw, evening)).toBe(3);
    raw = nextQuota(raw, evening);
    raw = nextQuota(raw, evening);
    expect(quotaRemaining(raw, evening)).toBe(1);
    raw = nextQuota(raw, evening);
    expect(quotaRemaining(raw, evening)).toBe(0);
  });

  it('kuota terisi ulang setelah 00.00 WIB', () => {
    let raw: string | null = null;
    for (let i = 0; i < 3; i++) raw = nextQuota(raw, evening);
    expect(wibDay(afterMidnight)).toBe('2026-11-07');
    expect(quotaRemaining(raw, afterMidnight)).toBe(3);
  });

  it('akses yang sama hanya direset sekali', () => {
    const out = dedupeTargets([
      { kind: 'show', token: 'abc', label: 'a' },
      { kind: 'show', token: 'abc', label: 'b' },
      { kind: 'membership', token: 'abc', password: 'X', label: 'm' },
    ]);
    expect(out).toHaveLength(2);
  });
});
