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

const PAID_STATUSES = new Set(['completed', 'paid', 'success']);

async function verifyPakasirPaid(apiKey: string, slug: string, pakasirOrderId: string, amount: number) {
  if (!pakasirOrderId || !amount || amount < 100) return { paid: false, status: 'invalid_order' };
  const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(slug)}&amount=${amount}&order_id=${encodeURIComponent(pakasirOrderId)}&api_key=${encodeURIComponent(apiKey)}`;
  const pres = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
  const pjson: any = await pres.json().catch(() => ({}));
  const tx = pjson?.transaction || pjson?.payment || {};
  const status = String(tx.status || pjson?.status || '').toLowerCase();
  const returnedOrderId = String(tx.order_id || tx.orderId || tx.merchant_order_id || pjson?.order_id || '').trim();
  const returnedProject = String(tx.project || pjson?.project || '').trim();
  const returnedAmount = Number(tx.amount ?? tx.nominal ?? pjson?.amount ?? 0);
  const orderMatches = !returnedOrderId || returnedOrderId === pakasirOrderId;
  const projectMatches = !returnedProject || returnedProject === slug;
  const amountMatches = !Number.isFinite(returnedAmount) || returnedAmount <= 0 || returnedAmount === amount;
  return {
    paid: pres.ok && PAID_STATUSES.has(status) && orderMatches && projectMatches && amountMatches,
    status: status || (pres.ok ? 'pending' : 'unreachable'),
  };
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
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
  } catch (e) {
    return { ok: false, data: { error: String(e) } };
  }
}

// Auto-retry lebih agresif untuk menghindari token/notifikasi hilang saat Fonnte lambat.
async function sendFonnte(phone: string, message: string) {
  const delays = [0, 1000, 3000, 7000, 12000];
  let last: { ok: boolean; data: unknown } = { ok: false, data: { error: 'no_attempt' } };
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    last = await sendFonnteOnce(phone, message);
    if (last.ok) return last;
  }
  return last;
}

async function hasSentWa(admin: ReturnType<typeof createClient>, orderId: string) {
  const { data } = await admin.from('wa_outbox')
    .select('id').eq('related_order_id', orderId).eq('status', 'sent').limit(1);
  return !!data?.length;
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

    // ===== MEMBERSHIP ORDER branch =====
    // Frontend polls with membership_orders.id; resolve there first.
    const { data: mOrder } = await admin
      .from('membership_orders').select('*').eq('id', orderUuid).maybeSingle();
    if (mOrder) {
      // Already finalized + WA sent → return as-is
      if (mOrder.status === 'paid' && mOrder.membership_token_id && mOrder.wa_sent_at) {
        return new Response(JSON.stringify({ ok: true, status: 'paid', already: true, membership: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let paid = mOrder.status === 'paid';
      if (!paid) {
        if (!mOrder.pakasir_order_id) {
          return new Response(JSON.stringify({ ok: true, status: 'pending', membership: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const verified = await verifyPakasirPaid(apiKey, slug, mOrder.pakasir_order_id, Number(mOrder.amount || 0));
        paid = verified.paid;
        if (!paid) {
          return new Response(JSON.stringify({ ok: true, status: verified.status || 'pending', membership: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Finalize (issue token) if not yet
      let tok: any = null;
      if (!mOrder.membership_token_id) {
        const { data: fin, error: ferr } = await admin.rpc('finalize_membership_order', { _order_id: mOrder.id });
        if (ferr) {
          await admin.from('membership_orders').update({
            wa_attempts: (Number(mOrder.wa_attempts) || 0) + 1,
            wa_last_attempt_at: new Date().toISOString(),
            wa_last_error: 'finalize_failed:' + ferr.message,
          }).eq('id', mOrder.id);
          return new Response(JSON.stringify({ error: 'finalize_failed', detail: ferr.message }), { status: 500, headers: corsHeaders });
        }
        tok = Array.isArray(fin) ? fin[0] : fin;
      } else {
        const { data: t } = await admin.from('membership_tokens')
          .select('token,password,expires_at,max_devices,includes_replays,duration_days,package_id')
          .eq('id', mOrder.membership_token_id).maybeSingle();
        const { data: pkg } = await admin.from('membership_packages')
          .select('name,replay_info,duration_days').eq('id', mOrder.package_id).maybeSingle();
        if (!t || !pkg) return new Response(JSON.stringify({ error: 'token_or_pkg_missing' }), { status: 500, headers: corsHeaders });
        tok = {
          token: t.token, password: t.password, expires_at: t.expires_at,
          max_devices: t.max_devices, includes_replays: t.includes_replays,
          duration_days: t.duration_days || pkg.duration_days,
          replay_info: pkg.replay_info || '', package_name: pkg.name,
        };
      }

      // Atomic claim WA delivery
      const claimAt = new Date().toISOString();
      const { data: claimed } = await admin.from('membership_orders')
        .update({ wa_last_attempt_at: claimAt })
        .eq('id', mOrder.id).is('wa_sent_at', null).select('id');
      if (!claimed || claimed.length === 0) {
        return new Response(JSON.stringify({ ok: true, status: 'paid', membership: true, already_sent: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: msettings } = await admin
        .from('site_settings').select('key,value').in('key', ['site_origin','wa_membership_template']);
      const msm = new Map((msettings ?? []).map((s) => [s.key, s.value]));
      const morigin = (msm.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
      const mtpl = msm.get('wa_membership_template') ||
        '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';
      const mlink = `${morigin}/live?mtoken=${encodeURIComponent(tok.token)}&mp=${encodeURIComponent(tok.password)}`;
      const expiresStr = new Date(tok.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      const mmsg = mtpl
        .replace(/\{package_name\}/g, tok.package_name || '')
        .replace(/\{link\}/g, mlink)
        .replace(/\{password\}/g, tok.password || '')
        .replace(/\{expires_at\}/g, expiresStr)
        .replace(/\{duration_days\}/g, String(tok.duration_days || ''))
        .replace(/\{max_devices\}/g, String(tok.max_devices || 1))
        .replace(/\{replay_info\}/g, tok.replay_info || '')
        .replace(/\{replay_info_block\}/g, tok.replay_info ? `🎬 *Info Replay:*\n${tok.replay_info}\n\n` : '')
        .replace(/\{site\}/g, morigin.replace(/^https?:\/\//, ''));

      const sentM = await sendFonnte(mOrder.phone, mmsg);
      const nowIso = new Date().toISOString();
      await admin.from('membership_orders').update({
        wa_attempts: (Number(mOrder.wa_attempts) || 0) + 1,
        wa_last_attempt_at: nowIso,
        wa_last_error: sentM.ok ? null : JSON.stringify(sentM.data).slice(0, 500),
        wa_sent_at: sentM.ok ? nowIso : null,
      }).eq('id', mOrder.id);
      await admin.from('wa_outbox').insert({
        phone: mOrder.phone, message: mmsg, status: sentM.ok ? 'sent' : 'failed',
        error: sentM.ok ? null : JSON.stringify(sentM.data),
        related_order_id: mOrder.id, fonnte_response: sentM.data as Record<string, unknown>,
      });
      if (sentM.ok) {
        await admin.from('token_deliveries').insert({
          phone: mOrder.phone, replay_id: null, replay_title: `Membership • ${tok.package_name}`,
          order_id: null, access_token: tok.token, link: mlink,
          source: 'pakasir', requested_by: 'check-pakasir-status-membership',
        });
      }
      return new Response(JSON.stringify({ ok: true, status: 'paid', membership: true, sent: sentM.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: order } = await admin
      .from('orders').select('*').eq('id', orderUuid).maybeSingle();
    if (!order) return new Response(JSON.stringify({ error: 'order not found' }), { status: 404, headers: corsHeaders });

    const alreadySent = order.token_sent_at && await hasSentWa(admin, order.id);
    if (order.status === 'paid' && alreadySent) {
      return new Response(JSON.stringify({ ok: true, status: 'paid', already: true, access_token: order.access_token }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verified = await verifyPakasirPaid(apiKey, slug, order.pakasir_order_id || '', Number(order.amount || 0));
    if (!verified.paid) {
      return new Response(JSON.stringify({ ok: true, status: verified.status || 'pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (order.token_sent_at && !alreadySent) {
      await admin.from('orders').update({ token_sent_at: null }).eq('id', order.id);
      order.token_sent_at = null;
    }


    // === COIN TOP-UP branch ===
    if (order.kind === 'coin_topup') {
      const claimedAt = new Date().toISOString();
      const { data: claimed } = await admin.from('orders').update({ token_sent_at: claimedAt })
        .eq('id', order.id).is('token_sent_at', null).select('id');
      if (claimed && claimed.length > 0) {
        let newBal: number | null = null;
        if (order.user_id && order.coin_amount > 0) {
          const { data: credited, error: gerr } = await admin.rpc('credit_coin_topup_order', { _order_id: order.id });
          if (gerr) {
            await admin.from('orders').update({ token_sent_at: null }).eq('id', order.id).eq('token_sent_at', claimedAt);
            throw new Error('coin_credit_failed:' + gerr.message);
          }
          const row = Array.isArray(credited) ? credited[0] : credited;
          newBal = Number(row?.new_balance ?? 0);
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

    if (order.token_sent_at && await hasSentWa(admin, order.id)) {
      return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build link + message via admin-editable template (selaras dgn pakasir-webhook)
    const { data: settings } = await admin
      .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_message_template', 'wa_show_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
    const tpl = sm.get('wa_message_template') ||
      '🎬 *{title}*\n{date_line}\n🔗 Link Akses:\n{link}\n{password_line}{live_link_block}\n— *ReplayTime* 💖';
    const showTpl = sm.get('wa_show_template') ||
      '🔐 *TOKEN LIVE SATUAN*\n\n🎤 *{title}*\n\n📅 {date}\n\n🔗 *Link Live:*\n{live_link}\n\n🎬 *Link Replay:* {site}\n\n{password_line}👤 Hanya untuk *1 perangkat pertama*.\n\n— *ReplayTime* 💖';

    const isShowPurchase = !!order.show_id && !order.replay_id;
    const link = isShowPurchase
      ? `${origin}/live?show=${order.show_id}&t=${accessToken}`
      : `${origin}/akses?token=${accessToken}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;

    let password = '';
    let showDate = '';
    let groupLink = '';
    let replayInfo = '';
    if (order.show_id) {
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
    if (!password && order.replay_id && !order.show_id) {
      const { data: rep } = await admin
        .from('replays').select('password').eq('id', order.replay_id).maybeSingle();
      password = String(rep?.password || '').trim();
    }

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

    let message: string;
    if (isShowPurchase) {
      message = fillTpl(showTpl, showDate || dateStr, link, link);
      const extras: string[] = [];
      if (replayInfo) extras.push('', '🎞️ *Info Replay*', replayInfo);
      if (groupLink) extras.push('', '👥 *Link Grup*', groupLink);
      if (extras.length) message = message + '\n' + extras.join('\n');
    } else {
      message = fillTpl(tpl, dateStr, link, '');
    }

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
