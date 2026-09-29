import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getBrowserId } from '@/lib/browserId';
import { setShowPurchase } from '@/lib/purchases';
import { getDeviceFp } from '@/lib/deviceFp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Gamepad2, Gift, Copy, Radio, Coins, Clock, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';

type Q = { id: string; prompt: string; image_url: string; choices?: string[]; answer?: string; reveal_image_url?: string };
type Entry = { correct_count: number; total: number; won: boolean; prize: any; answers: Record<string, string> };
type Round = { id: string; title: string; description: string; starts_at: string; ends_at: string; status: 'upcoming' | 'active' | 'ended'; prizes: { kind: string; coins?: number }[]; questions: Q[]; entry: Entry | null };

const fmt = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const prizeLabel = (p: { kind: string; coins?: number }) => p.kind === 'coins' ? `${p.coins} Koin` : p.kind === 'show' ? 'Show Gratis' : 'Bundel Show';

function PrizeCard({ prize }: { prize: any }) {
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast({ title: 'Disalin' }); } catch { /* ignore */ } };
  if (!prize) return null;
  if (prize.kind === 'none') return <p className="text-sm text-muted-foreground">{prize.message}</p>;
  if (prize.kind === 'coins') return (
    <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 flex items-center gap-2"><Coins className="w-5 h-5 text-primary" /><span className="font-semibold">+{prize.coins} koin masuk ke saldo kamu</span></div>
  );
  const info = [
    prize.kind === 'show' ? `🎁 Hadiah Show Gratis: ${prize.title}` : `🎁 Hadiah Bundel: ${prize.title} (${prize.count} show)`,
    prize.show_date ? `📅 ${prize.show_date} ${String(prize.show_time || '').slice(0, 5)} WIB` : '',
    `🔗 Link: ${prize.link}`,
    prize.password ? `🗝️ Sandi: ${prize.password}` : '',
    prize.replay_info ? `🎬 Info Replay: ${prize.replay_info}` : '',
  ].filter(Boolean).join('\n');
  const watchTo = prize.kind === 'show' ? `/live?show=${prize.show_id}&t=${prize.token}` : `/shows?bt=${prize.token}`;
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 space-y-2">
      <p className="font-semibold flex items-center gap-2"><Gift className="w-5 h-5 text-primary" />{prize.kind === 'show' ? 'Show Gratis' : 'Bundel Show'}: {prize.title}</p>
      {prize.show_date && <p className="text-xs text-muted-foreground">{prize.show_date} • {String(prize.show_time || '').slice(0, 5)} WIB</p>}
      {prize.password && <p className="text-sm">Sandi: <b>{prize.password}</b></p>}
      {prize.replay_info && <p className="text-xs text-muted-foreground whitespace-pre-line">{prize.replay_info}</p>}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm"><Link to={watchTo}><Radio className="w-4 h-4 mr-1" />Tonton Live</Link></Button>
        <Button size="sm" variant="outline" onClick={() => copy(info)}><Copy className="w-4 h-4 mr-1" />Salin Link + Info Replay</Button>
      </div>
    </div>
  );
}

