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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Fonnte sends as multipart/form-data or x-www-form-urlencoded
  let phone = '', text = '';
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await req.json();
      phone = String(j.sender ?? j.device ?? j.from ?? '');
      text = String(j.message ?? j.text ?? '').trim();
    } else {
      const fd = await req.formData();
      phone = String(fd.get('sender') ?? fd.get('from') ?? '');
      text = String(fd.get('message') ?? fd.get('text') ?? '').trim();
    }
  } catch {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!phone || !text) return new Response('ok', { headers: corsHeaders });

  const phoneNorm = normalizePhone(phone);
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
          const link = `${origin}/?token=${order.access_token}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;
          reply = `✅ *Token Anda*\n\n${order.item_title}\n🔗 ${link}\n\n_Klik link untuk membuka._`;
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
