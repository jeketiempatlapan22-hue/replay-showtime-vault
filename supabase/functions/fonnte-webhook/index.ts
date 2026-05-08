// Fonnte incoming webhook → handle commands. Public endpoint.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  return d;
}

async function sendFonnte(phone: string, message: string) {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return;
  const form = new FormData();
  form.append('target', normalizePhone(phone));
  form.append('message', message);
  form.append('countryCode', '62');
  await fetch('https://api.fonnte.com/send', {
    method: 'POST', headers: { Authorization: token }, body: form,
  }).catch(() => null);
}

function buildBaseUrl() {
  // Best-effort site origin; configurable via site_settings(key='site_origin')
  return '';
}

async function sha1(input: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

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
    return new Response('ok', { headers: corsHeaders });
  }

  if (!phone || !text) return new Response('ok', { headers: corsHeaders });

  const phoneNorm = normalizePhone(phone);
  const deviceNorm = normalizePhone(device);

  // Anti-loop: ignore echoes of bot's own outbound messages
  if (fromMe) return new Response('ok', { headers: corsHeaders });
  if (deviceNorm && deviceNorm === phoneNorm) return new Response('ok', { headers: corsHeaders });

  // Only process commands starting with '/' — silently ignore other chatter
  if (!text.startsWith('/')) return new Response('ok', { headers: corsHeaders });

  // Dedup: same phone+message within 60s = duplicate webhook delivery
  const hash = await sha1(text);
  const { error: dupErr } = await admin
    .from('bot_inbox_dedup')
    .insert({ phone: phoneNorm, message_hash: hash });
  if (dupErr) {
    // Likely unique violation → already processed recently
    return new Response('ok', { headers: corsHeaders });
  }
  // Janitor: prune entries older than 5 minutes
  await admin.from('bot_inbox_dedup')
    .delete()
    .lt('received_at', new Date(Date.now() - 5 * 60_000).toISOString());

  // Per-phone rate limit: max 1 reply per 8 seconds
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
  const ADMIN_ONLY = new Set(['/buattoken']);
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
      const origin = map.get('site_origin') || '';
      if (!arg) {
        const { data: replays } = await admin
          .from('replays')
          .select('id,title,date,show_name')
          .order('date', { ascending: false })
          .limit(8);
        if (!replays?.length) {
          reply = '📭 Belum ada replay tersimpan.';
        } else {
          reply = '🎬 *DAFTAR REPLAY TERBARU*\n\nGunakan: */buattoken <kode>*\nKode = 8 karakter pertama ID.\n\n' +
            replays.map((r) => `• \`${r.id.slice(0,8)}\` — ${r.title}\n  📅 ${r.date}`).join('\n\n');
        }
      } else {
        const code = arg.trim().toLowerCase();
        const { data: matches } = await admin
          .from('replays')
          .select('id,title,access_token')
          .ilike('id', `${code}%`)
          .limit(2);
        if (!matches?.length) {
          reply = `❌ Replay dengan kode *${code}* tidak ditemukan.`;
        } else if (matches.length > 1) {
          reply = `⚠️ Kode *${code}* ambigu (${matches.length} match). Gunakan kode lebih panjang.`;
        } else {
          const r = matches[0];
          let token = r.access_token;
          if (!token) {
            token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
            await admin.from('replays').update({ access_token: token }).eq('id', r.id);
          }
          const link = `${origin}/akses?token=${token}&replay=${r.id}`;
          reply = `✅ *Token Replay*\n\n${r.title}\n🔗 ${link}\n\n_Bagikan link ini ke pembeli._`;
          await admin.from('token_deliveries').insert({
            phone: phoneNorm, replay_id: r.id, replay_title: r.title,
            access_token: token, link, source: 'bot', requested_by: phoneNorm,
          });
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
    }
  }

  await sendFonnte(phoneNorm, reply || '✅ OK');
  await admin.from('wa_outbox').insert({
    phone: phoneNorm, message: reply, status: 'sent',
  });

  return new Response('ok', { headers: corsHeaders });
});
