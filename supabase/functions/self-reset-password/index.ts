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

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return digits;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const needle = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === needle);
    if (found) return found;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function resolveAccount(admin: ReturnType<typeof createClient>, identifier: string) {
  const raw = identifier.trim();
  const looksPhone = /^[0-9+\s\-()]+$/.test(raw);
  const lookup = looksPhone ? normalizePhone(raw) : raw;

  const { data: emailFromIdentifier } = await admin.rpc('email_for_identifier', { _identifier: lookup });
  const candidateEmails = Array.from(new Set([
    typeof emailFromIdentifier === 'string' ? emailFromIdentifier : '',
    raw.includes('@') ? raw : '',
  ].filter(Boolean)));

  for (const email of candidateEmails) {
    const { data: profile } = await admin
      .from('profiles')
      .select('user_id,email')
      .eq('email', email)
      .maybeSingle();
    if (profile?.user_id) return { userId: profile.user_id as string, email: (profile.email as string) || email };

    const authUser = await findAuthUserByEmail(admin, email);
    if (authUser?.id) return { userId: authUser.id, email: authUser.email || email };
  }

  if (looksPhone && lookup) {
    const { data: profile } = await admin
      .from('profiles')
      .select('user_id,email')
      .eq('phone', lookup)
      .maybeSingle();
    if (profile?.user_id) return { userId: profile.user_id as string, email: profile.email as string };
  } else if (!raw.includes('@')) {
    const { data: profile } = await admin
      .from('profiles')
      .select('user_id,email')
      .ilike('username', raw)
      .maybeSingle();
    if (profile?.user_id) return { userId: profile.user_id as string, email: profile.email as string };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '');
    if (!identifier) return json({ ok: false, error: 'invalid_input', message: 'Masukkan email/nomor HP/username Anda' });
    if (password.length < 6) return json({ ok: false, error: 'invalid_input', message: 'Sandi baru minimal 6 karakter' });

    // Rate-limit per identifier (5 fail / 10 min) using existing helper.
    const lockKey = `pwreset:${identifier.toLowerCase()}`;
    const { data: lock } = await admin.rpc('check_login_lock', { _identifier: lockKey });
    const lockRow = Array.isArray(lock) ? lock[0] : lock;
    if (lockRow?.locked) {
      return json({ ok: false, error: 'rate_limited', seconds_remaining: lockRow.seconds_remaining, message: 'Terlalu banyak percobaan. Coba lagi nanti.' });
    }

    const account = await resolveAccount(admin, identifier);
    if (!account?.userId) {
      await admin.rpc('record_login_attempt', { _identifier: lockKey, _success: false });
      return json({ ok: false, error: 'not_found', message: 'Akun tidak ditemukan. Periksa kembali data login Anda.' });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(account.userId, { password, email_confirm: true });
    if (updErr) return json({ ok: false, error: 'update_failed', message: updErr.message });

    await admin.rpc('record_login_attempt', { _identifier: lockKey, _success: true });
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: 'server_error', message: String((e as Error)?.message || e) });
  }
});
