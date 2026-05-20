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

// Provision a fresh single-device token row for this paid order.
// Always issues a brand-new token (never reuses a stale order.access_token)
// and writes the matching row into active_show_tokens / replay_personal_tokens
// with max_devices = 1. Idempotent: if a row already exists for the order's
// current token, returns it as-is.
async function ensurePurchaseToken(admin: ReturnType<typeof createClient>, order: any): Promise<string> {
  if (order.access_token) {
    if (order.show_id && !order.replay_id) {
      const { data: existing } = await admin
        .from('active_show_tokens').select('id')
        .eq('show_id', order.show_id).eq('token', order.access_token).maybeSingle();
      if (existing) return order.access_token;
    } else if (order.replay_id) {
      const { data: existing } = await admin
        .from('replay_personal_tokens').select('id')
        .eq('replay_id', order.replay_id).eq('token', order.access_token).maybeSingle();
      if (existing) return order.access_token;
    }
  }
  const newTok = genToken();
  if (order.show_id && !order.replay_id) {
    await admin.from('active_show_tokens').insert({
      show_id: order.show_id, token: newTok,
      label: `pakasir:${order.user_phone || ''}`.slice(0, 120),
      kind: 'personal', max_devices: 1, revoked: false,
    });
  } else if (order.replay_id) {
    await admin.from('replay_personal_tokens').insert({
      replay_id: order.replay_id, token: newTok,
      label: `pakasir:${order.user_phone || ''}`.slice(0, 120),
      max_devices: 1, revoked: false,
    });
  }
  return newTok;
}

async function sendFonnteOnce(phone: string, message: string) {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return { ok: false, data: { error: 'no token' } };
  const form = new FormData();
  form.append('target', normalizePhone(phone));
  form.append('message', message);
  form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: token }, body: form,
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
  } catch (e) {
    return { ok: false, data: { error: String(e) } };
  }
}