function RoundCard({ r, signedIn, onDone }: { r: Round; signedIn: boolean; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (r.questions.some((q) => !answers[q.id]?.trim())) { toast({ title: 'Isi semua jawaban dulu', variant: 'destructive' }); return; }
    if (!confirm('Kamu hanya punya 1 kesempatan. Kirim jawaban sekarang?')) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('game-play', { body: { action: 'submit', round_id: r.id, answers, browser_id: getBrowserId(), device_fp: await getDeviceFp() } });
    setBusy(false);
    if (error || data?.error) {
      const e = data?.error || error?.message;
      toast({ title: e === 'already_played' ? 'Kamu sudah bermain di ronde ini' : e === 'ended' ? 'Game sudah berakhir' : 'Gagal mengirim', variant: 'destructive' });
    } else {
      const p = data.entry?.prize;
      if (p?.kind === 'show' && p.show_id) setShowPurchase(p.show_id, { token: p.token, kind: 'show', paidAt: Date.now() });
      toast({ title: data.entry?.won ? 'Selamat, kamu menang! 🎉' : 'Jawaban terkirim' });
    }
    onDone();
  };
  const reveal = !!r.entry || r.status === 'ended';
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-bold text-lg">{r.title}</h2>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === 'active' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{r.status === 'active' ? 'Berlangsung' : r.status === 'upcoming' ? 'Segera' : 'Selesai'}</span>
        </div>
        {r.description && <p className="text-sm text-muted-foreground mt-1">{r.description}</p>}
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{fmt(r.starts_at)} – {fmt(r.ends_at)}</p>
        <div className="flex flex-wrap gap-1 mt-2">{r.prizes.map((p, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">{prizeLabel(p)}</span>)}</div>
      </div>

      {r.entry && (
        <div className="space-y-2">
          <p className="font-semibold flex items-center gap-2">{r.entry.won ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <XCircle className="w-5 h-5 text-destructive" />}Benar {r.entry.correct_count}/{r.entry.total}{r.entry.won ? ' — kamu menang!' : ' — belum beruntung'}</p>
          <PrizeCard prize={r.entry.prize} />
        </div>
      )}

      {r.status !== 'upcoming' && (
        <div className="space-y-4">
          {r.questions.map((q, i) => (
            <div key={q.id} className="space-y-2">
              <p className="font-medium text-sm">{i + 1}. {q.prompt}</p>
              {q.image_url && <img src={q.image_url} alt="" className="max-h-64 rounded-lg border border-border object-contain" />}
              {reveal ? (
                <div className="text-sm space-y-1">
                  {r.entry && <p className="text-muted-foreground">Jawabanmu: {r.entry.answers?.[q.id] || '-'}</p>}
                  <p>Jawaban: <b className="text-primary">{q.answer}</b></p>
                  {q.reveal_image_url && <img src={q.reveal_image_url} alt={q.answer} className="max-h-64 rounded-lg border border-border object-contain" />}
                </div>
              ) : (
                q.choices && q.choices.length > 0 ? (
                  <div className="grid gap-2">
                    {q.choices.map((c, ci) => (
                      <Button key={ci} type="button" variant={answers[q.id] === c ? 'default' : 'outline'} className="justify-start h-auto py-2 whitespace-normal text-left"
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: c }))}>
                        <b className="mr-2">{String.fromCharCode(65 + ci)}.</b>{c}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Input value={answers[q.id] || ''} maxLength={200} placeholder="Jawabanmu" onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                )
              )}
            </div>
          ))}
          {!reveal && r.status === 'active' && (<>
            {!signedIn && <p className="text-xs text-muted-foreground">Main tanpa akun: hadiah berupa show/bundel. Masuk akun agar juga bisa dapat hadiah koin.</p>}
            <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Mengirim...' : 'Kirim Jawaban (1x kesempatan)'}</Button>
          </>)}
        </div>
      )}
    </div>
  );
}

export default function Game() {
  const { user } = useAuth();
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.functions.invoke('game-play', { body: { action: 'list', browser_id: getBrowserId(), device_fp: await getDeviceFp() } });
    setRounds(data?.rounds || []);
  }, []);
  useEffect(() => { void load(); }, [load, user?.id]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Link to="/" className="text-sm text-muted-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" />Kembali</Link>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Gamepad2 className="w-6 h-6 text-primary" />Game & Hadiah</h1>
        <p className="text-sm text-muted-foreground">Jawab semua soal dengan benar untuk dapat hadiah acak: koin, show gratis, atau bundel show. Setiap akun/perangkat hanya punya 1 kesempatan per game, dan maksimal menang di 2 game.</p>
        {rounds === null ? <p className="text-sm text-muted-foreground">Memuat...</p>
          : rounds.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada game. Tunggu game berikutnya dari admin ya!</p>
          : rounds.map((r) => <RoundCard key={r.id} r={r} signedIn={!!user} onDone={load} />)}
      </div>
    </div>
  );
}
