// Fonnte incoming webhook → handle commands. Public endpoint.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

async function sendFonnte(phone: string, message: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return { ok: false, error: 'FONNTE_TOKEN not configured' };
  const form = new FormData();
  form.append('target', normalizePhone(phone));
  form.append('message', message);
  form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: token }, body: form,
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && (data as { status?: boolean })?.status !== false;
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
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
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
  let phone = '', text = '', device = '', fromMe = false;
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await req.json();
      phone = String(j.sender ?? j.from ?? '');
      device = String(j.device ?? '');
      text = String(j.message ?? j.text ?? '').trim();
      fromMe = j.fromMe === true || j.fromMe === 'true' || j.from_me === true;
    } else {
      const fd = await req.formData();
      phone = String(fd.get('sender') ?? fd.get('from') ?? '');
      device = String(fd.get('device') ?? '');
      text = String(fd.get('message') ?? fd.get('text') ?? '').trim();
      fromMe = String(fd.get('fromMe') ?? fd.get('from_me') ?? '') === 'true';
    }
  } catch {
    return debug('bad_payload');
  }

  if (!phone || !text) return debug('missing_phone_or_text');

  const phoneNorm = normalizePhone(phone);
  const deviceNorm = normalizePhone(device);

  // Anti-loop: ignore echoes of bot's own outbound messages
  if (!testMode && fromMe) return new Response('ok', { headers: corsHeaders });
  if (!testMode && deviceNorm && deviceNorm === phoneNorm) return new Response('ok', { headers: corsHeaders });

  // Only process commands starting with '/' — silently ignore other chatter
  if (!text.startsWith('/')) return debug('not_a_command', { phone: phoneNorm, text });

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
      return new Response('ok', { headers: corsHeaders });
    }
  }

  // Per-phone rate limit: max 1 reply per 8 seconds
  if (!testMode) {
    const RL_WINDOW_MS = 8000;
    const { data: rl } = await admin.from('bot_rate_limit')
      .select('last_sent_at').eq('phone', phoneNorm).maybeSingle();
    if (rl?.last_sent_at && Date.now() - new Date(rl.last_sent_at).getTime() < RL_WINDOW_MS) {
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
    await sendFonnte(phoneNorm, '❓ Command tidak dikenali. Ketik */menu* untuk daftar perintah.');
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
      await sendFonnte(phoneNorm, '🔒 Command ini hanya untuk admin bot. Hubungi owner untuk akses.');
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


  await sendFonnte(phoneNorm, reply || '✅ OK');
  await admin.from('wa_outbox').insert({
    phone: phoneNorm, message: reply, status: 'sent',
  });

  return new Response('ok', { headers: corsHeaders });
});
