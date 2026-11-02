import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/backend';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Stethoscope, CheckCircle2, XCircle, AlertTriangle, MessageCircle } from 'lucide-react';
import { getBrowserId } from '@/lib/browserId';
import { diagnoseLinkRouting, type DiagStep } from '@/lib/accessDiagnostic';

const REASON_TEXT: Record<string, string> = {
  maintenance: 'Server menolak karena token/nomor ini DIBLOKIR (Mode Perbaikan) — cek daftar blokir.',
  token_not_found: 'Token tidak ditemukan di database.',
  revoked: 'Token sudah dicabut.',
  expired: 'Token sudah kadaluarsa.',
  wrong_show: 'Token milik show lain, bukan show yang sedang aktif.',
  off: 'Tidak ada show yang sedang live.',
  device_limit: 'Batas perangkat token sudah penuh.',
  single_use_consumed: 'Token sekali pakai sudah dipakai.',
  bad_password: 'Sandi salah.',
  membership_paused: 'Paket membership sedang dijeda.',
  membership_no_replays: 'Membership ini tidak termasuk replay.',
  outside_membership_period: 'Replay di luar masa membership.',
  source_unavailable: 'Replay tidak punya sumber video yang hidup.',
  blocked: 'Perangkat/IP diblokir.',
};

type Replay = { id: string; title: string; date: string };

function StepRow({ s }: { s: DiagStep }) {
  const Icon = s.status === 'ok' ? CheckCircle2 : s.status === 'fail' ? XCircle : AlertTriangle;
  const color = s.status === 'ok' ? 'text-primary' : s.status === 'fail' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <li className="flex gap-2 text-sm">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0"><p className="font-medium text-foreground">{s.label}</p><p className="text-xs text-muted-foreground break-words">{s.detail}</p></div>
    </li>
  );
}

