// Polls Pakasir for a given order's payment status. If paid, marks the order
// as paid, generates an access token, and sends the WhatsApp notification
// (same format as the pakasir-webhook). Idempotent via `token_sent_at`.
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

// Auto-retry: 3 attempts with 0/1s/3s backoff to survive transient Fonnte failures.
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

  try {
    const body = await req.json().catch(() => ({}));
    const orderUuid = String(body.order_id ?? '');
    if (!orderUuid) {
      return new Response(JSON.stringify({ error: 'missing order_id' }), { status: 400, headers: corsHeaders });
    }

    const apiKey = Deno.env.get('PAKASIR_API_KEY');
    const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
    if (!apiKey || !slug) {
      return new Response(JSON.stringify({ error: 'pakasir not configured' }), { status: 503, headers: corsHeaders });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order } = await admin
      .from('orders').select('*').eq('id', orderUuid).maybeSingle();
    if (!order) return new Response(JSON.stringify({ error: 'order not found' }), { status: 404, headers: corsHeaders });

    // Already paid + delivered → return current state
    if (order.status === 'paid' && order.token_sent_at) {
      return new Response(JSON.stringify({ ok: true, status: 'paid', already: true, access_token: order.access_token }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Query Pakasir
    const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(slug)}&amount=${order.amount}&order_id=${encodeURIComponent(order.pakasir_order_id || '')}&api_key=${encodeURIComponent(apiKey)}`;
    const pres = await fetch(url, { method: 'GET' });
    const pjson: any = await pres.json().catch(() => ({}));
    const tx = pjson?.transaction || pjson?.payment || {};
    const pStatus = String(tx.status || pjson?.status || '').toLowerCase();

    const isPaid = pStatus === 'completed' || pStatus === 'paid' || pStatus === 'success';
    if (!isPaid) {
      return new Response(JSON.stringify({ ok: true, status: pStatus || 'pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === COIN TOP-UP branch ===
    if (order.kind === 'coin_topup') {
      if (order.status !== 'paid') {
        await admin.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', order.id);
      }
      const claimedAt = new Date().toISOString();
      const { data: claimed } = await admin.from('orders').update({ token_sent_at: claimedAt })
        .eq('id', order.id).is('token_sent_at', null).select('id');
      if (claimed && claimed.length > 0) {
        let newBal: number | null = null;
        if (order.user_id && order.coin_amount > 0) {
          const { data: bal, error: gerr } = await admin.rpc('grant_coins', {
            _user_id: order.user_id, _delta: order.coin_amount,
            _reason: 'topup', _meta: { order_id: order.id } as any, _order_id: order.id,
          });
          if (!gerr) newBal = bal as number;
        }
        const msg = `✅ *Top-up berhasil*\n+${order.coin_amount} koin sudah masuk.${newBal != null ? `\nSaldo sekarang: *${newBal}* koin` : ''}\n\nTerima kasih 💖 — *ReplayTime*`;
        const sent = await sendFonnte(order.user_phone, msg);
        if (!sent.ok) {
          await admin.from('orders').update({ token_sent_at: null }).eq('id', order.id).eq('token_sent_at', claimedAt);
        }
        await admin.from('wa_outbox').insert({
          phone: order.user_phone, message: msg, status: sent.ok ? 'sent' : 'failed',
          error: sent.ok ? null : JSON.stringify(sent.data),
          related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
        });
      }
      return new Response(JSON.stringify({ ok: true, status: 'paid', topup: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Mark paid + provision a fresh single-device token row
    const accessToken = await ensurePurchaseToken(admin, order);
    if (order.status !== 'paid' || order.access_token !== accessToken) {
      await admin.from('orders').update({
        status: 'paid', paid_at: new Date().toISOString(), access_token: accessToken,
      }).eq('id', order.id);
    }

    if (order.token_sent_at) {
      return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build link + message via admin-editable template
    const { data: settings } = await admin
      .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_message_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
    const tpl = sm.get('wa_message_template') ||
      '🎬 *{title}*\n{date_line}\n🔗 Link Akses:\n{link}\n{password_line}{live_link_block}\n— *ReplayTime* 💖';
    const replayPart = order.replay_id ? `&replay=${order.replay_id}` : '';
    const link = `${origin}/akses?token=${accessToken}${replayPart}`;

    let password = '';
    let liveLink = '';
    if (order.show_id) {
      const { data: showRow } = await admin
        .from('active_shows').select('live_password').eq('id', order.show_id).maybeSingle();
      password = String(showRow?.live_password || '').trim();
      if (!order.replay_id) liveLink = `${origin}/live?show=${order.show_id}&t=${accessToken}`;
    }
    if (!password && order.replay_id && !order.show_id) {
      const { data: rep } = await admin
        .from('replays').select('password').eq('id', order.replay_id).maybeSingle();
      password = String(rep?.password || '').trim();
    }

    const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const message = tpl
      .replace(/\{date_line\}\n?/g, dateStr ? `📅 ${dateStr}\n` : '')
      .replace(/\{password_line\}\n?/g, password ? `🔐 Sandi: *${password}*\n` : '')
      .replace(/\{live_link_block\}\n?/g, liveLink ? `\n📺 Link Live:\n${liveLink}\n` : '')
      .replace(/\{title\}/g, order.item_title || '')
      .replace(/\{link\}/g, link)
      .replace(/\{live_link\}/g, liveLink)
      .replace(/\{password\}/g, password)
      .replace(/\{date\}/g, dateStr)
      .replace(/\{order_id\}/g, order.pakasir_order_id || '')
      .replace(/\{site\}/g, origin);

    // Atomic claim: only the first caller flips token_sent_at NULL -> now().
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await admin
      .from('orders')
      .update({ token_sent_at: claimedAt })
      .eq('id', order.id)
      .is('token_sent_at', null)
      .select('id');
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken, already: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sent = await sendFonnte(order.user_phone, message);
    if (!sent.ok) {
      await admin.from('orders').update({ token_sent_at: null })
        .eq('id', order.id).eq('token_sent_at', claimedAt);
    }
    await admin.from('token_deliveries').insert({
      phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
      order_id: order.id, access_token: accessToken, link,
      source: 'pakasir', requested_by: 'check-pakasir-status',
    });
    await admin.from('wa_outbox').insert({
      phone: order.user_phone, message, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
    });

    return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken, sent: sent.ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