// Auto-retry: 3 attempts with 0/1s/3s backoff so transient Fonnte errors
// do not silently swallow the post-payment notification.
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

  // === COIN TOP-UP branch ===
  if (order.kind === 'coin_topup') {
    if (order.status !== 'paid') {
      await admin.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', order.id);
    }
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await admin.from('orders').update({ token_sent_at: claimedAt })
      .eq('id', order.id).is('token_sent_at', null).select('id');
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ ok: true, already: true }), { headers: corsHeaders });
    }
    let newBal: number | null = null;
    if (order.user_id && order.coin_amount > 0) {
      const { data: bal, error: gerr } = await admin.rpc('grant_coins', {
        _user_id: order.user_id, _delta: order.coin_amount,
        _reason: 'topup', _meta: { order_id: order.id } as any, _order_id: order.id,
      });
      if (!gerr) newBal = bal as number;
    }
    const msg = [
      '✅ *Top-up Berhasil*',
      '━━━━━━━━━━━━━━',
      '',
      `🪙 +${order.coin_amount} koin masuk ke akun Anda.`,
      newBal != null ? `💰 Saldo sekarang: *${newBal}* koin` : null,
      '',
      '━━━━━━━━━━━━━━',
      '💖 Terima kasih — *ReplayTime*',
    ].filter((l) => l !== null).join('\n');
    const sent = await sendFonnte(order.user_phone, msg);
    if (!sent.ok) {
      await admin.from('orders').update({ token_sent_at: null }).eq('id', order.id).eq('token_sent_at', claimedAt);
    }
    await admin.from('wa_outbox').insert({
      phone: order.user_phone, message: msg, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ ok: true, topup: true, sent: sent.ok }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const accessToken = await ensurePurchaseToken(admin, order);
  // (claim happens after we mark paid, just before the Fonnte send below)
  await admin.from('orders').update({
    status: 'paid', paid_at: new Date().toISOString(), access_token: accessToken,
  }).eq('id', order.id);

  // Build link + load template/origin
  const { data: settings } = await admin
    .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_message_template', 'wa_show_template']);
  const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
  const origin = (sm.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
  const tpl = sm.get('wa_message_template') ||
    '🎬 *ReplayTime*\n━━━━━━━━━━━━━━\n\n🎤 *{title}*\n{date_line}🔗 *Link Akses*\n{link}\n{password_line}{live_link_block}━━━━━━━━━━━━━━\n✨ Selamat menonton! 💖';
  const showTpl = sm.get('wa_show_template') ||
    '🔐 *TOKEN LIVE SATUAN*\n\n🎤 *{title}*\n\n📅 {date}\n\n🔗 *Link Live:*\n{live_link}\n\n🎬 *Link Replay:* {site}\n\n{password_line}👤 Hanya untuk *1 perangkat pertama*.\n\n— *ReplayTime* 💖';
  // SHOW purchase: link langsung ke /live (token diverifikasi unlock-live).
  // REPLAY purchase: tetap via /akses agar membuka replay player.
  const isReplayOnlyPurchase = !!order.replay_id && !order.show_id;
  const link = order.show_id && !order.replay_id
    ? `${origin}/live?show=${order.show_id}&t=${accessToken}`
    : `${origin}/akses?token=${accessToken}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;

  let password = '';
  let showDate = '';
  if (order.show_id && !order.replay_id) {
    const { data: showRow } = await admin
      .from('active_shows').select('live_password,show_date,show_time').eq('id', order.show_id).maybeSingle();
    password = String(showRow?.live_password || '').trim();
    if (showRow?.show_date) {
      const d = String(showRow.show_date);
      const t = String(showRow.show_time || '').slice(0, 5);
      showDate = t ? `${d} ${t}` : d;
    }
  }
  // Pembelian replay via kartu replay: link token sudah cukup, sandi tidak dikirim.
  if (isReplayOnlyPurchase) password = '';

  const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const plainSite = (origin || 'https://replaytime.lovable.app').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const fillTpl = (t: string, dateValue: string, linkValue: string, liveLinkValue: string) => t
    .replace(/\{date_line\}/g, dateValue ? `📅 ${dateValue}\n\n` : '')
    .replace(/\{password_line\}/g, password ? `🗝️ Sandi: *${password}*\n\n` : '')
    .replace(/\{live_link_block\}/g, liveLinkValue ? `📺 *Link Live*\n${liveLinkValue}\n\n` : '')
    .replace(/\{title\}/g, order.item_title || '')
    .replace(/\{link\}/g, linkValue)
    .replace(/\{live_link\}/g, liveLinkValue)
    .replace(/\{password\}/g, password)
    .replace(/\{date\}/g, dateValue)
    .replace(/\{order_id\}/g, orderId)
    .replace(/\{site\}/g, plainSite);

  let message: string;
  if (order.show_id && !order.replay_id) {
    // SHOW purchase: pakai template editable dari admin (wa_show_template).
    message = fillTpl(showTpl, showDate || dateStr, link, link);
  } else if (isReplayOnlyPurchase) {
    // REPLAY purchase: selalu kirim link token langsung.
    message = [
      '🎬 *RealTime48*',
      '━━━━━━━━━━━━━━',
      '',
      `🎤 *${order.item_title || ''}*`,
      `📅 ${dateStr}`,
      '',
      '🎞️ *Link Replay*',
      link,
      '',
      '━━━━━━━━━━━━━━',
      '✨ Selamat menonton! 💖',
    ].join('\n');
  } else {
    message = fillTpl(tpl, dateStr, link, '');

  // Atomic claim: only the first caller flips token_sent_at NULL -> now().
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await admin
    .from('orders')
    .update({ token_sent_at: claimedAt })
    .eq('id', order.id)
    .is('token_sent_at', null)
    .select('id');
  if (!claimed || claimed.length === 0) {
    return new Response(JSON.stringify({ ok: true, already: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sent = await sendFonnte(order.user_phone, message);
  // Release the claim if Fonnte failed so a retry path can resend later.
  if (!sent.ok) {
    await admin.from('orders').update({ token_sent_at: null })
      .eq('id', order.id).eq('token_sent_at', claimedAt);
  }
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
