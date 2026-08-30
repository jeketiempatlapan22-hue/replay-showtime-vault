// Generates IDN (hanabira48) playback credentials server-side.
// PROTECTED: WAJIB membawa header `Authorization: Bearer <grant>` yang diterbitkan
// oleh unlock-live. Grant hanya diterbitkan untuk token yang terdaftar di Token
// Factory (token show / token membership) dan berumur maksimal 6 jam. Setiap
// request divalidasi ulang ke database: token harus masih ada, tidak dicabut,
// belum kedaluwarsa, dan perangkat masih terikat.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { bearerFrom, verifyGrant } from '../_shared/stream-grant.ts';
import { cors, generateApiToken, PLAYBACK_URL, X_SEC_KEY, X_TOKEN_ID } from '../_shared/idn-credentials.ts';

async function tokenStillValid(claims: { kind?: string; tid?: string; bid?: string; sid?: string }): Promise<boolean> {
  const kind = claims.kind;
  const tid = claims.tid;
  const bid = claims.bid || '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (bid) {
    const { data: blk } = await supabase
      .from('blocked_browsers').select('id').eq('browser_id', bid).eq('unblocked', false).maybeSingle();
    if (blk) return false;
  }

  // Jalur sandi show/master: grant pendek (30 menit), cukup pastikan show aktif.
  if (kind === 'password') {
    if (!claims.sid) return false;
    const { data: s } = await supabase
      .from('active_shows').select('id,is_active').eq('id', claims.sid).maybeSingle();
    return !!s && !!s.is_active;
  }

  if (!tid || (kind !== 'show' && kind !== 'membership')) return false;


  const now = Date.now();
  if (kind === 'show') {
    const { data: t } = await supabase
      .from('active_show_tokens').select('id,revoked,expires_at').eq('id', tid).maybeSingle();
    if (!t || t.revoked) return false;
    if (t.expires_at && new Date(t.expires_at).getTime() < now) return false;
    if (bid) {
      const { data: d } = await supabase
        .from('active_show_token_devices').select('id').eq('token_id', tid).eq('browser_id', bid).maybeSingle();
      if (!d) return false;
    }
    return true;
  }

  const { data: m } = await supabase
    .from('membership_tokens').select('id,revoked,expires_at,starts_at').eq('id', tid).maybeSingle();
  if (!m || m.revoked) return false;
  if (m.expires_at && new Date(m.expires_at).getTime() < now) return false;
  if (m.starts_at && new Date(m.starts_at).getTime() > now) return false;
  if (bid) {
    const { data: d } = await supabase
      .from('membership_token_devices').select('id').eq('token_id', tid).eq('browser_id', bid).maybeSingle();
    if (!d) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  const corsHeaders = cors(req.headers.get('origin'));
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const showId = String(body?.showId || '').trim();
    if (!showId || showId.length > 64) return json({ error: 'showId tidak valid' }, 400);

    // Bearer WAJIB. Fallback body.grant sengaja dihapus.
    const bearer = bearerFrom(req);
    const claims = bearer ? await verifyGrant(bearer) : null;
    if (!claims) return json({ error: 'unauthorized' }, 401);
    if (claims.idn !== showId) return json({ error: 'grant_mismatch' }, 403);
    if (!(await tokenStillValid(claims))) return json({ error: 'akses_ditolak' }, 403);

    const xApiToken = await generateApiToken(showId);
    return json({
      xShowId: showId,
      xTokenId: X_TOKEN_ID,
      xSecKey: X_SEC_KEY,
      xApiToken,
      playbackUrl: PLAYBACK_URL,
      expiresIn: 7200,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