export default function AccessDiagnosticAdmin() {
  const [input, setInput] = useState('');
  const [testLive, setTestLive] = useState(false);
  const [replays, setReplays] = useState<Replay[]>([]);
  const [steps, setSteps] = useState<DiagStep[]>([]);
  const [running, setRunning] = useState(false);
  const [chatSteps, setChatSteps] = useState<DiagStep[]>([]);
  const [chatRunning, setChatRunning] = useState(false);

  useEffect(() => {
    supabase.from('replays').select('id,title,date').eq('is_offline', false).order('date', { ascending: false }).limit(300)
      .then(({ data }) => setReplays((data || []) as Replay[]));
  }, []);

  const run = async () => {
    setRunning(true);
    const out: DiagStep[] = [];
    const push = (s: DiagStep) => { out.push(s); setSteps([...out]); };
    try {
      const { data } = await supabase.from('site_settings').select('key,value')
        .in('key', ['maintenance_mode', 'main_origin', 'live_origin', 'replay_origin', 'replay_path']);
      const m = Object.fromEntries((data || []).map((r) => [r.key, r.value])) as Record<string, string>;
      push({ label: 'Mode Perbaikan', status: m.maintenance_mode === 'true' ? 'ok' : 'info', detail: m.maintenance_mode === 'true' ? 'AKTIF — pengujian berjalan dalam kondisi perbaikan.' : 'Tidak aktif. Hasil tetap berlaku, tapi aktifkan untuk uji kondisi sebenarnya.' });

      const r = diagnoseLinkRouting(input, m, replays.map((x) => x.id));
      r.steps.forEach(push);
      if (!r.parsed) return;
      const { kind, token, mtoken, btoken, replayId, password } = r.parsed;

      // Uji server: replay
      if (replayId) {
        const body: Record<string, string> = { replay_id: replayId, browser_id: getBrowserId() };
        if (token || mtoken || btoken) body.access_token = (token || mtoken || btoken)!; else if (password) body.password = password;
        const { data: d, error } = await supabase.functions.invoke('get-replay-source', { body });
        let res = d as { valid?: boolean; reason?: string } | null;
        if (error) { try { res = await (error as { context?: Response }).context?.json(); } catch { res = null; } }
        push(res?.valid
          ? { label: 'Server replay', status: 'ok', detail: 'Token diterima, sumber video tersedia.' }
          : { label: 'Server replay', status: 'fail', detail: `Ditolak: ${REASON_TEXT[res?.reason || ''] || res?.reason || error?.message || 'tanpa alasan'}` });
      }

      // Uji server: live
      if (kind === 'live') {
        if (!testLive) {
          push({ label: 'Server live', status: 'info', detail: 'Dilewati. Centang "Uji server live" untuk mengujinya.' });
        } else {
          const body: Record<string, unknown> = { browser_id: getBrowserId(), silent: true };
          if (mtoken) { body.mtoken = mtoken; if (password) body.mpassword = password; }
          else if (token) body.token = token;
          else if (btoken) body.token = btoken;
          else if (password) body.password = password;
          const { data: d, error } = await supabase.functions.invoke('unlock-live', { body });
          const res = d as { valid?: boolean; reason?: string; membership_token?: string } | null;
          push(res?.valid || res?.membership_token
            ? { label: 'Server live', status: 'ok', detail: 'Token diterima, live bisa diputar.' }
            : { label: 'Server live', status: 'fail', detail: `Ditolak: ${REASON_TEXT[res?.reason || ''] || res?.reason || error?.message || 'tanpa alasan'}` });
        }
      }
      const firstFail = out.find((s) => s.status === 'fail');
      push(firstFail
        ? { label: 'Titik kegagalan', status: 'fail', detail: `${firstFail.label}: ${firstFail.detail}` }
        : { label: 'Kesimpulan', status: 'ok', detail: 'Tidak ada kegagalan yang terdeteksi.' });
    } finally { setRunning(false); }
  };

  const runChat = async () => {
    setChatRunning(true);
    const out: DiagStep[] = [];
    const push = (s: DiagStep) => { out.push(s); setChatSteps([...out]); };
    const marker = `diag-${Math.random().toString(36).slice(2, 8)}`;
    let received = false;
    let resolveRecv: () => void = () => {};
    const recv = new Promise<void>((res) => { resolveRecv = res; });
    const ch = supabase.channel(`chat-diag-${marker}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_messages' }, (p) => {
        if ((p.new as { message?: string })?.message?.includes(marker)) { received = true; resolveRecv(); }
      });
    try {
      const status = await new Promise<string>((res) => {
        const t = setTimeout(() => res('TIMED_OUT'), 10000);
        ch.subscribe((s) => { if (s !== 'CLOSED') { clearTimeout(t); res(s); } });
      });
      push({ label: 'Koneksi realtime', status: status === 'SUBSCRIBED' ? 'ok' : 'fail', detail: status === 'SUBSCRIBED' ? 'Terhubung.' : `Gagal terhubung (${status}).` });
      const { data: ins, error } = await supabase.from('live_messages').insert({
        browser_id: getBrowserId(), name: 'Diagnostik', message: `Tes chat ${marker}`, is_admin: true, pinned: false, show_id: null,
      }).select('id').maybeSingle();
      push({ label: 'Kirim pesan (admin)', status: error ? 'fail' : 'ok', detail: error ? `Ditolak: ${error.message}` : 'Pesan tersimpan.' });
      if (!error) {
        await Promise.race([recv, new Promise((r) => setTimeout(r, 8000))]);
        push({ label: 'Pesan diterima realtime', status: received ? 'ok' : 'fail', detail: received ? 'Pesan muncul seketika di penonton lain.' : 'Pesan tidak sampai dalam 8 detik — realtime chat belum aktif di server.' });
        if (ins?.id) await supabase.from('live_messages').delete().eq('id', ins.id);
        else await supabase.from('live_messages').delete().like('message', `%${marker}%`);
      }
      const { error: readErr } = await supabase.from('live_messages').select('id').limit(1);
      push({ label: 'Baca pesan (penonton)', status: readErr ? 'fail' : 'ok', detail: readErr ? readErr.message : 'Penonton bisa membaca chat.' });
    } finally {
      supabase.removeChannel(ch);
      setChatRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Stethoscope className="h-4 w-4" /> Diagnostik Link Token</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Tempel link token live/replay dari Website A, reseller, atau pembelian user. Alat ini menelusuri pengalihan domain, Mode Perbaikan, dan jawaban server, lalu menunjukkan di mana link gagal.</p>
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://realtime48show.my.id/live?token=..." rows={3} className="font-mono text-xs" />
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox checked={testLive} onCheckedChange={(v) => setTestLive(v === true)} className="mt-0.5" />
            <span>Uji server live juga. Perhatian: memakai 1 slot perangkat token (token sekali pakai akan terpakai).</span>
          </label>
          <Button onClick={run} disabled={running || !input.trim()} className="w-full">{running ? 'Menguji…' : 'Jalankan Diagnostik'}</Button>
          {steps.length > 0 && <ul className="space-y-2 rounded-md border border-border p-3">{steps.map((s, i) => <StepRow key={i} s={s} />)}</ul>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4" /> Diagnostik Live Chat</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Mengirim pesan uji, memastikan pesan sampai seketika, lalu menghapusnya.</p>
          <Button variant="outline" onClick={runChat} disabled={chatRunning} className="w-full">{chatRunning ? 'Menguji…' : 'Uji Live Chat'}</Button>
          {chatSteps.length > 0 && <ul className="space-y-2 rounded-md border border-border p-3">{chatSteps.map((s, i) => <StepRow key={i} s={s} />)}</ul>}
        </CardContent>
      </Card>
    </div>
  );
}
