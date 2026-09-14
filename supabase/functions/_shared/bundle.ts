// Helper bersama untuk fitur "Bundel Show":
// satu pembelian => satu token bundel + sub-token per show (agar seluruh
// pengecekan akses per-show yang sudah ada tetap berlaku apa adanya).

export interface BundleInfo {
  id: string;
  name: string;
  is_active: boolean;
  price_idr: number;
  price_coins: number;
  show_ids: string[];
  password: string;
}

function rnd(len = 24) {
  return crypto.randomUUID().replace(/-/g, '').slice(0, len);
}

/** Bundel tunggal + daftar show yang tercakup + sandi yang berlaku saat ini. */
export async function getBundle(admin: any): Promise<BundleInfo | null> {
  const { data: b } = await admin
    .from('show_bundles')
    .select('id,name,is_active,price_idr,price_coins')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!b) return null;

  const { data: items } = await admin
    .from('show_bundle_items')
    .select('show_id, excluded, active_shows!inner(id,is_active,replay_id)')
    .eq('bundle_id', b.id)
    .eq('excluded', false);

  const showIds = (items || [])
    .filter((i: any) => i.active_shows?.is_active && !i.active_shows?.replay_id)
    .map((i: any) => String(i.show_id));

  const { data: pw } = await admin
    .from('show_bundle_passwords')
    .select('password')
    .eq('bundle_id', b.id)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: b.id,
    name: b.name,
    is_active: !!b.is_active,
    price_idr: Number(b.price_idr || 0),
    price_coins: Number(b.price_coins || 0),
    show_ids: showIds,
    password: String(pw?.password || ''),
  };
}

export interface IssuedBundle {
  token: string;
  password: string;
  show_ids: string[];
  /** show_id -> sub-token yang dipakai kartu show & player */
  show_tokens: Record<string, string>;
  already?: boolean;
}

/** Peta show_id -> sub-token untuk sebuah token bundel. */
export async function bundleShowTokens(admin: any, bundleToken: string): Promise<Record<string, string>> {
  const { data } = await admin
    .from('active_show_tokens')
    .select('show_id,token,revoked')
    .eq('label', `bundle:${bundleToken}`);
  const map: Record<string, string> = {};
  for (const r of data || []) {
    if (!r.revoked) map[String(r.show_id)] = String(r.token);
  }
  return map;
}

/** Cari token bundel milik pembeli (idempotent: 1 token untuk 1 user). */
export async function findBundleToken(
  admin: any,
  opts: { bundleId: string; userId?: string | null; phone?: string | null; orderId?: string | null },
) {
  const base = admin
    .from('show_bundle_tokens')
    .select('*')
    .eq('bundle_id', opts.bundleId)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (opts.orderId) {
    const { data } = await base.eq('order_id', opts.orderId);
    if (data?.length) return data[0];
  }
  if (opts.userId) {
    const { data } = await admin
      .from('show_bundle_tokens').select('*')
      .eq('bundle_id', opts.bundleId).eq('revoked', false).eq('user_id', opts.userId)
      .order('created_at', { ascending: false }).limit(1);
    if (data?.length) return data[0];
  }
  if (opts.phone) {
    const { data } = await admin
      .from('show_bundle_tokens').select('*')
      .eq('bundle_id', opts.bundleId).eq('revoked', false).eq('phone', opts.phone)
      .order('created_at', { ascending: false }).limit(1);
    if (data?.length) return data[0];
  }
  return null;
}

/**
 * Terbitkan token bundel. Idempotent per pembeli (order/user/nomor WA).
 * Sub-token per show ditulis ke active_show_tokens agar kartu show, player live,
 * dan replay hasil konversi langsung mengenali akses pembeli.
 */
export async function issueBundleToken(
  admin: any,
  opts: { userId?: string | null; phone?: string | null; orderId?: string | null; label?: string },
): Promise<IssuedBundle | null> {
  const bundle = await getBundle(admin);
  if (!bundle) return null;

  const existing = await findBundleToken(admin, {
    bundleId: bundle.id, userId: opts.userId, phone: opts.phone, orderId: opts.orderId,
  });
  if (existing) {
    return {
      token: existing.token,
      password: existing.password || bundle.password,
      show_ids: (existing.show_ids || []).map(String),
      show_tokens: await bundleShowTokens(admin, existing.token),
      already: true,
    };
  }

  const token = rnd();
  const showTokens: Record<string, string> = {};
  for (const showId of bundle.show_ids) {
    const sub = rnd();
    const { error } = await admin.from('active_show_tokens').insert({
      show_id: showId,
      token: sub,
      label: `bundle:${token}`,
      kind: 'personal',
      max_devices: 1,
      revoked: false,
    });
    if (!error) showTokens[showId] = sub;
  }

  await admin.from('show_bundle_tokens').insert({
    bundle_id: bundle.id,
    token,
    password: bundle.password,
    label: opts.label || '',
    user_id: opts.userId || null,
    phone: opts.phone || '',
    order_id: opts.orderId || null,
    show_ids: bundle.show_ids,
    max_devices: 1,
    revoked: false,
  });

  return { token, password: bundle.password, show_ids: bundle.show_ids, show_tokens: showTokens };
}

/** Sandi bundel (yang berlaku sekarang maupun lama) valid untuk replay ini? */
export async function bundlePasswordValidForReplay(
  admin: any,
  replayId: string,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const { data: pw } = await admin
    .from('show_bundle_passwords')
    .select('bundle_id')
    .eq('password', password)
    .limit(1)
    .maybeSingle();
  if (!pw) return false;

  const { data: shows } = await admin
    .from('active_shows').select('id').eq('replay_id', replayId);
  const ids = (shows || []).map((s: any) => String(s.id));
  if (!ids.length) return false;

  const { data: item } = await admin
    .from('show_bundle_items')
    .select('id')
    .eq('bundle_id', pw.bundle_id)
    .eq('excluded', false)
    .in('show_id', ids)
    .limit(1)
    .maybeSingle();
  return !!item;
}
