import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { bundleShowTokens } from '../_shared/bundle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const phone = normalizePhone(body?.phone || '');

  // Identitas user login (opsional)
  let userId = '';
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (jwt) {
    const { data } = await admin.auth.getUser(jwt);
    userId = data?.user?.id || '';
  }

  if (!userId && !phone) return json({ ok: true, shows: [], replays: [] });

  let query = admin
    .from('orders')
    .select('show_id,replay_id,kind,access_token,paid_at,created_at')
    .eq('status', 'paid')
    .not('access_token', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (userId && phone) query = query.or(`user_id.eq.${userId},user_phone.eq.${phone}`);
  else if (userId) query = query.eq('user_id', userId);
  else query = query.eq('user_phone', phone);

  const { data: orders, error } = await query;
  if (error) return json({ error: 'query_failed', detail: error.message }, 500);

  const shows: Record<string, { token: string; kind: string }> = {};
  const replays: Record<string, { token: string }> = {};
  const showIds = new Set<string>();

  for (const o of orders || []) {
    const tok = String((o as any).access_token || '');
    if (!tok) continue;
    const sid = (o as any).show_id as string | null;
    const rid = (o as any).replay_id as string | null;
    if (sid) { showIds.add(sid); if (!shows[sid]) shows[sid] = { token: tok, kind: (o as any).kind === 'replay' ? 'replay' : 'show' }; }
    if (rid && !replays[rid]) replays[rid] = { token: tok };
  }

  // Bundel show: satu token bundel membuka semua show anggotanya (sub-token per show).
  {
    let bq = admin.from('show_bundle_tokens').select('token,revoked,user_id,phone').eq('revoked', false).limit(20);
    if (userId && phone) bq = bq.or(`user_id.eq.${userId},phone.eq.${phone}`);
    else if (userId) bq = bq.eq('user_id', userId);
    else bq = bq.eq('phone', phone);
    const { data: bundleTokens } = await bq;
    for (const bt of bundleTokens || []) {
      const map = await bundleShowTokens(admin, String((bt as any).token));
      for (const [sid, tok] of Object.entries(map)) {
        showIds.add(sid);
        if (!shows[sid]) shows[sid] = { token: tok, kind: 'show' };
      }
    }
  }

  // Show yang sudah dikonversi jadi replay: token show berlaku untuk replay-nya.
  if (showIds.size > 0) {
    const { data: linked } = await admin
      .from('active_shows')
      .select('id,replay_id')
      .in('id', [...showIds])
      .not('replay_id', 'is', null);
    for (const s of linked || []) {
      const rid = (s as any).replay_id as string;
      const tok = shows[(s as any).id]?.token;
      if (rid && tok && !replays[rid]) replays[rid] = { token: tok };
    }
  }

  return json({ ok: true, shows, replays });
});
