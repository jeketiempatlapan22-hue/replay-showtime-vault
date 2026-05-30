import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Copy, LogOut, RefreshCw, Search, Loader2, Radio, Film, Link2, Crown } from 'lucide-react';

type Session = { phone: string; pin: string; label: string };
type ShowRow = { id: string; title: string; show_date: string; show_time: string; image_url: string; category: string; is_live: boolean; is_active: boolean };
type ReplayRow = { id: string; title: string; show_name: string; date: string; image_url: string };
type PackageRow = { id: string; name: string; description: string; replay_info: string; max_devices: number; includes_replays: boolean; status: string; paused: boolean };

const SESSION_KEY = 'reseller_session';

function getSession(): Session | null {
  try { const v = sessionStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
function setSession(s: Session | null) {
  if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else sessionStorage.removeItem(SESSION_KEY);
}

function LoginCard({ onLogin }: { onLogin: (s: Session) => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneT = phone.trim();
    const pinT = pin.trim();
    if (!phoneT || !pinT) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reseller-auth', { body: { phone: phoneT, pin: pinT } });
      let d: any = data;
      if (error) {
        // Read actual JSON body from the non-2xx response (invoke wraps it as FunctionsHttpError)
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') d = await ctx.json();
          else if (ctx && typeof ctx.text === 'function') d = JSON.parse(await ctx.text());
        } catch { /* ignore */ }
      }
      if (!d?.ok) {
        const reason = d?.error;
        const desc =
          reason === 'locked' ? `Terlalu banyak percobaan. Coba lagi dalam ${d.seconds_remaining}s.`
          : reason === 'missing_fields' ? 'Nomor HP & PIN wajib diisi.'
          : reason === 'invalid_credentials' ? 'Nomor HP atau PIN salah. PIN bersifat case-sensitive (huruf besar/kecil berpengaruh).'
          : (reason || 'Gagal masuk.');
        toast({ title: 'Login gagal', description: desc, variant: 'destructive' });
        return;
      }
      const s: Session = { phone: d.phone, pin: pinT, label: d.label || '' };
      setSession(s);
      onLogin(s);
      toast({ title: 'Berhasil masuk', description: s.label || s.phone });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'gagal';
      toast({ title: 'Gagal', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 space-y-4 shadow-lg">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Panel Reseller</h1>
          <p className="text-xs text-muted-foreground">Masuk dengan nomor HP & PIN reseller</p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Nomor HP</Label>
          <Input placeholder="08xxxx atau 628xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">PIN</Label>
          <Input type="password" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Masuk
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Hubungi admin untuk mendaftarkan nomor & mendapat PIN.
        </p>
      </form>
    </div>
  );
}

function TokenResultDialog({
  open, onOpenChange, link, message, title, extra,
}: { open: boolean; onOpenChange: (v: boolean) => void; link: string; message: string; title: string; extra?: string }) {
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${label} tersalin` }); } catch {
      toast({ title: 'Gagal menyalin', variant: 'destructive' });
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">Link Baru: {title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {extra && <p className="text-xs text-muted-foreground">{extra}</p>}
          <div className="space-y-1">
            <Label className="text-xs">Link Akses</Label>
            <div className="flex gap-1">
              <Input readOnly value={link} className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={() => copy(link, 'Link')}><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pesan WA</Label>
            <pre className="whitespace-pre-wrap break-words text-xs font-mono bg-secondary/40 border border-border rounded-lg p-3 max-h-64 overflow-y-auto">{message}</pre>
            <Button onClick={() => copy(message, 'Pesan')} className="w-full"><Copy className="w-4 h-4 mr-2" />Salin Pesan</Button>
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            ⚠️ Token hanya berlaku selama masa berlaku & hanya untuk target yang dipilih.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MembershipPanel({ session, onCreated }: { session: Session; onCreated: (r: { link: string; message: string; title: string; extra: string }) => void }) {
  const [pkgs, setPkgs] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [daysMap, setDaysMap] = useState<Record<string, number>>({});
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('membership_packages')
      .select('id,name,description,replay_info,max_devices,includes_replays,status,paused')
      .order('sort_order', { ascending: true });
    if (error) toast({ title: 'Gagal memuat paket', description: error.message, variant: 'destructive' });
    else setPkgs((data ?? []) as PackageRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setDays = (id: string, v: number) => setDaysMap((m) => ({ ...m, [id]: v }));

  const create = async (pkg: PackageRow) => {
    const days = Math.max(2, Math.min(40, Number(daysMap[pkg.id] || 30)));
    setCreatingId(pkg.id);
    try {
      const { data, error } = await supabase.functions.invoke('reseller-create-membership', {
        body: { phone: session.phone, pin: session.pin, package_id: pkg.id, days },
      });
      let d: any = data;
      if (error) {
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') d = await ctx.json();
          else if (ctx && typeof ctx.text === 'function') d = JSON.parse(await ctx.text());
        } catch { /* ignore */ }
      }
      if (!d?.ok) throw new Error(d?.detail || d?.error || (error?.message ?? 'gagal'));
      try { await navigator.clipboard.writeText(d.message); } catch { /* ignore */ }
      onCreated({
        link: d.link, message: d.message, title: d.title || pkg.name,
        extra: `Membership ${days} hari · ${pkg.max_devices} device · Sandi: ${d.password}`,
      });
      toast({ title: 'Link membership dibuat & disalin', description: `${days} hari, ${pkg.max_devices} device` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'gagal';
      toast({ title: 'Gagal membuat link', description: msg, variant: 'destructive' });
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Muat ulang
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : pkgs.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Belum ada paket membership.</p>
      ) : pkgs.map((p) => {
        const days = daysMap[p.id] ?? 30;
        return (
          <div key={p.id} className="border border-border rounded-xl bg-card p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Crown className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  👤 {p.max_devices} device{p.includes_replays ? ' · 🎬 termasuk replay' : ''}
                </p>
                {p.replay_info && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{p.replay_info}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Durasi:</Label>
              <Input
                type="number" min={2} max={40} value={days}
                onChange={(e) => setDays(p.id, Number(e.target.value) || 0)}
                className="h-8 w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">hari (2–40)</span>
            </div>
            <Button size="sm" className="w-full" disabled={creatingId === p.id || days < 2 || days > 40} onClick={() => create(p)}>
              {creatingId === p.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
              Buat & Salin Link Membership
            </Button>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground italic pt-2">
        ℹ️ Pesan WA otomatis menyertakan info replay dari paket sesuai pengaturan admin.
      </p>
    </div>
  );
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [tab, setTab] = useState<'shows' | 'replays' | 'membership'>('shows');
  const [shows, setShows] = useState<ShowRow[]>([]);
  const [replays, setReplays] = useState<ReplayRow[]>([]);
  const [loadingS, setLoadingS] = useState(false);
  const [loadingR, setLoadingR] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 20;
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; message: string; title: string; extra?: string } | null>(null);

  const loadShows = async () => {
    setLoadingS(true);
    const { data, error } = await supabase.rpc('reseller_list_shows', { _phone: session.phone, _pin: session.pin });
    if (error) toast({ title: 'Gagal memuat show', description: error.message, variant: 'destructive' });
    else setShows((data ?? []) as ShowRow[]);
    setLoadingS(false);
  };

  const loadReplays = async () => {
    setLoadingR(true);
    const { data, error } = await supabase.rpc('reseller_list_replays', {
      _phone: session.phone, _pin: session.pin, _limit: PAGE, _offset: page * PAGE, _q: q.trim(),
    });
    if (error) toast({ title: 'Gagal memuat replay', description: error.message, variant: 'destructive' });
    else setReplays((data ?? []) as ReplayRow[]);
    setLoadingR(false);
  };

  useEffect(() => { loadShows(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadReplays(); /* eslint-disable-next-line */ }, [page]);

  const create = async (kind: 'show' | 'replay', id: string, title: string) => {
    setCreatingId(id);
    try {
      const { data, error } = await supabase.functions.invoke('reseller-create-token', {
        body: { phone: session.phone, pin: session.pin, kind, target_id: id },
      });
      if (error) throw error;
      const d = data as any;
      if (!d?.ok) throw new Error(d?.error || 'gagal');
      try { await navigator.clipboard.writeText(d.message); } catch { /* ignore */ }
      const expStr = d.expires_at ? new Date(d.expires_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      setResult({
        link: d.link, message: d.message, title: d.title || title,
        extra: kind === 'show' ? `Hanya untuk show ini · 1 device · Berlaku s/d ${expStr}` : `1 device · Berlaku s/d ${expStr}`,
      });
      toast({ title: 'Link baru dibuat & pesan tersalin' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'gagal';
      toast({ title: 'Gagal membuat link', description: msg, variant: 'destructive' });
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Reseller</p>
            <p className="font-semibold truncate">{session.label || `+${session.phone}`}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-1" />Keluar
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 pb-24">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="shows"><Radio className="w-4 h-4 mr-1" />Show</TabsTrigger>
            <TabsTrigger value="replays"><Film className="w-4 h-4 mr-1" />Replay</TabsTrigger>
            <TabsTrigger value="membership"><Crown className="w-4 h-4 mr-1" />Member</TabsTrigger>
          </TabsList>

          <TabsContent value="shows" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={loadShows} disabled={loadingS}>
                <RefreshCw className={`w-4 h-4 mr-1 ${loadingS ? 'animate-spin' : ''}`} />Muat ulang
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              ⏳ Token show berlaku sampai akhir jadwal show (jadwal + 8 jam) & terkunci ke show tersebut.
            </p>
            {loadingS ? (
              <p className="text-sm text-muted-foreground">Memuat…</p>
            ) : shows.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Belum ada show aktif.</p>
            ) : shows.map((s) => (
              <div key={s.id} className="border border-border rounded-xl bg-card p-3 flex gap-3">
                {s.image_url ? (
                  <img src={s.image_url} alt={s.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start gap-2">
                    <p className="font-semibold text-sm truncate flex-1">{s.title}</p>
                    {s.is_live && <Badge variant="destructive" className="text-[10px]">LIVE</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">📅 {s.show_date} · {String(s.show_time).slice(0, 5)}</p>
                  <Button size="sm" className="w-full mt-1" disabled={creatingId === s.id} onClick={() => create('show', s.id, s.title)}>
                    {creatingId === s.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
                    Buat & Salin Link
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="replays" className="space-y-3 mt-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul / show…" className="pl-8" onKeyDown={(e) => { if (e.key === 'Enter') { setPage(0); loadReplays(); } }} />
              </div>
              <Button size="sm" onClick={() => { setPage(0); loadReplays(); }} disabled={loadingR}>Cari</Button>
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              ⏳ Token replay berlaku 1 tahun · 1 device.
            </p>
            {loadingR ? (
              <p className="text-sm text-muted-foreground">Memuat…</p>
            ) : replays.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Tidak ada replay.</p>
            ) : replays.map((r) => (
              <div key={r.id} className="border border-border rounded-xl bg-card p-3 flex gap-3">
                {r.image_url ? (
                  <img src={r.image_url} alt={r.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-sm truncate">{r.title}</p>
                  {r.show_name && <p className="text-xs text-muted-foreground truncate">{r.show_name}</p>}
                  <p className="text-xs text-muted-foreground">📅 {r.date}</p>
                  <Button size="sm" className="w-full mt-1" disabled={creatingId === r.id} onClick={() => create('replay', r.id, r.title)}>
                    {creatingId === r.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
                    Buat & Salin Link
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button size="sm" variant="outline" disabled={page === 0 || loadingR} onClick={() => setPage((p) => Math.max(0, p - 1))}>Sebelumnya</Button>
              <span className="text-xs text-muted-foreground">Halaman {page + 1}</span>
              <Button size="sm" variant="outline" disabled={loadingR || replays.length < PAGE} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
            </div>
          </TabsContent>

          <TabsContent value="membership">
            <MembershipPanel session={session} onCreated={setResult} />
          </TabsContent>
        </Tabs>
      </main>

      {result && (
        <TokenResultDialog
          open={!!result}
          onOpenChange={(v) => { if (!v) setResult(null); }}
          link={result.link} message={result.message} title={result.title} extra={result.extra}
        />
      )}
    </div>
  );
}

export default function ResellerPage() {
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  const ready = useMemo(() => true, []);
  if (!ready) return null;
  if (!session) return <LoginCard onLogin={(s) => setSessionState(s)} />;
  return (
    <Dashboard
      session={session}
      onLogout={() => { setSession(null); setSessionState(null); }}
    />
  );
}
