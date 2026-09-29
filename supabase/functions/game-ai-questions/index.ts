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
    const count = Math.min(10, Math.max(1, Number(body.count) || 5));
    const topic = String(body.topic || 'JKT48 umum').slice(0, 200);
    const lyrics = body.game_type === 'lyrics';
    const userMsg = lyrics
      ? `Buat ${count} soal "Tebak Lagu" JKT48 dengan topik: ${topic}. prompt = potongan lirik pendek (1-2 baris, maksimal 15 kata, boleh parafrase) dari lagu JKT48 yang benar-benar ada; answer = judul lagu resmi; choices = 3 judul lagu JKT48 (salah satunya jawaban).`
      : `Buat ${count} soal tebak-tebakan dengan topik: ${topic}.`;

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
    if (res.status === 429) return json({ error: 'Terlalu banyak permintaan, coba lagi sebentar.' }, 429);
    if (res.status === 402) return json({ error: 'Kredit AI habis.' }, 402);
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { questions: [] };
    return json({ ok: true, questions: parsed.questions || [] });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
