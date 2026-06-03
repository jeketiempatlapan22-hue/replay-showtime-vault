// Admin-only: upsert a profile row (phone, username) for any user.
// Uses service role so admin can edit users who do not yet have a profile.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('62')) return d;
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: ud } = await userClient.auth.getUser();
    const actorId = ud?.user?.id;
    const actorEmail = ud?.user?.email || '';
    if (!actorId) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: actorId, _role: 'admin' });
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.user_id || '').trim();
    if (!userId) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: corsHeaders });

    const patch: Record<string, unknown> = {};
    if (body.username !== undefined) {
      const u = String(body.username || '').trim();
      if (u && !/^[a-zA-Z0-9_.]{3,20}$/.test(u)) {
        return new Response(JSON.stringify({ error: 'invalid_username' }), { status: 400, headers: corsHeaders });
      }
      patch.username = u || null;
    }
    if (body.phone !== undefined) {
      const p = normalizePhone(String(body.phone || ''));
      if (p && !/^62\d{8,13}$/.test(p)) {
        return new Response(JSON.stringify({ error: 'invalid_phone' }), { status: 400, headers: corsHeaders });
      }
      patch.phone = p || null;
    }

    // Fetch email so we can upsert if profile is missing
    const { data: existing } = await admin.from('profiles').select('id,email').eq('user_id', userId).maybeSingle();
    if (existing) {
      const { error } = await admin.from('profiles').update(patch).eq('user_id', userId);
      if (error) throw error;
    } else {
      const { data: au } = await admin.auth.admin.getUserById(userId);
      const email = au?.user?.email || '';
      const { error } = await admin.from('profiles').insert({ user_id: userId, email, ...patch });
      if (error) throw error;
    }

    await admin.from('admin_action_logs').insert({
      actor_user_id: actorId, actor_email: actorEmail,
      action: 'admin_update_user_profile',
      filter: {}, order_ids: [], affected_count: 1,
      details: { user_id: userId, patch },
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
