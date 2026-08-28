// Admin-only: update the CURRENT admin's own login email and/or password.
// Uses service role so the email change takes effect immediately (no confirmation mail).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: ud } = await userClient.auth.getUser();
    const actor = ud?.user;
    if (!actor) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: actor.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body?.current_password || '');
    const newEmail = String(body?.email || '').trim().toLowerCase();
    const newPassword = String(body?.password || '');

    if (!currentPassword) return json({ error: 'invalid_input', message: 'Sandi saat ini wajib diisi' }, 400);
    if (!newEmail && !newPassword) return json({ error: 'invalid_input', message: 'Tidak ada perubahan' }, 400);
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
      return json({ error: 'invalid_input', message: 'Email tidak valid' }, 400);
    }
    if (newPassword && newPassword.length < 8) {
      return json({ error: 'invalid_input', message: 'Sandi baru minimal 8 karakter' }, 400);
    }

    // Re-authenticate with the current password before allowing the change.
    const verifyClient = createClient(url, anon, { auth: { persistSession: false } });
    const { error: signInErr } = await verifyClient.auth.signInWithPassword({
      email: actor.email || '',
      password: currentPassword,
    });
    if (signInErr) return json({ error: 'invalid_credentials', message: 'Sandi saat ini salah' }, 401);

    const patch: Record<string, unknown> = {};
    if (newEmail && newEmail !== (actor.email || '').toLowerCase()) {
      patch.email = newEmail;
      patch.email_confirm = true;
    }
    if (newPassword) patch.password = newPassword;
    if (Object.keys(patch).length === 0) return json({ ok: true, changed: false });

    const { error: upErr } = await admin.auth.admin.updateUserById(actor.id, patch as any);
    if (upErr) return json({ error: 'update_failed', message: upErr.message }, 400);

    if (patch.email) {
      await admin.from('profiles').update({ email: newEmail }).eq('user_id', actor.id);
    }

    await admin.from('admin_action_logs').insert({
      actor_user_id: actor.id,
      actor_email: actor.email || '',
      action: 'admin_update_self_credentials',
      filter: {}, order_ids: [], affected_count: 1,
      details: { email_changed: !!patch.email, password_changed: !!patch.password },
    });

    return json({ ok: true, changed: true, email: patch.email ? newEmail : actor.email });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
