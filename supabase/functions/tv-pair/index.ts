// Pairing kode 6 digit untuk menonton di browser TV + sesi TV jangka panjang.
// - action=create : HP mengirim payload akses (sudah terbuka) -> dapat kode 6 digit.
// - action=claim  : TV mengirim kode -> dapat payload akses + session token, kode hangus.
// - action=renew  : TV memperbarui grant tiap ~28 menit agar siaran tidak terputus.
// - action=cast   : HP meminta alamat sementara (proxy) yang bisa dibuka Chromecast.
// Payload TIDAK pernah bisa dibaca publik dari tabel (RLS tertutup, hanya service role).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signGrant, verifyGrant } from '../_shared/stream-grant.ts';

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const randomCode = () => String(Math.floor(100000 + Math.random() * 900000));
const randomToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

// Grant yang diterbitkan ulang untuk TV: 35 menit, dirotasi tiap 28 menit oleh TV.
const TV_GRANT_TTL = 35 * 60;
// Alamat Chromecast: 6 jam (batas maksimum grant) agar cukup untuk satu siaran penuh.
const CAST_TTL = 6 * 3600;

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

      // Bersihkan kode & sesi kedaluwarsa sekalian.
      await supabase.from('tv_pair_codes').delete().lt('expires_at', new Date().toISOString());
      await supabase.from('tv_sessions').delete().lt('expires_at', new Date().toISOString());

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
        .select('code,payload,show_id,browser_id,expires_at,used_at')
        .eq('code', code)
        .maybeSingle();

      if (!data) return json({ error: 'not_found' }, 404);
      if (data.used_at) return json({ error: 'used' }, 410);
      if (new Date(data.expires_at).getTime() < Date.now()) return json({ error: 'expired' }, 410);

      await supabase.from('tv_pair_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('code', code);

      // Simpan sesi TV agar grant bisa dirotasi tanpa memakai kode lagi.
      const payload = (data.payload || {}) as Record<string, unknown>;
      const claims = await verifyGrant(String(payload.grant || ''));
      let sessionToken = '';
      if (claims) {
        sessionToken = randomToken();
        await supabase.from('tv_sessions').insert({
          session_token: sessionToken,
          show_id: data.show_id,
          browser_id: data.browser_id,
          claims: { sid: claims.sid, idn: claims.idn, bid: claims.bid, kind: claims.kind, tid: claims.tid },
          payload,
        });
      }

      return json({ ok: true, payload, show_id: data.show_id || '', session_token: sessionToken });
    }

    if (action === 'renew') {
      const sessionToken = String(body?.session_token || '').slice(0, 128);
      if (!sessionToken) return json({ error: 'session_required' }, 400);

      const { data: s } = await supabase
        .from('tv_sessions')
        .select('id,claims,payload,show_id,revoked,expires_at')
        .eq('session_token', sessionToken)
        .maybeSingle();
      if (!s || s.revoked) return json({ error: 'session_invalid' }, 403);
      if (new Date(s.expires_at).getTime() < Date.now()) return json({ error: 'session_expired' }, 410);

      const c = (s.claims || {}) as Record<string, string>;
      if (!c.sid || !c.idn) return json({ error: 'session_invalid' }, 403);
      const grant = await signGrant(
        { sid: c.sid, idn: c.idn, bid: c.bid || '', kind: (c.kind as any) || 'show', tid: c.tid },
        TV_GRANT_TTL,
      );
      const payload = { ...((s.payload || {}) as Record<string, unknown>), grant };
      return json({ ok: true, grant, payload, show_id: s.show_id || '' });
    }

    if (action === 'cast') {
      // HP sudah punya grant valid → terbitkan alamat proxy sementara untuk Chromecast.
      const grant = String(body?.grant || '');
      const claims = await verifyGrant(grant);
      if (!claims?.idn) return json({ error: 'unauthorized' }, 401);

      const castGrant = await signGrant(
        { sid: claims.sid, idn: claims.idn, bid: claims.bid, kind: claims.kind, tid: claims.tid },
        CAST_TTL,
      );
      const base = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
      return json({
        ok: true,
        url: `${base}/functions/v1/tv-stream?t=${encodeURIComponent(castGrant)}`,
        expires_in: CAST_TTL,
      });
    }

    return json({ error: 'bad_action' }, 400);
  } catch {
    return json({ error: 'server_error' }, 500);
  }
});
