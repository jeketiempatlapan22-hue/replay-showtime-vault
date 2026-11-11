import { describe, it, expect } from 'vitest';
import { runBulkDeviceReset, isSafeUpdateError, type Rpc } from './bulkDeviceReset';

const safeErr = { data: null, error: { message: 'DELETE requires a WHERE clause' } };

describe('runBulkDeviceReset', () => {
  it('returns server counts when the bulk function works', async () => {
    const rpc: Rpc = async () => ({ data: { membership: 4 }, error: null });
    const r = await runBulkDeviceReset(rpc, 'membership');
    expect(r).toEqual({ counts: { membership: 4 }, pending: [], usedFallback: false });
  });

  it('falls back to per-token membership reset only for tokens with devices', async () => {
    const calls: string[] = [];
    const rpc: Rpc = async (fn, args) => {
      calls.push(`${fn}:${String(args._token_id ?? '')}`);
      if (fn === 'admin_bulk_reset_devices') return safeErr;
      if (fn === 'admin_list_membership_tokens') return { data: [{ id: 'a', devices_used: 2 }, { id: 'b', devices_used: 0 }], error: null };
      return { data: 2, error: null };
    };
    const r = await runBulkDeviceReset(rpc, 'membership');
    expect(r.counts).toEqual({ membership: 2 });
    expect(r.usedFallback).toBe(true);
    expect(calls).toContain('admin_reset_token_devices:a');
    expect(calls).not.toContain('admin_reset_token_devices:b');
  });

  it('reports categories that still need the Website A fix', async () => {
    const rpc: Rpc = async (fn) => (fn === 'admin_bulk_reset_devices' ? safeErr : { data: [], error: null });
    const r = await runBulkDeviceReset(rpc, 'all');
    expect(r.pending).toEqual(['replay', 'order', 'reseller', 'live']);
  });

  it('rethrows other errors such as forbidden', async () => {
    const rpc: Rpc = async () => ({ data: null, error: { message: 'forbidden' } });
    await expect(runBulkDeviceReset(rpc, 'show')).rejects.toThrow('forbidden');
    expect(isSafeUpdateError('forbidden')).toBe(false);
  });
});
