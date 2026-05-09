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
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
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

function newToken(len = 40) {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return (a + b).slice(0, len);
}

function buildAttractiveTokenMessage(opts: {
  kind: 'master' | 'personal' | 'replay';
  title: string;
  link: string;
  liveUrl: string;
  showDate?: string;
}) {
  const header = opts.kind === 'personal'
    ? '🔐 *TOKEN SATUAN — REPLAYTIME*'
    : opts.kind === 'replay'
      ? '🎬 *TOKEN REPLAY — REPLAYTIME*'
      : '🎁 *TOKEN AKSES — REPLAYTIME*';

  const accessLine = opts.kind === 'personal'
    ? '👤  *Token Pribadi* — hanya untuk *1 perangkat pertama* yang membuka link.'
    : '🔓  *Token Multi-Device* — bisa dibuka di banyak perangkat.';

  const closing = opts.kind === 'personal'
    ? '⚠️  Mohon *jangan dibagikan* — perangkat lain tidak akan bisa membuka.'
    : '✨  Selamat menonton, semoga makin seru!';

  const lines: string[] = [];
  lines.push(header);
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`🎤  *${opts.title}*`);
  if (opts.showDate) lines.push(`📅  ${opts.showDate}`);
  lines.push('');
  lines.push('💡  *Cukup klik link di bawah* — langsung masuk ke halaman replay,');
  lines.push('     tanpa perlu memasukkan kode apa pun.');
  lines.push('');
  lines.push('🔗  *Link Akses Replay:*');
  lines.push(opts.link);
  lines.push('');
  if (opts.liveUrl) {
    lines.push('📺  *Bonus:* link yang sama juga bisa untuk *Live*');
    lines.push(`     ${opts.liveUrl}`);
    lines.push('');
  }
  lines.push(accessLine);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push(closing);
  lines.push('');
  lines.push('— ReplayTime 💖');
  return lines.join('\n');
}

