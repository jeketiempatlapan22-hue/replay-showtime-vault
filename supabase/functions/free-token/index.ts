// Mode gratis: menerbitkan kredensial playback IDN untuk halaman /free.
// - Hanya aktif bila admin menyalakan `free_mode_enabled` dan show cocok dengan `free_show_id`.
// - Terikat sidik jari perangkat (fingerprint) dan hanya berlaku 30 menit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GRANT_TTL_FREE } from '../_shared/stream-grant.ts';
import { cors, generateApiToken, PLAYBACK_URL, X_SEC_KEY, X_TOKEN_ID } from '../_shared/idn-credentials.ts';

Deno.serve(async (req) => {
  const corsHeaders = cors(req.headers.get('origin'));
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const showId = String(body?.showId || '').trim();
    const fingerprint = String(body?.fingerprint || '').trim();
    if (!fingerprint || fingerprint.length < 8 || fingerprint.length > 200) {
      return json({ error: 'fingerprint_required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: settings } = await supabase
      .from('site_settings').select('key,value').in('key', ['free_mode_enabled', 'free_show_id']);
    const map = Object.fromEntries((settings || []).map((s: any) => [s.key, String(s.value || '')]));
    if (map.free_mode_enabled !== 'true') return json({ error: 'free_off' }, 403);

    const freeShowId = map.free_show_id || '';
    if (!freeShowId) return json({ error: 'free_off' }, 403);
    if (showId && showId !== freeShowId) return json({ error: 'free_show_mismatch' }, 403);

    const { data: blk } = await supabase
      .from('blocked_browsers').select('id').eq('browser_id', fingerprint).eq('unblocked', false).maybeSingle();
    if (blk) return json({ error: 'blocked' }, 403);

    const { data: show } = await supabase
      .from('active_shows')
      .select('id,title,is_active,is_live,show_date,show_time,idn_show_id,live_hold_until')
      .eq('id', freeShowId).maybeSingle();
    if (!show || !show.is_active) return json({ error: 'free_off' }, 403);

    const idn = String(show.idn_show_id || '');
    if (!idn) return json({ error: 'idn_belum_diatur' }, 409);

    // Window live: manual is_live ATAU otomatis 20 menit sebelum jadwal s/d +8 jam.
    const autoLiveNow = (() => {
      if (!show.show_date || !show.show_time) return false;
      const startMs = new Date(`${show.show_date}T${String(show.show_time).slice(0, 8)}+07:00`).getTime();
      if (!Number.isFinite(startMs)) return false;
      const now = Date.now();
      return now >= startMs - 20 * 60 * 1000 && now <= startMs + 8 * 3600 * 1000;
    })();
    const held = show.live_hold_until && new Date(show.live_hold_until).getTime() > Date.now();
    if (held || (!show.is_live && !autoLiveNow)) return json({ error: 'belum_live', title: show.title }, 409);

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const expiresAt = new Date(Date.now() + GRANT_TTL_FREE * 1000).toISOString();
    await supabase.from('free_sessions').insert({
      fingerprint,
      show_id: show.id,
      ip,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
      expires_at: expiresAt,
    });

    const xApiToken = await generateApiToken(idn, GRANT_TTL_FREE);
    return json({
      title: show.title,
      xShowId: idn,
      xTokenId: X_TOKEN_ID,
      xSecKey: X_SEC_KEY,
      xApiToken,
      playbackUrl: PLAYBACK_URL,
      expiresIn: GRANT_TTL_FREE,
      expiresAt,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
