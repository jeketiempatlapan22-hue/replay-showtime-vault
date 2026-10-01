// Admin: buat soal tebak-tebakan seputar JKT48 dengan Lovable AI.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const uc = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: u } = await uc.auth.getUser();
    if (!u?.user) return json({ error: 'unauthorized' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    if (body.game_type === 'blur') {
      const { data: mem } = await admin.from('members').select('name,photo_url').neq('photo_url', '');
      const list = (mem || []).filter((m: any) => m.photo_url && m.name);
      if (list.length < 3) return json({ error: 'Foto member belum cukup (minimal 3 member berfoto di menu Member).' }, 400);
      const shuf = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
      const n = Math.min(Number(body.count) || 100, list.length);
      const questions = shuf(list).slice(0, n).map((m: any) => {
        const others = shuf(list.filter((o: any) => o.name !== m.name)).slice(0, 2).map((o: any) => o.name);
        return { prompt: 'Siapa member JKT48 di foto ini?', answer: m.name, alt_answers: [], choices: shuf([m.name, ...others]), image_url: m.photo_url };
      });
      return json({ ok: true, questions });
    }
    const total = Math.min(150, Math.max(1, Number(body.count) || 100));
    const batches = Math.ceil(total / 25);
    const results = await Promise.all(Array.from({ length: batches }, (_, b) => gen(body, Math.min(25, total - b * 25), b)));
    const err = results.find((r) => r.error);
    const all = results.flatMap((r) => r.questions || []);
    if (!all.length && err) return json({ error: err.error }, err.status || 500);
    const seen = new Set<string>();
    const questions = all.filter((q: any) => { const k = String(q.prompt).toLowerCase().trim(); if (!q.prompt || !q.answer || seen.has(k)) return false; seen.add(k); return true; });
    return json({ ok: true, questions });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

const FOCUS = ['member aktif dan generasi', 'single, album, center, dan lagu', 'setlist teater, tim, kapten, sejarah', 'alumni, sister group 48, event, julukan, asal kota, fakta unik', 'lirik dan judul lagu populer', 'campuran acak mudah sampai susah'];

async function gen(body: any, count: number, b: number): Promise<{ questions?: any[]; error?: string; status?: number }> {
  try {
    const topic = `${String(body.topic || 'JKT48 umum').slice(0, 200)}; fokus kelompok ini: ${FOCUS[b % FOCUS.length]}`;
    const lyrics = body.game_type === 'lyrics';
    const userMsg = lyrics
      ? `Buat ${count} soal "Tebak Lagu" JKT48 dengan topik: ${topic}. prompt = potongan lirik pendek (1-2 baris, maksimal 15 kata, boleh parafrase) dari lagu JKT48 yang benar-benar ada; answer = judul lagu resmi; choices = 3 judul lagu JKT48 (salah satunya jawaban).`
      : `Buat ${count} soal tebak-tebakan JKT48 yang beragam dan acak. Topik utama: ${topic}. Campur juga topik luas: member aktif & alumni, generasi, tim (Love/Dream/Passion), kapten, center single, judul single & album, setlist teater, lagu, sister group AKB48 dan grup 48 lain, sejarah JKT48 (tahun berdiri, teater fX Sudirman), event (handshake, Pemilihan Member Single/senbatsu), julukan & jikoshoukai, tanggal lahir, asal kota, fakta unik. Campur tingkat mudah, sedang, dan susah. Jangan ada soal yang mirip satu sama lain. Acak seed: ${crypto.randomUUID().slice(0, 8)}.`;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Kamu pembuat kuis penggemar JKT48 berbahasa Indonesia. Buat soal faktual yang jawabannya singkat (1-3 kata) dan pasti benar. Jika tidak yakin sebuah fakta, jangan dipakai.' },
          { role: 'user', content: userMsg },
        ],
        tools: [{ type: 'function', function: { name: 'soal', parameters: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { prompt: { type: 'string' }, answer: { type: 'string' }, alt_answers: { type: 'array', items: { type: 'string' } }, choices: { type: 'array', items: { type: 'string' }, description: '3 pilihan jawaban (A/B/C), salah satunya persis sama dengan answer' } }, required: ['prompt', 'answer', 'alt_answers', 'choices'] } } }, required: ['questions'] } } }],
        tool_choice: { type: 'function', function: { name: 'soal' } },
      }),
    });
    if (res.status === 429) return { error: 'Terlalu banyak permintaan, coba lagi sebentar.', status: 429 };
    if (res.status === 402) return { error: 'Kredit AI habis.', status: 402 };
    if (!res.ok) return { error: `AI error ${res.status}`, status: 500 };
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { questions: [] };
    return { questions: parsed.questions || [] };
  } catch (e) {
    return { error: String(e), status: 500 };
  }
}
