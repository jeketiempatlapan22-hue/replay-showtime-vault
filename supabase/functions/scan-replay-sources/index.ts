// Scan semua replay aktif: cek apakah video YouTube-nya masih bisa diputar.
// Replay yang videonya dihapus/di-ban/embed diblokir otomatis ditandai is_offline
// sehingga hilang dari daftar replay user dan masuk menu "Replay Off" di admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isYouTubeVideoPlayable, isStreamUrlAlive, extractYouTubeId } from '../_shared/yt-check.ts';

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
      .select('id, title, youtube_id, youtube_alt_id, m3u8_url, sources, source_type, is_offline')
      .eq('is_offline', false)
      .limit(1000);
    if (error) return json({ error: error.message }, 500);

    const flagged: { id: string; title: string; reason: string }[] = [];
    let checked = 0;

    // Kumpulkan semua sumber per replay. Replay dianggap off hanya jika SEMUA sumbernya gagal.
    const checkOne = async (r: any) => {
      const list: { kind: 'yt' | 'url'; v: string }[] = [];
      const add = (kind: 'yt' | 'url', v: string) => { v = String(v || '').trim(); if (v && !list.some((x) => x.v === v)) list.push({ kind, v }); };
      if (r.youtube_id) add('yt', r.youtube_id);
      if (r.youtube_alt_id) add('yt', r.youtube_alt_id);
      if (r.m3u8_url) add('url', r.m3u8_url);
      for (const s of Array.isArray(r.sources) ? r.sources : []) {
        const u = String(s?.url || '').trim();
        if (!u) continue;
        if (s?.type === 'youtube' || extractYouTubeId(u) && !/^https?:\/\//.test(u) || /youtu\.?be/.test(u)) add('yt', u);
        else add('url', u);
      }
      if (!list.length) return { ok: false, reason: 'Sumber video kosong / tidak tersedia' };
      checked++;
      const reasons: string[] = [];
      for (const s of list) {
        const res = s.kind === 'yt' ? await isYouTubeVideoPlayable(s.v) : await isStreamUrlAlive(s.v);
        if (res.ok) return { ok: true, reason: '' };
        reasons.push(res.reason);
      }
      return { ok: false, reason: reasons[0] + (reasons.length > 1 ? ` (+${reasons.length - 1} sumber lain juga gagal)` : '') };
    };

    const rows = replays || [];
    for (let i = 0; i < rows.length; i += 8) {
      const chunk = rows.slice(i, i + 8);
      const res = await Promise.all(chunk.map(checkOne));
      res.forEach((x, j) => { if (!x.ok) flagged.push({ id: chunk[j].id, title: chunk[j].title, reason: x.reason }); });
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
