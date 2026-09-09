// Pairing kode 6 digit untuk menonton di browser TV.
// - action=create : HP mengirim payload akses (sudah terbuka) -> dapat kode 6 digit.
// - action=claim  : TV mengirim kode -> dapat payload akses, kode langsung hangus.
// Payload TIDAK pernah bisa dibaca publik dari tabel (RLS tertutup, hanya service role).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const randomCode = () => String(Math.floor(100000 + Math.random() * 900000));

Deno.serve(async (req) => {
  const corsHeaders = cors(req.headers.get('origin'));
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (action === 'create') {
      const payload = body?.payload;
      if (!payload || typeof payload !== 'object') return json({ error: 'payload_required' }, 400);
      const raw = JSON.stringify(payload);
      if (raw.length > 20000) return json({ error: 'payload_too_large' }, 400);

      const showId = String(body?.show_id || '').slice(0, 64);
      const browserId = String(body?.browser_id || '').slice(0, 200);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Bersihkan kode kedaluwarsa sekalian.
      await supabase.from('tv_pair_codes').delete().lt('expires_at', new Date().toISOString());

      for (let i = 0; i < 8; i++) {
        const code = randomCode();
        const { error } = await supabase.from('tv_pair_codes').insert({
          code, payload, show_id: showId || null, browser_id: browserId || null, expires_at: expiresAt,
        });
        if (!error) return json({ ok: true, code, expires_at: expiresAt });
      }
      return json({ error: 'code_unavailable' }, 500);
    }

    if (action === 'claim') {
      const code = String(body?.code || '').replace(/\D/g, '');
      if (code.length !== 6) return json({ error: 'bad_code' }, 400);

      const { data } = await supabase
        .from('tv_pair_codes')
        .select('code,payload,show_id,expires_at,used_at')
        .eq('code', code)
        .maybeSingle();

      if (!data) return json({ error: 'not_found' }, 404);
      if (data.used_at) return json({ error: 'used' }, 410);
      if (new Date(data.expires_at).getTime() < Date.now()) return json({ error: 'expired' }, 410);

      await supabase.from('tv_pair_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('code', code);

      return json({ ok: true, payload: data.payload, show_id: data.show_id || '' });
    }

    return json({ error: 'bad_action' }, 400);
  } catch {
    return json({ error: 'server_error' }, 500);
  }
});
