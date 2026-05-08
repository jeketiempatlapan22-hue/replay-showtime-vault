// Fonnte incoming webhook → handle commands. Public endpoint.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-test',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function normalizePhone(raw: string) {
  const d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  return d;
}

async function sendFonnte(phone: string, message: string, inboxId = ''): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return { ok: false, error: 'FONNTE_TOKEN not configured' };
  const buildForm = (withInbox: boolean) => {
    const form = new FormData();
    form.append('target', normalizePhone(phone));
    form.append('message', message);
    form.append('countryCode', '62');
    if (withInbox && /^\d+$/.test(inboxId)) form.append('inboxid', inboxId);
    return form;
  };
  try {
    let res = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: token }, body: buildForm(true),
    });
    let data = await res.json().catch(() => ({}));
    let ok = res.ok && (data as { status?: boolean })?.status !== false;
    const reason = String((data as { reason?: string })?.reason || '').toLowerCase();
    if (!ok && inboxId && (reason.includes('inbox') || reason.includes('body'))) {
      res = await fetch('https://api.fonnte.com/send', {
        method: 'POST', headers: { Authorization: token }, body: buildForm(false),
      });
      data = await res.json().catch(() => ({}));
      ok = res.ok && (data as { status?: boolean })?.status !== false;
    }
    return { ok, data, error: ok ? undefined : JSON.stringify(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send_failed' };
  }
}

function buildBaseUrl() {
  // Best-effort site origin; configurable via site_settings(key='site_origin')
  return '';
}

