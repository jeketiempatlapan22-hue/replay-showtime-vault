// Admin-only: list ALL auth users merged with profiles + coin balances.
// Uses service role to read auth.users (which the Data API cannot expose).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const uid = ud?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const search = String(body?.search || '').trim().toLowerCase();

    // List up to first 1000 auth users (paginate via Supabase admin API).
    const all: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const users = data?.users || [];
      all.push(...users);
      if (users.length < 200) break;
    }

    // Fetch profiles + balances in one batch
    const [{ data: profs }, { data: bals }] = await Promise.all([
      admin.from('profiles').select('user_id,username,phone,email'),
      admin.from('coin_balances').select('user_id,balance'),
    ]);
    const pmap = new Map((profs || []).map((p: any) => [p.user_id, p]));
    const bmap = new Map((bals || []).map((b: any) => [b.user_id, b.balance]));

    let rows = all.map((u: any) => {
      const p: any = pmap.get(u.id) || {};
      return {
        user_id: u.id,
        email: u.email || p.email || '',
        phone: p.phone || u.phone || null,
        username: p.username || null,
        balance: Number(bmap.get(u.id) || 0),
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        has_profile: pmap.has(u.id),
      };
    });

    if (search) {
      rows = rows.filter(r =>
        r.email.toLowerCase().includes(search) ||
        (r.username || '').toLowerCase().includes(search) ||
        (r.phone || '').toLowerCase().includes(search) ||
        r.user_id.toLowerCase().includes(search)
      );
    }
    rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return new Response(JSON.stringify({ ok: true, users: rows.slice(0, 500), total: rows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
