import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Sparkles, Save, Users, Square, Upload } from 'lucide-react';

function ImageField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [up, setUp] = useState(false);
  const upload = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) { toast({ title: 'Gambar maks 5MB', variant: 'destructive' }); return; }
    setUp(true);
    const path = `game/${crypto.randomUUID()}.${(f.name.split('.').pop() || 'jpg').toLowerCase()}`;
    const { error } = await supabase.storage.from('card-images').upload(path, f, { contentType: f.type });
    setUp(false);
    if (error) { toast({ title: 'Upload gagal', description: error.message, variant: 'destructive' }); return; }
    onChange(supabase.storage.from('card-images').getPublicUrl(path).data.publicUrl);
  };
  return (
    <div className="flex gap-2 items-center">
      <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      <label className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-secondary">
        <Upload className="w-4 h-4" />{up ? '...' : 'Upload'}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {value && <img src={value} alt="" className="w-9 h-9 rounded object-cover border border-border" />}
    </div>
  );
}

type Prize = { kind: 'coins' | 'show' | 'bundle'; coins?: number; weight: number };
type Q = { id?: string; prompt: string; image_url: string; answer: string; alt_answers: string; reveal_image_url: string };
type Round = { id?: string; title: string; description: string; game_type: string; starts_at: string; ends_at: string; is_published: boolean; prizes: Prize[] };

const db = supabase as any;
const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const blank = (): Round => ({ title: '', description: '', game_type: 'quiz', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString(), is_published: false,
  prizes: [{ kind: 'coins', coins: 3, weight: 5 }, { kind: 'show', weight: 2 }, { kind: 'bundle', weight: 1 }] });
const blankQ = (): Q => ({ prompt: '', image_url: '', answer: '', alt_answers: '', reveal_image_url: '' });

