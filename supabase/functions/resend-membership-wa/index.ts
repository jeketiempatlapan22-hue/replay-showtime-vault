// Admin-only: kirim ulang notifikasi WA membership (token + link + replay info).
// Bisa satu order atau bulk. Untuk order yang masih 'reserved' tapi sebenarnya
// sudah dibayar di Pakasir, fungsi ini akan cek status dulu lalu finalize.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

async function sendFonnteOnce(phone: string, message: string) {
  const tok = Deno.env.get('FONNTE_TOKEN');
  if (!tok) return { ok: false, data: { error: 'no_token' } };
  const form = new FormData();
  form.append('target', normalizePhone(phone));
  form.append('message', message);
  form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: tok }, body: form,
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
  } catch (e) { return { ok: false, data: { error: String(e) } }; }
}
async function sendFonnte(phone: string, message: string) {
  const delays = [0, 1000, 3000];
  let last: { ok: boolean; data: unknown } = { ok: false, data: { error: 'no_attempt' } };
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    last = await sendFonnteOnce(phone, message);
    if (last.ok) return last;
  }
  return last;
}

const DEFAULT_TPL =
  '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n🗝️ Sandi: *{password}*\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';

function buildMessage(tpl: string, v: Record<string, string>) {
  return tpl
    .replace(/\{package_name\}/g, v.package_name || '')
    .replace(/\{link\}/g, v.link || '')
    .replace(/\{password\}/g, v.password || '')
    .replace(/\{expires_at\}/g, v.expires_at || '')
    .replace(/\{duration_days\}/g, v.duration_days || '')
    .replace(/\{max_devices\}/g, v.max_devices || '1')
    .replace(/\{replay_info\}/g, v.replay_info || '')
    .replace(/\{replay_info_block\}/g, v.replay_info ? `🎬 *Info Replay:*\n${v.replay_info}\n\n` : '')
    .replace(/\{site\}/g, v.site || '');
}

async function pakasirIsPaid(orderId: string, amount: number): Promise<boolean> {
  const apiKey = Deno.env.get('PAKASIR_API_KEY');
  const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
  if (!apiKey || !slug || !orderId) return false;
  try {
    const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(slug)}&amount=${amount}&order_id=${encodeURIComponent(orderId)}&api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    const j: any = await res.json().catch(() => ({}));
    const tx = j?.transaction || j?.payment || {};
    const s = String(tx.status || j?.status || '').toLowerCase();
    return s === 'completed' || s === 'paid' || s === 'success';
  } catch { return false; }
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
    const uid = ud?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.order_ids) ? body.order_ids.filter((x: unknown) => typeof x === 'string') : (body.order_id ? [String(body.order_id)] : []);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: 'no_order_ids' }), { status: 400, headers: corsHeaders });
    }
    if (ids.length > 200) {
      return new Response(JSON.stringify({ error: 'too_many' }), { status: 400, headers: corsHeaders });
    }

    const { data: settings } = await admin
      .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_membership_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
    const tpl = sm.get('wa_membership_template') || DEFAULT_TPL;

    const results: any[] = [];
    for (const oid of ids) {
      try {
        const { data: order } = await admin.from('membership_orders').select('*').eq('id', oid).maybeSingle();
        if (!order) { results.push({ id: oid, error: 'not_found' }); continue; }

        // Bila masih reserved & ada pakasir_order_id → coba cek status dulu.
        if (order.status === 'reserved' && order.kind === 'qris' && order.pakasir_order_id) {
          const paid = await pakasirIsPaid(order.pakasir_order_id, Number(order.amount || 0));
          if (!paid) { results.push({ id: oid, skipped: 'not_paid_yet' }); continue; }
        } else if (order.status !== 'paid' && order.status !== 'reserved') {
          results.push({ id: oid, skipped: `status_${order.status}` }); continue;
        }

        // Finalize jika belum ada token.
        let tok: any = null;
        if (!order.membership_token_id) {
          const { data: fin, error: ferr } = await admin.rpc('finalize_membership_order', { _order_id: oid });
          if (ferr) { results.push({ id: oid, error: 'finalize_failed:' + ferr.message }); continue; }
          tok = Array.isArray(fin) ? fin[0] : fin;
        } else {
          const { data: t } = await admin.from('membership_tokens').select('token,password,expires_at,max_devices,includes_replays,duration_days,package_id').eq('id', order.membership_token_id).maybeSingle();
          const { data: pkg } = await admin.from('membership_packages').select('name,replay_info,duration_days').eq('id', order.package_id).maybeSingle();
          if (!t || !pkg) { results.push({ id: oid, error: 'token_or_pkg_missing' }); continue; }
          tok = {
            token: t.token, password: t.password, expires_at: t.expires_at,
            max_devices: t.max_devices, includes_replays: t.includes_replays,
            duration_days: t.duration_days || pkg.duration_days,
            replay_info: pkg.replay_info || '', package_name: pkg.name,
          };
        }

        const link = `${origin}/live?mtoken=${encodeURIComponent(tok.token)}&mp=${encodeURIComponent(tok.password)}`;
        const expiresStr = new Date(tok.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        const message = buildMessage(tpl, {
          package_name: tok.package_name || '',
          link, password: tok.password || '',
          expires_at: expiresStr,
          duration_days: String(tok.duration_days || ''),
          max_devices: String(tok.max_devices || 1),
          replay_info: tok.replay_info || '',
          site: origin.replace(/^https?:\/\//, ''),
        });

        const sent = await sendFonnte(order.phone, message);
        await admin.from('wa_outbox').insert({
          phone: order.phone, message, status: sent.ok ? 'sent' : 'failed',
          error: sent.ok ? null : JSON.stringify(sent.data),
          related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
        });
        await admin.from('token_deliveries').insert({
          phone: order.phone, replay_id: null, replay_title: `Membership • ${tok.package_name}`,
          order_id: null, access_token: tok.token, link,
          source: 'admin-resend', requested_by: 'resend-membership-wa',
        });
        results.push({ id: oid, sent: sent.ok, phone: order.phone });
      } catch (e) {
        results.push({ id: oid, error: String(e) });
      }
    }

    const ok = results.filter((r) => r.sent).length;
    return new Response(JSON.stringify({ ok: true, total: ids.length, sent: ok, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
