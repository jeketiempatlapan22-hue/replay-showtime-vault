// Reset massal ikatan perangkat (admin).
// Utama: RPC admin_bulk_reset_devices di Website A.
// Cadangan: bila server menolak DELETE tanpa WHERE (proteksi "safe update"),
// reset per token memakai RPC admin yang sudah ada untuk Membership & Token Show.

export type BulkKind = 'membership' | 'show' | 'replay' | 'order' | 'reseller' | 'live' | 'all';

type RpcResult = { data: unknown; error: { message: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export interface BulkResetOutcome {
  counts: Record<string, number>;
  /** Kategori yang belum bisa direset sampai fungsi Website A diperbaiki. */
  pending: string[];
  usedFallback: boolean;
}

export const isSafeUpdateError = (message?: string | null) =>
  /requires a where clause/i.test(message || '');

const FALLBACK: Record<'membership' | 'show', string> = {
  membership: 'admin_list_membership_tokens',
  show: 'admin_list_show_tokens',
};

async function resetPerToken(rpc: Rpc, kind: 'membership' | 'show'): Promise<number> {
  const { data, error } = await rpc(FALLBACK[kind], { _q: '', _status: 'all' });
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as { id: string; devices_used?: number }[];
  const targets = rows.filter((r) => r.id && Number(r.devices_used || 0) > 0);
  let total = 0;
  // Batasi paralel agar tidak membanjiri server.
  for (let i = 0; i < targets.length; i += 10) {
    const chunk = targets.slice(i, i + 10);
    const results = await Promise.all(chunk.map((r) => rpc('admin_reset_token_devices', { _kind: kind, _token_id: r.id })));
    for (const res of results) {
      if (res.error) throw new Error(res.error.message);
      total += Number(res.data || 0);
    }
  }
  return total;
}

export async function runBulkDeviceReset(rpc: Rpc, kind: BulkKind): Promise<BulkResetOutcome> {
  const { data, error } = await rpc('admin_bulk_reset_devices', { _kind: kind });
  if (!error) return { counts: (data || {}) as Record<string, number>, pending: [], usedFallback: false };
  if (!isSafeUpdateError(error.message)) throw new Error(error.message);

  const wanted: BulkKind[] = kind === 'all' ? ['membership', 'show', 'replay', 'order', 'reseller', 'live'] : [kind];
  const counts: Record<string, number> = {};
  const pending: string[] = [];
  for (const k of wanted) {
    if (k === 'membership' || k === 'show') counts[k] = await resetPerToken(rpc, k);
    else pending.push(k);
  }
  return { counts, pending, usedFallback: true };
}
