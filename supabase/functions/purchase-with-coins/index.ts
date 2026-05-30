// Spend coins to purchase a show or replay. Authenticated only. Atomic debit + token issuance + WhatsApp delivery.
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
function validPhone(p: string) { return /^62\d{8,13}$/.test(p); }
function genToken() { return crypto.randomUUID().replace(/-/g, '').slice(0, 24); }

async function sendFonnteOnce(phone: string, message: string) {
  const tok = Deno.env.get('FONNTE_TOKEN'); if (!tok) return { ok: false, data: { error: 'no_token' } };
  const form = new FormData();
  form.append('target', normalizePhone(phone)); form.append('message', message); form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: tok }, body: form, signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as any)?.status !== false, data };
  } catch (e) { return { ok: false, data: { error: String(e) } }; }
}
async function sendFonnte(phone: string, message: string) {
  const delays = [0, 1000, 3000];
  let last: any = { ok: false, data: { error: 'no_attempt' } };
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
    const authHeader = req.headers.get('Authorization') || '';
    const accessJwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!accessJwt) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${accessJwt}` } } });
    const { data: ud } = await userClient.auth.getUser();
    const user = ud?.user;
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(String(body.phone ?? ''));
    const showId: string | undefined = body.show_id || undefined;
    const replayId: string | undefined = body.replay_id || undefined;
    const kind = String(body.kind ?? 'show'); // 'show' | 'replay' | 'replay_only'
    if (!validPhone(phone)) return new Response(JSON.stringify({ error: 'invalid_phone' }), { status: 400, headers: corsHeaders });
    if (!['show','replay','replay_only'].includes(kind)) return new Response(JSON.stringify({ error: 'invalid_kind' }), { status: 400, headers: corsHeaders });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Resolve price + ids
    let price = 0; let itemTitle = ''; let resolvedShowId: string | null = null; let resolvedReplayId: string | null = null;
    if (kind === 'replay_only') {
      if (!replayId) return new Response(JSON.stringify({ error: 'missing_replay' }), { status: 400, headers: corsHeaders });
      const { data: rep } = await admin.from('replays').select('id,title,price_coins').eq('id', replayId).maybeSingle();
      if (!rep) return new Response(JSON.stringify({ error: 'replay_not_found' }), { status: 404, headers: corsHeaders });
      price = Number((rep as any).price_coins || 0);
      itemTitle = `Replay • ${rep.title}`;
      resolvedReplayId = rep.id;
    } else {
      if (!showId) return new Response(JSON.stringify({ error: 'missing_show' }), { status: 400, headers: corsHeaders });
      const { data: show } = await admin.from('active_shows').select('*').eq('id', showId).maybeSingle();
      if (!show) return new Response(JSON.stringify({ error: 'show_not_found' }), { status: 404, headers: corsHeaders });
      price = Number(kind === 'replay' ? (show as any).price_replay_coins : (show as any).price_show_coins) || 0;
      itemTitle = `${kind === 'replay' ? 'Replay' : 'Show'} • ${show.title}`;
      resolvedShowId = show.id;
      resolvedReplayId = kind === 'replay' ? show.replay_id : null;
    }
    if (price <= 0) return new Response(JSON.stringify({ error: 'coin_price_unset' }), { status: 400, headers: corsHeaders });

    // Idempotency: don't double-charge if user already has an unrevoked token for this item
    if (resolvedShowId && !resolvedReplayId) {
      const { data: existing } = await admin.from('active_show_tokens').select('token').eq('show_id', resolvedShowId).eq('label', `coin:${user.id}`).eq('revoked', false).maybeSingle();
      if (existing?.token) return new Response(JSON.stringify({ ok: true, already: true, access_token: existing.token }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else if (resolvedReplayId) {
      const { data: existing } = await admin.from('replay_personal_tokens').select('token').eq('replay_id', resolvedReplayId).eq('label', `coin:${user.id}`).eq('revoked', false).maybeSingle();
      if (existing?.token) return new Response(JSON.stringify({ ok: true, already: true, access_token: existing.token }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Atomic debit
    const { data: newBalance, error: debitErr } = await admin.rpc('debit_coins_for_purchase', {
      _user_id: user.id, _price: price,
      _reason: kind === 'replay' || kind === 'replay_only' ? 'purchase_replay' : 'purchase_show',
      _show_id: resolvedShowId, _replay_id: resolvedReplayId,
      _meta: { item_title: itemTitle, kind } as any,
    });
    if (debitErr) return new Response(JSON.stringify({ error: 'debit_failed', detail: debitErr.message }), { status: 500, headers: corsHeaders });
    if (newBalance === null) return new Response(JSON.stringify({ error: 'insufficient_balance' }), { status: 402, headers: corsHeaders });

    // Issue token
    const accessToken = genToken();
    if (resolvedShowId && !resolvedReplayId) {
      await admin.from('active_show_tokens').insert({ show_id: resolvedShowId, token: accessToken, label: `coin:${user.id}`, kind: 'personal', max_devices: 1, revoked: false });
    } else if (resolvedReplayId) {
      await admin.from('replay_personal_tokens').insert({ replay_id: resolvedReplayId, token: accessToken, label: `coin:${user.id}`, max_devices: 1, revoked: false });
    }

    // Persist a coin order record (paid immediately)
    const { data: order } = await admin.from('orders').insert({
      user_id: user.id, user_phone: phone, item_title: itemTitle,
      amount: 0, kind: kind === 'replay_only' ? 'replay_only' : kind,
      coin_amount: price, status: 'paid',
      paid_at: new Date().toISOString(), token_sent_at: new Date().toISOString(),
      access_token: accessToken, show_id: resolvedShowId, replay_id: resolvedReplayId,
    }).select('id').single();

    // Build WA message via shared templates (editable di Admin → Pakasir).
    const { data: settings } = await admin.from('site_settings').select('key,value').in('key', ['site_origin','wa_message_template','wa_show_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
    const tpl = sm.get('wa_message_template') ||
      '🎬 *ReplayTime*\n━━━━━━━━━━━━━━\n\n🎤 *{title}*\n{date_line}🔗 *Link Akses*\n{link}\n{password_line}{live_link_block}━━━━━━━━━━━━━━\n✨ Selamat menonton! 💖';
    const showTpl = sm.get('wa_show_template') ||
      '🔐 *TOKEN LIVE SATUAN*\n\n🎤 *{title}*\n\n📅 {date}\n\n🔗 *Link Live:*\n{live_link}\n\n🎬 *Link Replay:* {site}\n\n{password_line}👤 Hanya untuk *1 perangkat pertama*.\n\n— *ReplayTime* 💖';
    const isReplayOnlyPurchase = !!resolvedReplayId && !resolvedShowId;
    const link = resolvedShowId && !resolvedReplayId
      ? `${origin}/live?show=${resolvedShowId}&t=${accessToken}`
      : `${origin}/akses?token=${accessToken}${resolvedReplayId ? `&replay=${resolvedReplayId}` : ''}`;
    let password = '';
    let showDate = '';
    let groupLink = '';
    let replayInfo = '';
    if (resolvedShowId && !resolvedReplayId) {
      const { data: showRow } = await admin.from('active_shows').select('live_password,show_date,show_time,group_link,replay_info').eq('id', resolvedShowId).maybeSingle();
      password = String(showRow?.live_password || '').trim();
      groupLink = String((showRow as any)?.group_link || '').trim();
      replayInfo = String((showRow as any)?.replay_info || '').trim();
      if (showRow?.show_date) {
        const d = String(showRow.show_date);
        const t = String(showRow.show_time || '').slice(0, 5);
        showDate = t ? `${d} ${t}` : d;
      }
    }
    if (isReplayOnlyPurchase) password = '';
    const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const plainSite = (origin || 'https://replaytime.lovable.app').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const fillTpl = (t: string, dateValue: string, linkValue: string, liveLinkValue: string) => t
      .replace(/\{date_line\}/g, dateValue ? `📅 ${dateValue}\n\n` : '')
      .replace(/\{password_line\}/g, password ? `🗝️ Sandi: *${password}*\n\n` : '')
      .replace(/\{live_link_block\}/g, liveLinkValue ? `📺 *Link Live*\n${liveLinkValue}\n\n` : '')
      .replace(/\{title\}/g, itemTitle).replace(/\{link\}/g, linkValue)
      .replace(/\{live_link\}/g, liveLinkValue).replace(/\{password\}/g, password)
      .replace(/\{date\}/g, dateValue).replace(/\{order_id\}/g, order?.id || '').replace(/\{site\}/g, plainSite);
    let message: string;
    if (resolvedShowId && !resolvedReplayId) {
      // SHOW purchase: pakai template editable (wa_show_template).
      message = fillTpl(showTpl, showDate || dateStr, link, link);
      const extras: string[] = [];
      if (replayInfo) extras.push('', '🎞️ *Info Replay*', replayInfo);
      if (groupLink) extras.push('', '👥 *Link Grup*', groupLink);
      if (extras.length) message = message + '\n' + extras.join('\n');
    } else if (isReplayOnlyPurchase) {
      message = [
        '🎬 *RealTime48*',
        '━━━━━━━━━━━━━━',
        '',
        `🎤 *${itemTitle}*`,
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
    }

    const sent = await sendFonnte(phone, message);
    await admin.from('token_deliveries').insert({
      phone, replay_id: resolvedReplayId, replay_title: itemTitle,
      order_id: order?.id || null, access_token: accessToken, link,
      source: 'coins', requested_by: 'purchase-with-coins',
    });
    await admin.from('wa_outbox').insert({
      phone, message, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: order?.id || null, fonnte_response: sent.data,
    });

    return new Response(JSON.stringify({
      ok: true, access_token: accessToken, balance: newBalance, sent: sent.ok, link,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
