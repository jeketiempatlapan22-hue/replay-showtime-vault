// Pakasir webhook: konfirmasi pembayaran QRIS dinamis, lalu kirim token via Fonnte.
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
  const res = await fetch('https://api.fonnte.com/send', {
    method: 'POST', headers: { Authorization: token }, body: form,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expectedKey = Deno.env.get('PAKASIR_API_KEY');
  const expectedSlug = Deno.env.get('PAKASIR_PROJECT_SLUG');

  // Fail closed: webhook MUST be authenticated. If the API key secret isn't configured,
  // refuse all requests rather than accepting unauthenticated payment confirmations.
  if (!expectedKey) {
    return new Response(JSON.stringify({ error: 'webhook not configured' }), { status: 503, headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // Pakasir typically sends: order_id, amount, status, project, api_key, payment_method, completed_at
  const apiKey = String(body.api_key ?? req.headers.get('x-api-key') ?? '');
  const project = String(body.project ?? '');
  if (apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'invalid api key' }), { status: 401, headers: corsHeaders });
  }
  if (expectedSlug && project && project !== expectedSlug) {
    return new Response(JSON.stringify({ error: 'invalid project' }), { status: 401, headers: corsHeaders });
  }

  const orderId = String(body.order_id ?? '');
  const status = String(body.status ?? '').toLowerCase();
  if (!orderId) return new Response(JSON.stringify({ error: 'missing order_id' }), { status: 400, headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: order } = await admin
    .from('orders').select('*').eq('pakasir_order_id', orderId).maybeSingle();

  if (!order) {
    return new Response(JSON.stringify({ error: 'order not found' }), { status: 404, headers: corsHeaders });
  }

  if (status !== 'completed' && status !== 'paid' && status !== 'success') {
    await admin.from('orders').update({ status }).eq('id', order.id);
    return new Response(JSON.stringify({ ok: true, ignored: true, status }), { headers: corsHeaders });
  }

  // Idempotent: skip if already paid+sent
  if (order.status === 'paid' && order.token_sent_at) {
    return new Response(JSON.stringify({ ok: true, already: true }), { headers: corsHeaders });
  }

  const accessToken = order.access_token ?? genToken();
  // (claim happens after we mark paid, just before the Fonnte send below)
  await admin.from('orders').update({
    status: 'paid', paid_at: new Date().toISOString(), access_token: accessToken,
  }).eq('id', order.id);

  // Build link
  const { data: settings } = await admin.from('site_settings').select('key,value').eq('key', 'site_origin').maybeSingle();
  const origin = settings?.value || '';
  const replayPart = order.replay_id ? `&replay=${order.replay_id}` : '';
  const link = `${origin}/akses?token=${accessToken}${replayPart}`;

  // If this is an active-show purchase (not standalone replay), include per-show live password + live link.
  let showExtras = '';
  if (order.show_id && !order.replay_id) {
    const { data: showRow } = await admin
      .from('active_shows')
      .select('live_password, live_require_password')
      .eq('id', order.show_id)
      .maybeSingle();
    const liveLink = `${origin}/live?show=${order.show_id}&t=${accessToken}`;
    const pwd = String(showRow?.live_password || '').trim();
    if (pwd) {
      showExtras =
        `\n\n🔐 *Sandi tonton LIVE:*\n${pwd}\n` +
        `_Masukkan sandi ini di halaman Live untuk masuk._` +
        `\n\n▶️ Link tonton Live:\n${liveLink}`;
    } else {
      showExtras = `\n\n▶️ Link tonton Live:\n${liveLink}`;
    }
  }

  const message =
    `✅ *Pembayaran Berhasil*\n\n` +
    `${order.item_title}\n` +
    `Order: ${orderId}\n\n` +
    `🔗 Link akses Anda:\n${link}` +
    showExtras +
    `\n\n_Klik link di atas untuk membuka. Jangan bagikan ke orang lain._`;

  const sent = await sendFonnte(order.user_phone, message);

  await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
  await admin.from('token_deliveries').insert({
    phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
    order_id: order.id, access_token: accessToken, link,
    source: 'pakasir', requested_by: 'pakasir-webhook',
  });
  await admin.from('wa_outbox').insert({
    phone: order.user_phone, message, status: sent.ok ? 'sent' : 'failed',
    error: sent.ok ? null : JSON.stringify(sent.data),
    related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
  });

  return new Response(JSON.stringify({ ok: true, sent: sent.ok }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