async function sha1(input: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function callCreateToken(payload: Record<string, unknown>): Promise<{ ok: boolean; message?: string; error?: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/create-token`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'apikey': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) return { ok: false, error: j.error || `http_${res.status}` };
    return { ok: true, message: j.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' };
  }
}

async function isAuthorizedTestRequest(authHeader: string, admin: ReturnType<typeof createClient>) {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  if (bearer && bearer === serviceKey) return true;
  if (!bearer) return false;

  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(bearer);
    const userId = claims?.claims?.sub;
    if (!userId) return false;
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    return !!isAdmin;
  } catch {
    return false;
  }
}

function pickWebhookPayload(input: any) {
  if (Array.isArray(input)) return input[0] ?? {};
  if (Array.isArray(input?.data)) return input.data[0] ?? {};
  if (input?.data && typeof input.data === 'object') return input.data;
  return input ?? {};
}

async function logBotEvent(
  admin: ReturnType<typeof createClient>,
  event: {
    phone?: string; device?: string; message?: string; command?: string;
    inboxId?: string; fromMe?: boolean; eventName: string; detail?: Record<string, unknown>;
  },
) {
  try {
    await admin.from('bot_inbox_events').insert({
      phone: event.phone || null,
      device: event.device || null,
      message: event.message || null,
      command: event.command || null,
      inbox_id: event.inboxId || null,
      from_me: event.fromMe ?? false,
      event_name: event.eventName,
      detail: event.detail || {},
    });
  } catch { /* audit logging must never block bot replies */ }
}

async function sendAndAudit(
  admin: ReturnType<typeof createClient>,
  opts: { phone: string; message: string; inboxId?: string; testMode?: boolean; deliverTest?: boolean; command?: string; device?: string; fromMe?: boolean },
) {
  const sendResult = opts.testMode && !opts.deliverTest
    ? { ok: true, data: { skipped: true, reason: 'test_mode' } }
    : await sendFonnte(opts.phone, opts.message, opts.inboxId || '');

  await admin.from('wa_outbox').insert({
    phone: opts.phone,
    message: opts.message,
    status: sendResult.ok ? 'sent' : 'failed',
    error: sendResult.ok ? null : sendResult.error,
    fonnte_response: sendResult.data as Record<string, unknown> | undefined,
  });
  await logBotEvent(admin, {
    phone: opts.phone,
    device: opts.device,
    message: opts.message,
    command: opts.command,
    inboxId: opts.inboxId,
    fromMe: opts.fromMe,
    eventName: sendResult.ok ? 'reply_sent' : 'reply_failed',
    detail: { send: sendResult.data, error: sendResult.error },
  });

  return sendResult;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const authHeader = req.headers.get('Authorization') || '';
  const testMode = req.headers.get('x-bot-test') === 'true';
  const debug = (reason: string, extra: Record<string, unknown> = {}) =>
    testMode ? json({ ok: false, reason, ...extra }) : new Response('ok', { headers: corsHeaders });

  if (testMode && !(await isAuthorizedTestRequest(authHeader, admin))) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  // Fonnte sends as multipart/form-data, x-www-form-urlencoded, or json
  let phone = '', text = '', device = '', inboxId = '', fromMe = false, deliverTest = false;
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = pickWebhookPayload(await req.json());
      phone = String(j.sender ?? j.from ?? j.phone ?? j.target ?? '');
      device = String(j.device ?? j.device_number ?? '');
      text = String(j.message ?? j.text ?? j.body ?? j.caption ?? '').trim();
      inboxId = String(j.inboxid ?? j.inbox_id ?? j.id ?? '');
      fromMe = j.fromMe === true || j.fromMe === 'true' || j.from_me === true;
      deliverTest = j.deliver === true || j.deliver === 'true' || j.test_deliver === true;
    } else if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
      const fd = await req.formData();
      phone = String(fd.get('sender') ?? fd.get('from') ?? fd.get('phone') ?? fd.get('target') ?? '');
      device = String(fd.get('device') ?? fd.get('device_number') ?? '');
      text = String(fd.get('message') ?? fd.get('text') ?? fd.get('body') ?? fd.get('caption') ?? '').trim();
      inboxId = String(fd.get('inboxid') ?? fd.get('inbox_id') ?? fd.get('id') ?? '');
      fromMe = String(fd.get('fromMe') ?? fd.get('from_me') ?? '') === 'true';
      deliverTest = String(fd.get('deliver') ?? fd.get('test_deliver') ?? '') === 'true';
    } else {
      const raw = (await req.text()).trim();
      try {
        const j = pickWebhookPayload(JSON.parse(raw));
        phone = String(j.sender ?? j.from ?? j.phone ?? j.target ?? '');
        device = String(j.device ?? j.device_number ?? '');
        text = String(j.message ?? j.text ?? j.body ?? j.caption ?? '').trim();
        inboxId = String(j.inboxid ?? j.inbox_id ?? j.id ?? '');
        fromMe = j.fromMe === true || j.fromMe === 'true' || j.from_me === true;
        deliverTest = j.deliver === true || j.deliver === 'true' || j.test_deliver === true;
      } catch {
        text = raw;
      }
    }
  } catch {
    return debug('bad_payload');
  }

  if (!phone || !text) return debug('missing_phone_or_text');

  const phoneNorm = normalizePhone(phone);
  const deviceNorm = normalizePhone(device);
  const commandPreview = text.toLowerCase().split(/\s+/)[0] || '';

  await logBotEvent(admin, {
    phone: phoneNorm,
    device: deviceNorm,
    message: text,
    command: commandPreview,
    inboxId,
    fromMe,
    eventName: 'received',
  });

  // Only process commands starting with '/' — silently ignore other chatter
  if (!text.startsWith('/')) {
    await logBotEvent(admin, { phone: phoneNorm, device: deviceNorm, message: text, command: commandPreview, inboxId, fromMe, eventName: 'ignored_not_command' });
    return debug('not_a_command', { phone: phoneNorm, text });
  }

  // Anti-loop: ignore echoes, but still allow slash commands from the device owner/self chat.
  if (!testMode && fromMe && !text.startsWith('/')) return new Response('ok', { headers: corsHeaders });
  if (!testMode && deviceNorm && deviceNorm === phoneNorm && !text.startsWith('/')) return new Response('ok', { headers: corsHeaders });

  // Dedup: same phone+message within ~20s = duplicate webhook delivery from Fonnte.
  // Prune FIRST so genuine repeated commands (>20s apart) are not blocked.
  if (!testMode) {
    const hash = await sha1(text);
    await admin.from('bot_inbox_dedup')
      .delete()
      .lt('received_at', new Date(Date.now() - 20_000).toISOString());
    const { error: dupErr } = await admin
      .from('bot_inbox_dedup')
      .insert({ phone: phoneNorm, message_hash: hash });
    if (dupErr) {
      // Likely unique violation → already processed in last 20s
      await logBotEvent(admin, { phone: phoneNorm, device: deviceNorm, message: text, command: commandPreview, inboxId, fromMe, eventName: 'ignored_duplicate', detail: { error: dupErr.message } });
      return new Response('ok', { headers: corsHeaders });
    }
  }

  // Per-phone rate limit: max 1 reply per 8 seconds
  if (!testMode) {
    const RL_WINDOW_MS = 8000;
    const { data: rl } = await admin.from('bot_rate_limit')
      .select('last_sent_at').eq('phone', phoneNorm).maybeSingle();
    if (rl?.last_sent_at && Date.now() - new Date(rl.last_sent_at).getTime() < RL_WINDOW_MS) {
      await logBotEvent(admin, { phone: phoneNorm, device: deviceNorm, message: text, command: commandPreview, inboxId, fromMe, eventName: 'ignored_rate_limited', detail: { last_sent_at: rl.last_sent_at } });
      return new Response('ok', { headers: corsHeaders });
    }
    await admin.from('bot_rate_limit').upsert({ phone: phoneNorm, last_sent_at: new Date().toISOString() });
    // Janitor for rate limit (>10 min)
    await admin.from('bot_rate_limit').delete()
      .lt('last_sent_at', new Date(Date.now() - 10 * 60_000).toISOString());
  }

  const lower = text.toLowerCase();
  const [cmd, ...rest] = lower.split(/\s+/);
  const arg = rest.join(' ').trim();

  // Lookup command template
  const { data: command } = await admin
    .from('bot_commands')
    .select('*')
    .eq('trigger', cmd)
    .eq('enabled', true)
    .maybeSingle();

  if (!command) {
    await sendAndAudit(admin, {
      phone: phoneNorm,
      message: '❓ Command tidak dikenali. Ketik */menu* untuk daftar perintah.',
      inboxId,
      testMode,
      deliverTest,
      command: cmd,
      device: deviceNorm,
      fromMe,
    });
    return new Response('ok', { headers: corsHeaders });
  }

  // Admin-only commands
  const ADMIN_ONLY = new Set(['/buattoken', '/tokensatuan']);
  let isBotAdmin = false;
  if (ADMIN_ONLY.has(cmd)) {
    const { data: ba } = await admin
      .from('bot_admins')
      .select('phone')
      .eq('phone', phoneNorm)
      .eq('enabled', true)
      .maybeSingle();
    isBotAdmin = !!ba;
    if (!isBotAdmin) {
      await sendAndAudit(admin, {
        phone: phoneNorm,
        message: '🔒 Command ini hanya untuk admin bot. Hubungi owner untuk akses.',
        inboxId,
        testMode,
        deliverTest,
        command: cmd,
        device: deviceNorm,
        fromMe,
      });
      return new Response('ok', { headers: corsHeaders });
    }
  }

  let reply = command.response_template ?? '';

  // Settings substitution
  const { data: settings } = await admin.from('site_settings').select('key,value');
  const map = new Map((settings ?? []).map((s) => [s.key, s.value]));
  reply = reply.replaceAll('{{ADMIN_PHONE}}', map.get('whatsapp_number') ?? '');

  // Dynamic handlers
  if (command.is_dynamic) {
    if (cmd === '/show') {
      const { data: shows } = await admin
        .from('active_shows')
        .select('title,show_date,show_time,category,lineup')
        .eq('is_active', true)
        .order('show_date', { ascending: true })
        .order('show_time', { ascending: true })
        .limit(10);
      if (!shows?.length) {
        reply = '📭 Belum ada show aktif saat ini.';
      } else {
        reply = '🎤 *SHOW AKTIF*\n\n' + shows.map((s) => {
          const lineup = (s.lineup ?? []).join(', ');
          return `• *${s.title}*\n  📅 ${s.show_date} ${String(s.show_time).slice(0,5)}\n  🏷️ ${s.category}${lineup ? `\n  👥 ${lineup}` : ''}`;
        }).join('\n\n');
      }
    } else if (cmd === '/buattoken') {
      if (!arg) {
        const { data: replays } = await admin
          .from('replays')
          .select('id,title,date,admin_alias')
          .order('date', { ascending: false })
          .limit(8);
        if (!replays?.length) {
          reply = '📭 Belum ada replay tersimpan.';
        } else {
          reply = '🎬 *DAFTAR REPLAY TERBARU*\n\nGunakan: */buattoken <kode|alias>*\n_Kode = 8 karakter pertama ID, atau alias admin._\n\n' +
            replays.map((r: any) => {
              const aliasLine = r.admin_alias ? `\n  🏷️ alias: \`${r.admin_alias}\`` : '';
              return `• \`${r.id.slice(0,8)}\` — ${r.title}\n  📅 ${r.date}${aliasLine}`;
            }).join('\n\n');
        }
      } else {
        const code = arg.trim().toLowerCase();
        // Lookup: by admin_alias (exact, case-insensitive) OR by id prefix
        const { data: byAlias } = await admin
          .from('replays').select('id,title').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('replays').select('id,title').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Replay dengan kode/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ Kode *${code}* ambigu (${matches.length} match). Gunakan kode lebih panjang atau alias unik.`;
        else {
          const r = matches[0];
          const res = await callCreateToken({
            kind: 'master', replay_id: r.id, source: 'bot', requested_by: phoneNorm,
            label: `Bot ${phoneNorm}`,
          });
          reply = res.ok && res.message ? res.message : `❌ Gagal membuat token master. ${res.error || ''}`.trim();
        }
      }
    } else if (cmd === '/token') {
      if (!arg) {
        reply = 'ℹ️ Format: */token <kode_order>*\nContoh: /token ABC123';
      } else {
        const { data: order } = await admin
          .from('orders')
          .select('id,status,access_token,item_title,user_phone,replay_id')
          .or(`pakasir_order_id.eq.${arg},id.eq.${arg.length === 36 ? arg : '00000000-0000-0000-0000-000000000000'}`)
          .maybeSingle();

        if (!order) reply = `❌ Order *${arg}* tidak ditemukan.`;
        else if (order.user_phone !== phoneNorm) reply = '🔒 Nomor HP Anda tidak cocok dengan order ini.';
        else if (order.status !== 'paid') reply = `⏳ Order *${arg}* status: *${order.status}*. Belum dapat dikirim.`;
        else if (!order.access_token) reply = `⚠️ Order *${arg}* belum memiliki token. Hubungi admin.`;
        else {
          const origin = map.get('site_origin') || buildBaseUrl();
          const link = `${origin}/akses?token=${order.access_token}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;
          reply = `✅ *Token Anda*\n\n${order.item_title}\n🔗 ${link}\n\n_Klik link untuk membuka._`;
          await admin.from('token_deliveries').insert({
            phone: phoneNorm, replay_id: order.replay_id, replay_title: order.item_title,
            order_id: order.id, access_token: order.access_token, link,
            source: 'bot', requested_by: phoneNorm,
          });
        }
      }
    } else if (cmd === '/tokensatuan') {
      const parts = arg.split(/\s+/).filter(Boolean);
      const code = (parts[0] || '').toLowerCase();
      const label = parts.slice(1).join(' ').trim();
      if (!code) {
        reply = 'ℹ️ Format: */tokensatuan <kode|alias> [label]*\n_Kode = 8 karakter pertama ID replay, atau alias admin._\nKetik */buattoken* untuk melihat daftar replay.';
      } else {
        const { data: byAlias } = await admin
          .from('replays').select('id,title').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('replays').select('id,title').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Replay dengan kode/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ Kode *${code}* ambigu. Gunakan kode lebih panjang atau alias unik.`;
        else {
          const r = matches[0];
          const res = await callCreateToken({
            kind: 'personal', replay_id: r.id, source: 'bot', requested_by: phoneNorm,
            label: label || `Bot ${phoneNorm}`, max_devices: 1,
          });
          reply = res.ok && res.message ? res.message : `❌ Gagal membuat token satuan. ${res.error || ''}`.trim();
        }
      }
    }
  }


  const finalReply = reply || '✅ OK';
  const sendResult = await sendAndAudit(admin, {
    phone: phoneNorm,
    message: finalReply,
    inboxId,
    testMode,
    deliverTest,
    command: cmd,
    device: deviceNorm,
    fromMe,
  });

  if (testMode) {
    return json({ ok: true, phone: phoneNorm, command: cmd, reply: finalReply, delivered: deliverTest, send: sendResult });
  }

  return new Response('ok', { headers: corsHeaders });
});
