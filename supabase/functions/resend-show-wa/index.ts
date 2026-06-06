// Admin-only: kirim ulang notifikasi WA untuk pembelian SHOW / REPLAY / COIN TOPUP
// yang gagal (misal karena Fonnte sedang disconnect). Membaca ulang template
// dari site_settings dan membangun pesan persis seperti pakasir-webhook.
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

async function buildMessage(admin: any, order: any) {
  const { data: settings } = await admin
    .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_message_template', 'wa_show_template']);
  const sm = new Map((settings ?? []).map((s: any) => [s.key, s.value]));
  const origin = (sm.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
  const tpl = sm.get('wa_message_template') ||
    '🎬 *ReplayTime*\n━━━━━━━━━━━━━━\n\n🎤 *{title}*\n{date_line}🔗 *Link Akses*\n{link}\n{password_line}{live_link_block}━━━━━━━━━━━━━━\n✨ Selamat menonton! 💖';
  const showTpl = sm.get('wa_show_template') ||
    '🔐 *TOKEN LIVE SATUAN*\n\n🎤 *{title}*\n\n📅 {date}\n\n🔗 *Link Live:*\n{live_link}\n\n🎬 *Link Replay:* {site}\n\n{password_line}👤 Hanya untuk *1 perangkat pertama*.\n\n— *ReplayTime* 💖';

  if (order.kind === 'coin_topup') {
    let newBal: number | null = null;
    if (order.user_id) {
      const { data: b } = await admin.from('coin_balances').select('balance').eq('user_id', order.user_id).maybeSingle();
      newBal = b?.balance ?? null;
    }
    return [
      '✅ *Top-up Berhasil*', '━━━━━━━━━━━━━━', '',
      `🪙 +${order.coin_amount} koin masuk ke akun Anda.`,
      newBal != null ? `💰 Saldo sekarang: *${newBal}* koin` : null,
      '', '━━━━━━━━━━━━━━', '💖 Terima kasih — *ReplayTime*',
    ].filter(Boolean).join('\n');
  }

  const accessToken = order.access_token || '';
  const isReplayOnly = !!order.replay_id && !order.show_id;
  const link = order.show_id && !order.replay_id
    ? `${origin}/live?show=${order.show_id}&t=${accessToken}`
    : `${origin}/akses?token=${accessToken}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;

  let password = '', showDate = '', groupLink = '', replayInfo = '';
  if (order.show_id && !order.replay_id) {
    const { data: showRow } = await admin
      .from('active_shows').select('live_password,show_date,show_time,group_link,replay_info').eq('id', order.show_id).maybeSingle();
    password = String(showRow?.live_password || '').trim();
    groupLink = String((showRow as any)?.group_link || '').trim();
    replayInfo = String((showRow as any)?.replay_info || '').trim();
    if (showRow?.show_date) {
      const d = String(showRow.show_date);
      const t = String(showRow.show_time || '').slice(0, 5);
      showDate = t ? `${d} ${t}` : d;
    }
  }
  if (isReplayOnly) password = '';

  const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const plainSite = origin.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const fillTpl = (t: string, dateValue: string, linkValue: string, liveLinkValue: string) => t
    .replace(/\{date_line\}/g, dateValue ? `📅 ${dateValue}\n\n` : '')
    .replace(/\{password_line\}/g, password ? `🗝️ Sandi: *${password}*\n\n` : '')
    .replace(/\{live_link_block\}/g, liveLinkValue ? `📺 *Link Live*\n${liveLinkValue}\n\n` : '')
    .replace(/\{title\}/g, order.item_title || '')
    .replace(/\{link\}/g, linkValue)
    .replace(/\{live_link\}/g, liveLinkValue)
    .replace(/\{password\}/g, password)
    .replace(/\{date\}/g, dateValue)
    .replace(/\{order_id\}/g, order.pakasir_order_id || '')
    .replace(/\{site\}/g, plainSite);

  if (order.show_id && !order.replay_id) {
    let message = fillTpl(showTpl, showDate || dateStr, link, link);
    const extras: string[] = [];
    if (replayInfo) extras.push('', '🎞️ *Info Replay*', replayInfo);
    if (groupLink) extras.push('', '👥 *Link Grup*', groupLink);
    if (extras.length) message = message + '\n' + extras.join('\n');
    return message;
  }
  if (isReplayOnly) {
    return [
      '🎬 *RealTime48*', '━━━━━━━━━━━━━━', '',
      `🎤 *${order.item_title || ''}*`,
      `📅 ${dateStr}`, '',
      '🎞️ *Link Replay*', link, '',
      '━━━━━━━━━━━━━━', '✨ Selamat menonton! 💖',
    ].join('\n');
  }
  return fillTpl(tpl, dateStr, link, '');
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
    const actorEmail = ud?.user?.email || '';
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));

    // ===== Manual send: admin enters a phone + show_id, we mint a brand-new
    // single-device token for that show and send the WA link. No order is
    // required — handy when admin needs to deliver a token outside the
    // normal purchase flow.
    if (body.manual_send === true || body.show_id) {
      const phoneRaw = String(body.phone || '').trim();
      const showId = String(body.show_id || '').trim();
      const label = String(body.label || 'admin-kirim').slice(0, 120);
      if (!phoneRaw || !showId) {
        return new Response(JSON.stringify({ error: 'phone_and_show_id_required' }), { status: 400, headers: corsHeaders });
      }
      const phone = phoneRaw.replace(/\D/g, '').replace(/^0/, '62');
      if (!/^62[0-9]{8,13}$/.test(phone)) {
        return new Response(JSON.stringify({ error: 'invalid_phone' }), { status: 400, headers: corsHeaders });
      }
      const { data: show } = await admin.from('active_shows')
        .select('id,title,show_date,show_time,live_password,group_link,replay_info').eq('id', showId).maybeSingle();
      if (!show) return new Response(JSON.stringify({ error: 'show_not_found' }), { status: 404, headers: corsHeaders });
      const newTok = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      await admin.from('active_show_tokens').insert({
        show_id: showId, token: newTok, label: `${label}:${phone}`.slice(0, 120),
        kind: 'personal', max_devices: 1, revoked: false,
      });
      const pseudoOrder = {
        id: null, show_id: showId, replay_id: null, kind: 'show',
        user_phone: phone, item_title: show.title, access_token: newTok,
      } as any;
      const message = await buildMessage(admin, pseudoOrder);
      const sent = await sendFonnte(phone, message);
      await admin.from('wa_outbox').insert({
        phone, message, status: sent.ok ? 'sent' : 'failed',
        error: sent.ok ? null : JSON.stringify(sent.data),
        related_order_id: null, fonnte_response: sent.data as Record<string, unknown>,
      });
      if (sent.ok) {
        await admin.from('token_deliveries').insert({
          phone, replay_id: null, replay_title: show.title, order_id: null,
          access_token: newTok, link: '', source: 'admin-manual', requested_by: 'resend-show-wa',
        });
      }
      await admin.from('admin_action_logs').insert({
        actor_user_id: uid, actor_email: actorEmail,
        action: 'show_manual_send', filter: { show_id: showId, phone },
        order_ids: [], affected_count: 1, details: { sent: sent.ok, token: newTok },
      });
      return new Response(JSON.stringify({ ok: true, sent: sent.ok, phone, token: newTok, error: sent.ok ? null : JSON.stringify(sent.data).slice(0, 200) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ids: string[] = Array.isArray(body.order_ids)
      ? body.order_ids.filter((x: unknown) => typeof x === 'string')
      : (body.order_id ? [String(body.order_id)] : []);
    const force: boolean = body.force === true;
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: 'no_order_ids' }), { status: 400, headers: corsHeaders });
    }
    if (ids.length > 200) {
      return new Response(JSON.stringify({ error: 'too_many' }), { status: 400, headers: corsHeaders });
    }

    const results: any[] = [];
    for (const oid of ids) {
      try {
        const { data: order } = await admin.from('orders').select('*').eq('id', oid).maybeSingle();
        if (!order) { results.push({ id: oid, error: 'not_found' }); continue; }
        // Non-paid orders must never receive token links from the resend path.
        // QRIS purchases are fulfilled only by Pakasir-verified webhook/polling.
        // Non-paid orders only proceed when admin explicitly uses `force`.
        // Coin top-ups are never delivered without real payment.
        if (order.status !== 'paid' && !force) {
          results.push({ id: oid, skipped: 'payment_not_verified' });
          continue;
        }
        if (order.kind === 'coin_topup' && order.status !== 'paid') {
          results.push({ id: oid, skipped: 'topup_needs_payment' });
          continue;
        }
        const labelPrefix = order.status === 'paid' ? 'paid-resend' : 'admin-force';
        if (order.kind !== 'coin_topup' && !order.access_token) {
          const newTok = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
          if (order.show_id && !order.replay_id) {
            await admin.from('active_show_tokens').insert({
              show_id: order.show_id, token: newTok,
              label: `${labelPrefix}:${order.user_phone || ''}`.slice(0, 120),
              kind: 'personal', max_devices: 1, revoked: false,
            });
          } else if (order.replay_id) {
            await admin.from('replay_personal_tokens').insert({
              replay_id: order.replay_id, token: newTok,
              label: `${labelPrefix}:${order.user_phone || ''}`.slice(0, 120),
              max_devices: 1, revoked: false,
            });
          }
          await admin.from('orders').update({ access_token: newTok }).eq('id', order.id);
          order.access_token = newTok;
        }
        // Dedup: latest wa_outbox is 'sent' -> skip unless force.
        if (!force) {
          const { data: last } = await admin.from('wa_outbox')
            .select('status').eq('related_order_id', oid)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (last?.status === 'sent') {
            results.push({ id: oid, skipped: 'already_sent' });
            continue;
          }
        }
        const message = await buildMessage(admin, order);
        const sent = await sendFonnte(order.user_phone, message);
        await admin.from('wa_outbox').insert({
          phone: order.user_phone, message, status: sent.ok ? 'sent' : 'failed',
          error: sent.ok ? null : JSON.stringify(sent.data),
          related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
        });
        if (sent.ok) {
          await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
          if (order.kind !== 'coin_topup' && order.access_token) {
            await admin.from('token_deliveries').insert({
              phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
              order_id: order.id, access_token: order.access_token,
              link: '', source: 'admin-resend', requested_by: 'resend-show-wa',
            });
          }
        }
        results.push({ id: oid, sent: sent.ok, phone: order.user_phone, error: sent.ok ? null : JSON.stringify(sent.data).slice(0, 200) });
      } catch (e) {
        results.push({ id: oid, error: String(e) });
      }
    }
    const ok = results.filter((r) => r.sent).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => r.error).length;
    await admin.from('admin_action_logs').insert({
      actor_user_id: uid, actor_email: actorEmail,
      action: ids.length > 1 ? 'show_resend_bulk' : 'show_resend_single',
      filter: { force }, order_ids: ids, affected_count: ids.length,
      details: { sent: ok, skipped, failed, results },
    });

    return new Response(JSON.stringify({ ok: true, total: ids.length, sent: ok, skipped, failed, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
