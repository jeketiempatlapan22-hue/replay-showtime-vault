// Buat kode penghubung Telegram untuk nomor WA.
// Dipanggil dari halaman Profil (user login) maupun oleh tamu dengan nomor yang
// pernah tercatat di orders (pembeli). Publik tapi aman: kode acak, tidak
// membocorkan data apa pun.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(String(body.phone ?? ''));
    if (!/^628\d{8,11}$/.test(phone)) {
      return new Response(JSON.stringify({ error: 'invalid_phone' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Identifikasi user login (opsional)
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data: ud } = await userClient.auth.getUser();
      userId = ud?.user?.id ?? null;
    }

    // Untuk tamu (tidak login), pastikan nomor memang pernah bertransaksi
    // supaya endpoint ini tidak bisa dipakai menyusupi nomor orang lain secara acak.
    if (!userId) {
      const { data: orderMatch } = await admin
        .from('orders').select('id').eq('user_phone', phone).limit(1).maybeSingle();
      if (!orderMatch) {
        return new Response(JSON.stringify({ error: 'phone_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Sudah terhubung? Laporkan statusnya saja (jangan bocorkan chat_id).
    const { data: existing } = await admin
      .from('telegram_links').select('chat_id,link_code').eq('phone', phone).maybeSingle();
    if (existing?.chat_id) {
      return new Response(JSON.stringify({ ok: true, already_linked: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const code = existing?.link_code || genCode();
    if (existing) {
      await admin.from('telegram_links').update({ user_id: userId }).eq('phone', phone);
    } else {
      await admin.from('telegram_links').insert({ phone, link_code: code, user_id: userId });
    }

    return new Response(JSON.stringify({ ok: true, code, bot: 'Real48time_bot' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