export default function GameAdmin() {
  const [rounds, setRounds] = useState<any[]>([]);
  const [edit, setEdit] = useState<Round | null>(null);
  const [qs, setQs] = useState<Q[]>([]);
  const [entries, setEntries] = useState<any[] | null>(null);
  const [aiTopic, setAiTopic] = useState('member JKT48 generasi terbaru');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await db.from('game_rounds').select('*').order('starts_at', { ascending: false });
    setRounds(data || []);
  };
  useEffect(() => { void load(); }, []);

  const open = async (r?: any) => {
    setEntries(null);
    if (!r) { setEdit(blank()); setQs([blankQ()]); return; }
    setEdit({ ...r, prizes: r.prizes || [] });
    const { data } = await db.from('game_questions').select('*').eq('round_id', r.id).order('sort_order');
    setQs((data || []).map((q: any) => ({ ...q, alt_answers: (q.alt_answers || []).join(', ') })));
  };

  const save = async () => {
    if (!edit) return;
    if (!edit.title.trim() || !qs.length || qs.some((q) => !q.prompt.trim() || !q.answer.trim())) { toast({ title: 'Isi judul, soal dan jawaban', variant: 'destructive' }); return; }
    setBusy(true);
    const { id, ...rest } = edit as any;
    const payload = { images_cleaned: false, title: rest.title, description: rest.description, game_type: rest.game_type, starts_at: rest.starts_at, ends_at: rest.ends_at, is_published: rest.is_published, prizes: rest.prizes };
    const res = id ? await db.from('game_rounds').update(payload).eq('id', id).select('id').single() : await db.from('game_rounds').insert(payload).select('id').single();
    if (res.error) { setBusy(false); toast({ title: 'Gagal', description: res.error.message, variant: 'destructive' }); return; }
    const rid = res.data.id;
    await db.from('game_questions').delete().eq('round_id', rid);
    const { error } = await db.from('game_questions').insert(qs.map((q, i) => ({ round_id: rid, prompt: q.prompt, image_url: q.image_url, answer: q.answer, reveal_image_url: q.reveal_image_url, sort_order: i,
      alt_answers: q.alt_answers.split(',').map((s) => s.trim()).filter(Boolean) })));
    setBusy(false);
    if (error) { toast({ title: 'Gagal simpan soal', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Game disimpan' });
    setEdit({ ...edit, id: rid }); void load();
  };

  const stopNow = async (r: any) => { await db.from('game_rounds').update({ ends_at: new Date().toISOString() }).eq('id', r.id); toast({ title: 'Game dihentikan, gambar dibersihkan' }); await supabase.functions.invoke('game-play', { body: { action: 'list' } }); void load(); };
  const del = async (r: any) => { if (!confirm('Hapus game ini?')) return; await db.from('game_rounds').delete().eq('id', r.id); setEdit(null); void load(); };
  const showEntries = async (r: any) => {
    const { data } = await db.from('game_entries').select('*').eq('round_id', r.id).order('created_at');
    const ids = [...new Set((data || []).map((e: any) => e.user_id))];
    const { data: profs } = ids.length ? await db.from('profiles').select('user_id,email,username').in('user_id', ids) : { data: [] };
    setEntries((data || []).map((e: any) => ({ ...e, who: (profs || []).find((p: any) => p.user_id === e.user_id) })));
  };

  const genAi = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('game-ai-questions', { body: { topic: aiTopic, count: 5 } });
    setBusy(false);
    if (error || data?.error) { toast({ title: 'AI gagal', description: data?.error || error?.message, variant: 'destructive' }); return; }
    const add = (data.questions || []).map((q: any) => ({ ...blankQ(), prompt: q.prompt, answer: q.answer, alt_answers: (q.alt_answers || []).join(', ') }));
    setQs((cur) => [...cur.filter((q) => q.prompt.trim()), ...add]);
    toast({ title: `${add.length} soal AI ditambahkan — periksa kebenarannya dulu` });
  };

  const setP = (i: number, patch: Partial<Prize>) => edit && setEdit({ ...edit, prizes: edit.prizes.map((p, j) => j === i ? { ...p, ...patch } : p) });
  const setQ = (i: number, patch: Partial<Q>) => setQs((cur) => cur.map((q, j) => j === i ? { ...q, ...patch } : q));
  const now = new Date().toISOString();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Game Tebak-tebakan</h2><Button size="sm" onClick={() => open()}><Plus className="w-4 h-4 mr-1" />Game Baru</Button></div>
      <div className="space-y-2">
        {rounds.map((r) => (
          <div key={r.id} className="border border-border rounded-md p-2 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{r.title} {!r.is_published && <span className="text-xs text-muted-foreground">(draft)</span>}</p>
              <p className="text-xs text-muted-foreground">{new Date(r.starts_at).toLocaleString('id-ID')} – {new Date(r.ends_at).toLocaleString('id-ID')} {r.ends_at < now ? '• selesai' : r.starts_at <= now ? '• berlangsung' : ''}</p></div>
            <Button size="sm" variant="outline" onClick={() => open(r)}>Edit</Button>
            <Button size="sm" variant="outline" onClick={() => showEntries(r)}><Users className="w-4 h-4" /></Button>
            {r.ends_at > now && <Button size="sm" variant="outline" onClick={() => stopNow(r)}><Square className="w-4 h-4 mr-1" />Stop</Button>}
            <Button size="sm" variant="ghost" onClick={() => del(r)}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </div>

      {entries && (
        <div className="border border-border rounded-md p-3 space-y-1">
          <p className="font-semibold text-sm">Peserta ({entries.length}) • Menang {entries.filter((e) => e.won).length}</p>
          {entries.map((e) => (
            <p key={e.id} className="text-xs">{e.who?.username || e.who?.email || (e.user_id ? e.user_id.slice(0, 8) : `Tamu ${String(e.browser_id || '').slice(0, 6)}`)} — {e.correct_count}/{e.total} {e.won ? `🏆 ${e.prize?.kind === 'coins' ? `${e.prize.coins} koin` : e.prize?.title || e.prize?.kind || ''}` : ''}</p>
          ))}
        </div>
      )}

      {edit && (
        <div className="border border-primary/40 rounded-md p-3 space-y-3">
          <Input placeholder="Judul game" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <Textarea placeholder="Deskripsi (opsional)" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="text-xs">Mulai<Input type="datetime-local" value={toLocal(edit.starts_at)} onChange={(e) => setEdit({ ...edit, starts_at: new Date(e.target.value).toISOString() })} /></label>
            <label className="text-xs">Selesai<Input type="datetime-local" value={toLocal(edit.ends_at)} onChange={(e) => setEdit({ ...edit, ends_at: new Date(e.target.value).toISOString() })} /></label>
          </div>
          <div className="flex flex-wrap gap-1">{[15, 30, 60, 180, 1440].map((m) => <Button key={m} size="sm" variant="outline" onClick={() => setEdit({ ...edit, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + m * 60000).toISOString() })}>Mulai sekarang {m >= 60 ? `${m / 60} jam` : `${m} mnt`}</Button>)}</div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={edit.is_published} onCheckedChange={(v) => setEdit({ ...edit, is_published: v })} />Tampilkan ke user</label>

          <div className="space-y-2">
            <p className="font-semibold text-sm">Hadiah acak (peluang = bobot)</p>
            {edit.prizes.map((p, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={p.kind} onChange={(e) => setP(i, { kind: e.target.value as Prize['kind'] })}>
                  <option value="coins">Koin</option><option value="show">Show gratis (dipilih server)</option><option value="bundle">Bundel show</option>
                </select>
                {p.kind === 'coins' && <Input type="number" className="w-20" value={p.coins ?? 0} onChange={(e) => setP(i, { coins: Number(e.target.value) })} />}
                <Input type="number" className="w-20" title="Bobot" value={p.weight} onChange={(e) => setP(i, { weight: Number(e.target.value) })} />
                <Button size="icon" variant="ghost" onClick={() => setEdit({ ...edit, prizes: edit.prizes.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, prizes: [...edit.prizes, { kind: 'coins', coins: 1, weight: 1 }] })}><Plus className="w-4 h-4 mr-1" />Hadiah</Button>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-sm">Soal ({qs.length}) — user harus benar semua untuk menang</p>
            <div className="flex gap-2"><Input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="Topik soal AI" /><Button size="sm" disabled={busy} onClick={genAi}><Sparkles className="w-4 h-4 mr-1" />Soal AI</Button></div>
            {qs.map((q, i) => (
              <div key={i} className="border border-border rounded-md p-2 space-y-2">
                <div className="flex gap-2"><Textarea placeholder={`Soal ${i + 1} (mis. Tebak member dari potongan foto ini)`} value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} />
                  <Button size="icon" variant="ghost" onClick={() => setQs(qs.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button></div>
                <ImageField placeholder="Gambar soal / potongan foto (opsional)" value={q.image_url} onChange={(v) => setQ(i, { image_url: v })} />
                <Input placeholder="Jawaban" value={q.answer} onChange={(e) => setQ(i, { answer: e.target.value })} />
                <Input placeholder="Jawaban lain yang diterima, pisahkan koma" value={q.alt_answers} onChange={(e) => setQ(i, { alt_answers: e.target.value })} />
                <ImageField placeholder="Foto asli jawaban (opsional)" value={q.reveal_image_url} onChange={(v) => setQ(i, { reveal_image_url: v })} />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setQs([...qs, blankQ()])}><Plus className="w-4 h-4 mr-1" />Soal</Button>
          </div>
          <div className="flex gap-2"><Button disabled={busy} onClick={save}><Save className="w-4 h-4 mr-1" />Simpan</Button><Button variant="ghost" onClick={() => setEdit(null)}>Tutup</Button></div>
        </div>
      )}
    </div>
  );
}
