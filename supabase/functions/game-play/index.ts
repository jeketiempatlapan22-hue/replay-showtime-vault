// Game tebak-tebakan: ambil ronde aktif (tanpa jawaban) & kirim jawaban.
// Hadiah dipilih server secara acak. 1 user = 1 kesempatan per ronde.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { findBundleToken, issueBundleToken, getBundle } from '../_shared/bundle.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const genToken = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24);

type Prize = { kind: 'coins' | 'show' | 'bundle'; coins?: number; weight?: number };

function pickWeighted(list: Prize[]): Prize | null {
  const valid = list.filter((p) => Number(p.weight ?? 1) > 0);
  const total = valid.reduce((a, p) => a + Number(p.weight ?? 1), 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const p of valid) { r -= Number(p.weight ?? 1); if (r <= 0) return p; }
  return valid[valid.length - 1];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let userId: string | null = null;
    if (jwt) {
      const { data } = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${jwt}` } } }).auth.getUser();
      userId = data?.user?.id ?? null;
    }
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');
    const { data: st } = await admin.from('site_settings').select('value').eq('key', 'site_origin').maybeSingle();
    const origin = String(st?.value || 'https://realtime48stream.my.id').replace(/\/+$/, '');

    if (action === 'list') {
      const nowIso = new Date().toISOString();
      const { data: rounds } = await admin.from('game_rounds').select('id,title,description,game_type,starts_at,ends_at,prizes')
        .eq('is_published', true).gte('ends_at', new Date(Date.now() - 3 * 86400000).toISOString())
        .order('starts_at', { ascending: false }).limit(10);
      const ids = (rounds || []).map((r) => r.id);
      const { data: qs } = ids.length ? await admin.from('game_questions').select('id,round_id,prompt,image_url,answer,reveal_image_url,sort_order').in('round_id', ids).order('sort_order') : { data: [] as any[] };
      const { data: entries } = userId && ids.length ? await admin.from('game_entries').select('*').eq('user_id', userId).in('round_id', ids) : { data: [] as any[] };
      const out = (rounds || []).map((r) => {
        const entry = (entries || []).find((e: any) => e.round_id === r.id) || null;
        const ended = r.ends_at < nowIso;
        const reveal = !!entry || ended;
        return {
          ...r,
          prizes: (r.prizes as Prize[] || []).map((p) => ({ kind: p.kind, coins: p.coins })),
          status: r.starts_at > nowIso ? 'upcoming' : ended ? 'ended' : 'active',
          entry,
          questions: (qs || []).filter((q: any) => q.round_id === r.id).map((q: any) => ({
            id: q.id, prompt: q.prompt, image_url: q.image_url,
            ...(reveal ? { answer: q.answer, reveal_image_url: q.reveal_image_url } : {}),
          })),
        };
      });
      return json({ ok: true, rounds: out, signed_in: !!userId });
    }

    if (action === 'submit') {
      if (!userId) return json({ error: 'login_required' }, 401);
      const roundId = String(body.round_id || '');
      const answers = (body.answers && typeof body.answers === 'object') ? body.answers as Record<string, string> : {};
      const { data: round } = await admin.from('game_rounds').select('*').eq('id', roundId).eq('is_published', true).maybeSingle();
      if (!round) return json({ error: 'round_not_found' }, 404);
      const now = Date.now();
      if (new Date(round.starts_at).getTime() > now) return json({ error: 'not_started' }, 400);
      if (new Date(round.ends_at).getTime() < now) return json({ error: 'ended' }, 400);
      const { data: qs } = await admin.from('game_questions').select('id,answer,alt_answers').eq('round_id', roundId);
      if (!qs?.length) return json({ error: 'no_questions' }, 400);
      let correct = 0;
      const clean: Record<string, string> = {};
      for (const q of qs) {
        const a = String(answers[q.id] ?? '').slice(0, 200);
        clean[q.id] = a;
        const ok = [q.answer, ...(q.alt_answers || [])].map(norm).filter(Boolean).includes(norm(a));
        if (ok && norm(a)) correct++;
      }
      const won = correct === qs.length;
      // Klaim slot dulu (unique round_id+user_id) agar tidak bisa main 2x.
      const { data: entry, error: insErr } = await admin.from('game_entries').insert({
        round_id: roundId, user_id: userId, answers: clean, correct_count: correct, total: qs.length, won,
      }).select('*').single();
      if (insErr) return json({ error: 'already_played' }, 409);
      if (!won) return json({ ok: true, entry });

      const prizes = [...((round.prizes as Prize[]) || [])];
      let prize: any = null;
      for (let attempt = 0; attempt < 4 && !prize && prizes.length; attempt++) {
        const p = pickWeighted(prizes);
        if (!p) break;
        prizes.splice(prizes.indexOf(p), 1);
        if (p.kind === 'coins' && Number(p.coins) > 0) {
          await admin.rpc('grant_coins', { _user_id: userId, _delta: Number(p.coins), _reason: 'game_prize', _meta: { round_id: roundId } });
          prize = { kind: 'coins', coins: Number(p.coins) };
        } else if (p.kind === 'show') {
          const { data: shows } = await admin.from('active_shows').select('id,title,show_date,show_time,live_password,replay_info')
            .eq('is_active', true).is('replay_id', null);
          const upcoming = (shows || []).filter((s: any) => new Date(`${s.show_date}T${String(s.show_time).slice(0, 8)}+07:00`).getTime() > now - 3 * 3600000);
          if (!upcoming.length) continue;
          const s: any = upcoming[Math.floor(Math.random() * upcoming.length)];
          const token = genToken();
          await admin.from('active_show_tokens').insert({ show_id: s.id, token, label: `game:${userId}`, kind: 'personal', max_devices: 1, revoked: false });
          await admin.from('orders').insert({ user_id: userId, user_phone: '', show_id: s.id, item_title: `Show • ${s.title} (Hadiah Game)`, amount: 0, kind: 'show', status: 'paid', paid_at: new Date().toISOString(), access_token: token });
          prize = { kind: 'show', show_id: s.id, title: s.title, show_date: s.show_date, show_time: s.show_time, token,
            link: `${origin}/live?show=${s.id}&t=${token}`, password: String(s.live_password || ''), replay_info: String(s.replay_info || '') };
        } else if (p.kind === 'bundle') {
          const bundle = await getBundle(admin);
          if (!bundle || !bundle.is_active || !bundle.show_ids.length) continue;
          const existing = await findBundleToken(admin, { bundleId: bundle.id, userId, phone: '' });
          if (existing) continue;
          const issued = await issueBundleToken(admin, { userId, phone: '', label: `game:${userId}` });
          if (!issued) continue;
          await admin.from('orders').insert({ user_id: userId, user_phone: '', item_title: `Bundel • ${bundle.name} (Hadiah Game)`, amount: 0, kind: 'bundle', status: 'paid', paid_at: new Date().toISOString(), access_token: issued.token });
          prize = { kind: 'bundle', title: bundle.name, count: bundle.show_ids.length, token: issued.token,
            link: `${origin}/shows?bt=${issued.token}`, password: issued.password };
        }
      }
      if (!prize) {
        await admin.rpc('grant_coins', { _user_id: userId, _delta: 3, _reason: 'game_prize', _meta: { round_id: roundId, fallback: true } });
        prize = { kind: 'coins', coins: 3 };
      }
      const { data: updated } = await admin.from('game_entries').update({ prize }).eq('id', entry.id).select('*').single();
      return json({ ok: true, entry: updated });
    }
    return json({ error: 'bad_action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
