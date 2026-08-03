// Scan semua replay aktif: cek apakah video YouTube-nya masih bisa diputar.
// Replay yang videonya dihapus/di-ban/embed diblokir otomatis ditandai is_offline
// sehingga hilang dari daftar replay user dan masuk menu "Replay Off" di admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isYouTubeVideoPlayable } from '../_shared/yt-check.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const cronKey = req.headers.get('x-cron-key') || '';
    const isCron = cronKey && cronKey === (Deno.env.get('CRON_KEY') || '');

    if (!isCron) {
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      const uid = claims?.claims?.sub;
      if (!uid) return json({ error: 'unauthorized' }, 401);
      const { data: roleRow } = await userClient
        .from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
      if (!roleRow) return json({ error: 'forbidden' }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: replays, error } = await admin
      .from('replays')
      .select('id, title, youtube_id, m3u8_url, sources, source_type, is_offline')
      .eq('is_offline', false)
      .limit(500);
    if (error) return json({ error: error.message }, 500);

    const flagged: { id: string; title: string; reason: string }[] = [];
    let checked = 0;

    for (const r of replays || []) {
      const sources = Array.isArray(r.sources) ? (r.sources as any[]) : [];
      const hasAltSource =
        sources.length > 0 || String(r.m3u8_url || '').trim() !== '';
      const ytId = String(r.youtube_id || '').trim();

      // Tidak ada sumber sama sekali -> langsung off
      if (!hasAltSource && !ytId) {
        flagged.push({ id: r.id, title: r.title, reason: 'Sumber video kosong / tidak tersedia' });
        continue;
      }
      // Punya sumber alternatif (m3u8/playlist) -> jangan diganggu
      if (hasAltSource) continue;

      checked++;
      const res = await isYouTubeVideoPlayable(ytId);
      if (!res.ok) flagged.push({ id: r.id, title: r.title, reason: res.reason });
    }

    for (const f of flagged) {
      await admin.from('replays').update({
        is_offline: true,
        offline_reason: f.reason,
        offline_at: new Date().toISOString(),
      }).eq('id', f.id);
    }

    console.log(`[scan-replay-sources] checked=${checked} flagged=${flagged.length}`);
    return json({ ok: true, total: (replays || []).length, checked, flagged });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
