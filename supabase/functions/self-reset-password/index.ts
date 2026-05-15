// Self-service password reset by identifier (email/phone/username) — NO email/OTP.
// User-requested simplification: any registered identifier can reset its password directly.
// Includes basic rate limiting via login_attempts to deter brute-force enumeration.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '');
    if (!identifier) return json({ error: 'invalid_input', message: 'Masukkan email/nomor HP/username Anda' }, 400);
    if (password.length < 6) return json({ error: 'invalid_input', message: 'Sandi baru minimal 6 karakter' }, 400);

    // Rate-limit per identifier (5 fail / 10 min) using existing helper.
    const lockKey = `pwreset:${identifier.toLowerCase()}`;
    const { data: lock } = await admin.rpc('check_login_lock', { _identifier: lockKey });
    const lockRow = Array.isArray(lock) ? lock[0] : lock;
    if (lockRow?.locked) {
      return json({ error: 'rate_limited', seconds_remaining: lockRow.seconds_remaining, message: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429);
    }

    // Resolve identifier → account email via existing RPC.
    const { data: email } = await admin.rpc('email_for_identifier', { _identifier: identifier });
    if (!email) {
      await admin.rpc('record_login_attempt', { _identifier: lockKey, _success: false });
      return json({ error: 'not_found', message: 'Akun tidak ditemukan. Periksa kembali data login Anda.' }, 404);
    }

    // Find auth user by email
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) return json({ error: 'lookup_failed', message: listErr.message }, 500);
    const target = list.users.find((u) => (u.email || '').toLowerCase() === String(email).toLowerCase());
    if (!target) {
      await admin.rpc('record_login_attempt', { _identifier: lockKey, _success: false });
      return json({ error: 'not_found', message: 'Akun tidak ditemukan.' }, 404);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, { password, email_confirm: true });
    if (updErr) return json({ error: 'update_failed', message: updErr.message }, 400);

    await admin.rpc('record_login_attempt', { _identifier: lockKey, _success: true });
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'server_error', message: String((e as Error)?.message || e) }, 500);
  }
});