async function createTokenInline(
  admin: ReturnType<typeof createClient>,
  opts: {
    kind: 'master' | 'personal' | 'replay';
    replayId: string;
    requestedBy: string;
    label?: string;
    maxDevices?: number;
    settingsMap: Map<string, string>;
  },
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const { data: replay } = await admin
      .from('replays').select('id,title,date').eq('id', opts.replayId).maybeSingle();
    if (!replay) return { ok: false, error: 'replay_not_found' };

    const origin = (opts.settingsMap.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
    const liveUrl = `${origin}/live`;
    const token = newToken();
    const isPersonal = opts.kind === 'personal';

    if (isPersonal) {
      const { error } = await admin.from('replay_personal_tokens').insert({
        replay_id: opts.replayId,
        token,
        label: opts.label || `via bot`,
        max_devices: Math.max(1, Math.min(10, opts.maxDevices ?? 1)),
      });
      if (error) return { ok: false, error: 'personal_create_failed:' + error.message };
    } else {
      const { error } = await admin.from('replays')
        .update({ access_token: token }).eq('id', opts.replayId);
      if (error) return { ok: false, error: 'master_create_failed:' + error.message };
    }

    const link = `${origin}/akses?token=${token}&replay=${opts.replayId}`;
    const showDate = (replay as { date?: string }).date
      ? new Date((replay as { date: string }).date).toLocaleDateString('id-ID', {
          day: '2-digit', month: 'long', year: 'numeric',
        })
      : '';
    const message = buildAttractiveTokenMessage({
      kind: opts.kind,
      title: (replay as { title: string }).title,
      link, liveUrl, showDate,
    });

    await admin.from('token_deliveries').insert({
      phone: opts.requestedBy,
      replay_id: opts.replayId,
      replay_title: (replay as { title: string }).title,
      access_token: token,
      link,
      source: 'bot',
      requested_by: opts.requestedBy,
    });

    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'inline_failed' };
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
  const ADMIN_ONLY = new Set(['/buattoken', '/createtoken', '/createtokenrep', '/createlink', '/createpub']);
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
          const res = await createTokenInline(admin, {
            kind: 'master', replayId: r.id, requestedBy: phoneNorm,
            label: `Bot ${phoneNorm}`, settingsMap: map as Map<string, string>,
          });
          reply = res.ok && res.message ? res.message : `❌ Gagal membuat token master. ${res.error || ''}`.trim();
        }
      }
    } else if (cmd === '/createtokenrep') {
      const code = arg.trim().toLowerCase();
      if (!code) {
        reply = 'ℹ️ Format: */createtokenrep <id|alias>*\n_Pakai alias admin yang Anda set di kartu replay, atau 8 karakter pertama ID._';
      } else {
        const { data: byAlias } = await admin
          .from('replays').select('id,title').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('replays').select('id,title').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Replay dengan id/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ *${code}* ambigu (${matches.length} match). Pakai alias unik atau id yang lebih panjang.`;
        else {
          const r = matches[0];
          const res = await createTokenInline(admin, {
            kind: 'replay', replayId: r.id, requestedBy: phoneNorm,
            label: `Bot ${phoneNorm}`, settingsMap: map as Map<string, string>,
          });
          reply = res.ok && res.message ? res.message : `❌ Gagal membuat token replay. ${res.error || ''}`.trim();
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
    } else if (cmd === '/createtoken') {
      const parts = arg.split(/\s+/).filter(Boolean);
      const code = (parts[0] || '').toLowerCase();
      const label = parts.slice(1).join(' ').trim();
      if (!code) {
        reply = 'ℹ️ Format: */createtoken <kode|alias> [label]*\n_Token replay personal (1 device). Kode = 8 karakter pertama ID replay, atau alias admin._\nKetik */buattoken* untuk melihat daftar replay.';
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
          const res = await createTokenInline(admin, {
            kind: 'personal', replayId: r.id, requestedBy: phoneNorm,
            label: label || `Bot ${phoneNorm}`, maxDevices: 1,
            settingsMap: map as Map<string, string>,
          });
          reply = res.ok && res.message ? res.message : `❌ Gagal membuat token satuan. ${res.error || ''}`.trim();
        }
      }
    } else if (cmd === '/createlink' || cmd === '/createpub') {
      const parts = arg.split(/\s+/).filter(Boolean);
      const code = (parts[0] || '').toLowerCase();
      const label = parts.slice(1).join(' ').trim();
      const isPublic = cmd === '/createpub';
      if (!code) {
        const { data: shows } = await admin
          .from('active_shows').select('id,title,show_date,show_time,admin_alias,is_live,live_auto_schedule')
          .eq('is_active', true).order('show_date', { ascending: false }).limit(10);
        const lines = (shows ?? []).map((s: any) => {
          const aliasLine = s.admin_alias ? `\n  🏷️ alias: \`${s.admin_alias}\`` : '';
          const liveTag = s.is_live ? ' 🔴 LIVE' : (s.live_auto_schedule ? ' ⏰ AUTO' : '');
          return `• \`${s.id.slice(0,8)}\` — ${s.title}${liveTag}\n  📅 ${s.show_date} ${String(s.show_time).slice(0,5)}${aliasLine}`;
        });
        reply = `ℹ️ Format: *${cmd} <kode|alias> [label]*\n_${isPublic ? 'Token publik (multi-device)' : 'Token satuan (1 device)'} untuk akses LIVE per show._\n\n` +
          (lines.length ? `🎤 *DAFTAR SHOW AKTIF*\n\n${lines.join('\n\n')}` : '📭 Belum ada show aktif.');
      } else {
        const { data: byAlias } = await admin
          .from('active_shows').select('id,title,show_date,show_time,live_password').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('active_shows').select('id,title,show_date,show_time,live_password').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Show dengan kode/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ Kode *${code}* ambigu. Pakai alias unik atau id lebih panjang.`;
        else {
          const s: any = matches[0];
          const token = newToken();
          const maxDevices = isPublic ? 50 : 1;
          const { error } = await admin.from('active_show_tokens').insert({
            show_id: s.id, token, kind: isPublic ? 'public' : 'personal',
            max_devices: maxDevices, label: label || `Bot ${phoneNorm}`,
          });
          if (error) {
            reply = `❌ Gagal membuat token. ${error.message}`;
          } else {
            const origin = (map.get('site_origin') || 'https://replaytime.lovable.app').replace(/\/+$/, '');
            const link = `${origin}/live?show=${s.id}&t=${token}`;
            const header = isPublic ? '🎁 *TOKEN LIVE PUBLIK*' : '🔐 *TOKEN LIVE SATUAN*';
            const access = isPublic ? `🔓 Bisa dibuka di ${maxDevices} perangkat.` : '👤 Hanya untuk *1 perangkat pertama*.';
            const livePwd = s.live_password ? String(s.live_password) : '';
            reply = [
              header,
              '━━━━━━━━━━━━━━━━━━━━',
              '',
              `🎤  *${s.title}*`,
              '',
              `📅  ${s.show_date} ${String(s.show_time).slice(0,5)}`,
              '',
              '🔗  *Link Akses Live:*',
              '',
              link,
              '',
              '🎬Link Replay : replaytime.lovable.app',
              '',
              livePwd ? `🗝️Sandi : ${livePwd}` : '',
              '',
              access,
              '',
              '━━━━━━━━━━━━━━━━━━━━',
            ].filter((l) => l !== '' || true).join('\n');
          }
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
