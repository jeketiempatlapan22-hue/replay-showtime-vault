// Admin-only: full platform data export for migrating to another project.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const TABLES = [
  'profiles', 'coin_balances', 'coin_transactions', 'coin_packages',
  'orders', 'membership_orders', 'membership_packages', 'membership_tokens',
  'membership_token_devices', 'membership_payment_proofs',
  'active_shows', 'active_show_tokens', 'active_show_token_devices',
  'replays', 'replay_personal_tokens', 'replay_token_devices',
  'master_passwords', 'members', 'site_settings',
  'live_tokens', 'live_token_devices', 'live_config_private',
  'bot_commands', 'bot_admins',
  'reseller_show_prices', 'reseller_bills', 'reseller_audit_log',
  'token_deliveries', 'user_roles', 'comments', 'ratings',
  'blocked_browsers', 'blocked_ips',
];

const BUCKETS = ['card-images', 'member-photos', 'payment-proofs'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: ud } = await userClient.auth.getUser();
    const uid = ud?.user?.id;
    if (!uid) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const t of TABLES) {
      const rows: any[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data: page, error } = await admin.from(t).select('*').range(from, from + 999);
        if (error) { errors[t] = error.message; break; }
        rows.push(...(page || []));
        if (!page || page.length < 1000) break;
      }
      data[t] = rows;
      counts[t] = rows.length;
    }

    // Auth users, including bcrypt password hashes so accounts can be migrated
    // to another project with the SAME login password.
    const authUsers: any[] = [];
    const { data: rawUsers, error: rawErr } = await admin.rpc('admin_export_auth_users', { _admin_id: uid });
    if (rawErr) errors['auth_users_raw'] = rawErr.message;
    const rawMap = new Map<string, any>((rawUsers || []).map((u: any) => [u.id, u]));
    counts['auth_users_with_password_hash'] = (rawUsers || []).filter((u: any) => u.encrypted_password).length;

    for (let page = 1; page <= 20; page++) {
      const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) { errors['auth_users'] = error.message; break; }
      const users = list?.users || [];
      authUsers.push(...users.map((u: any) => {
        const raw = rawMap.get(u.id) || {};
        return {
          id: u.id,
          email: u.email,
          phone: u.phone || raw.phone || null,
          encrypted_password: raw.encrypted_password ?? null,
          created_at: u.created_at,
          updated_at: raw.updated_at ?? null,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed_at: u.email_confirmed_at,
          phone_confirmed_at: raw.phone_confirmed_at ?? null,
          providers: u.app_metadata?.providers ?? [],
          user_metadata: u.user_metadata ?? {},
          app_metadata: u.app_metadata ?? {},
        };
      }));
      if (users.length < 200) break;
    }
    // Fallback: if listUsers failed entirely, use the raw rows.
    if (!authUsers.length && rawUsers?.length) authUsers.push(...rawUsers);
    data['auth_users'] = authUsers;
    counts['auth_users'] = authUsers.length;


    // Storage file listings (public URLs)
    const storage: Record<string, any[]> = {};
    for (const b of BUCKETS) {
      const { data: files, error } = await admin.storage.from(b).list('', { limit: 1000 });
      if (error) { errors[`storage:${b}`] = error.message; continue; }
      storage[b] = (files || [])
        .filter((f: any) => f.name !== '.emptyFolderPlaceholder')
        .map((f: any) => ({
          name: f.name,
          size: f.metadata?.size ?? null,
          created_at: f.created_at,
          public_url: admin.storage.from(b).getPublicUrl(f.name).data.publicUrl,
        }));
      counts[`storage:${b}`] = storage[b].length;
    }
    data['storage_files'] = [] as unknown[];

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      project_url: url,
      counts,
      errors,
      storage,
      data,
      notes: [
        'Sandi login akun user tidak bisa diekspor (disimpan sebagai hash satu arah).',
        'Sandi replay, sandi master bulanan, sandi live, dan PIN bot admin ikut terekspor.',
      ],
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
