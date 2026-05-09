// Background poller: scans pending orders, queries Pakasir, marks paid + delivers WA.
// Triggered by pg_cron every minute. Idempotent — safe to re-run.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

function genToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

async function sendFonnte(phone: string, message: string) {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return { ok: false, data: { error: 'no token' } };
  const form = new FormData();
  form.append('target', normalizePhone(phone));
  form.append('message', message);
  form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: token }, body: form,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
  } catch (e) {
    return { ok: false, data: { error: String(e) } };
  }
}

async function processOrder(admin: ReturnType<typeof createClient>, order: any, apiKey: string, slug: string, origin: string) {
  if (!order.pakasir_order_id) return { id: order.id, skipped: 'no_pakasir_id' };

  const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(slug)}&amount=${order.amount}&order_id=${encodeURIComponent(order.pakasir_order_id)}&api_key=${encodeURIComponent(apiKey)}`;
  let pjson: any = {};
  try {
    const pres = await fetch(url);
    pjson = await pres.json().catch(() => ({}));
  } catch (e) {
    return { id: order.id, error: 'pakasir_fetch:' + String(e) };
  }
  const tx = pjson?.transaction || pjson?.payment || {};
  const pStatus = String(tx.status || pjson?.status || '').toLowerCase();
  const isPaid = pStatus === 'completed' || pStatus === 'paid' || pStatus === 'success';
  if (!isPaid) return { id: order.id, status: pStatus || 'pending' };

  const accessToken = order.access_token ?? genToken();
  if (order.status !== 'paid') {
    await admin.from('orders').update({
      status: 'paid', paid_at: new Date().toISOString(), access_token: accessToken,
    }).eq('id', order.id);
  }
  if (order.token_sent_at) return { id: order.id, status: 'already_sent' };

  const replayPart = order.replay_id ? `&replay=${order.replay_id}` : '';
  const link = `${origin}/akses?token=${accessToken}${replayPart}`;

  let showExtras = '';
  if (order.show_id && !order.replay_id) {
    const { data: showRow } = await admin
      .from('active_shows').select('live_password').eq('id', order.show_id).maybeSingle();
    const liveLink = `${origin}/live?show=${order.show_id}&t=${accessToken}`;
    const pwd = String(showRow?.live_password || '').trim();
    showExtras = pwd
      ? `\n\n🔐 *Sandi tonton LIVE:*\n${pwd}\n_Masukkan sandi ini di halaman Live untuk masuk._\n\n▶️ Link tonton Live:\n${liveLink}`
      : `\n\n▶️ Link tonton Live:\n${liveLink}`;
  }

  const message =
    `✅ *Pembayaran Berhasil*\n\n` +
    `${order.item_title}\n` +
    `Order: ${order.pakasir_order_id}\n\n` +
    `🔗 Link akses Anda:\n${link}` +
    showExtras +
    `\n\n_Klik link di atas untuk membuka. Jangan bagikan ke orang lain._`;

  const sent = await sendFonnte(order.user_phone, message);
  await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
  await admin.from('token_deliveries').insert({
    phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
    order_id: order.id, access_token: accessToken, link,
    source: 'pakasir-poll', requested_by: 'poll-pending-orders',
  });
  await admin.from('wa_outbox').insert({
    phone: order.user_phone, message, status: sent.ok ? 'sent' : 'failed',
    error: sent.ok ? null : JSON.stringify(sent.data),
    related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
  });
  return { id: order.id, status: 'paid', sent: sent.ok };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('PAKASIR_API_KEY');
  const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
  if (!apiKey || !slug) {
    return new Response(JSON.stringify({ error: 'pakasir not configured' }), { status: 503, headers: corsHeaders });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: settings } = await admin.from('site_settings').select('value').eq('key', 'site_origin').maybeSingle();
  const origin = (settings?.value || 'https://replaytime.lovable.app').replace(/\/+$/, '');

  // Pull recent pending orders (last 24h, oldest first, capped)
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: orders, error } = await admin
    .from('orders')
    .select('*')
    .eq('status', 'pending')
    .gte('created_at', since)
    .not('pakasir_order_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(40);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const results: any[] = [];
  for (const o of orders ?? []) {
    try {
      results.push(await processOrder(admin, o, apiKey, slug, origin));
    } catch (e) {
      results.push({ id: o.id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, scanned: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
