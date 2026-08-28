import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, Trash2, CheckCircle2, ExternalLink, Save, Phone, Send, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type Proof = {
  id: string; order_id: string | null; show_order_id: string | null; user_id: string | null;
  email: string; phone: string; package_name: string; amount: number;
  image_path: string; note: string; handled: boolean;
  created_at: string; expires_at: string;
};

type Opt = { id: string; label: string };

export default function MembershipProofsAdmin() {
  const [rows, setRows] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [adminWa, setAdminWa] = useState('');
  const [manual, setManual] = useState<Record<string, { kind: string; target: string }>>({});
  const [targets, setTargets] = useState<{ shows: Opt[]; replays: Opt[]; packages: Opt[] }>({ shows: [], replays: [], packages: [] });
  const [results, setResults] = useState<Record<string, string>>({});
  const [savingWa, setSavingWa] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_membership_proofs');
    setLoading(false);
    if (error) { toast({ title: 'Gagal memuat', description: error.message, variant: 'destructive' }); return; }
    const list = (data || []) as Proof[];
    setRows(list);
    // Sign URLs
    const map: Record<string, string> = {};
    await Promise.all(list.map(async (r) => {
      const { data: s } = await supabase.storage.from('membership-proofs').createSignedUrl(r.image_path, 60 * 30);
      if (s?.signedUrl) map[r.id] = s.signedUrl;
    }));
    setUrls(map);
  };

  const loadWa = async () => {
    const { data } = await supabase.from('site_settings').select('key,value').in('key', ['owner_wa_number', 'admin_wa_phone']);
    const m = new Map(((data || []) as any[]).map((r) => [r.key, String(r.value || '')]));
    setAdminWa(m.get('owner_wa_number') || m.get('admin_wa_phone') || '');
  };


  const loadTargets = async () => {
    const [sh, rp, pk] = await Promise.all([
      (supabase as any).rpc('admin_get_active_shows'),
      (supabase as any).rpc('admin_get_replays'),
      (supabase as any).rpc('admin_get_membership_packages'),
    ]);
    setTargets({
      shows: ((sh.data || []) as any[]).map((x) => ({ id: x.id, label: `${x.title} • ${x.show_date}` })),
      replays: ((rp.data || []) as any[]).map((x) => ({ id: x.id, label: `${x.title} • ${x.date}` })),
      packages: ((pk.data || []) as any[]).map((x) => ({ id: x.id, label: `${x.name} • ${x.duration_days} hari` })),
    });
  };

  useEffect(() => { void load(); void loadWa(); void loadTargets(); }, []);

  const saveWa = async () => {
    setSavingWa(true);
    const v = adminWa.replace(/\D/g, '');
    const { error } = await supabase.from('site_settings').upsert(
      [{ key: 'owner_wa_number', value: v }, { key: 'admin_wa_phone', value: v }],
      { onConflict: 'key' },
    );
    setSavingWa(false);
    if (error) toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
    else toast({ title: 'Nomor admin tersimpan', description: v || '(kosong)' });
  };


  const copyText = async (text: string, label: string) => {
    const value = String(text || '').trim();
    if (!value) { toast({ title: 'Data kosong', variant: 'destructive' }); return; }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast({ title: `${label} disalin`, description: value });
    } catch { toast({ title: 'Gagal menyalin', variant: 'destructive' }); }
  };


  const copyBulk = (field: 'email' | 'phone') => {
    const list = [...new Set(rows.map(r => field === 'email' ? r.email : r.phone).filter(Boolean))];
    if (!list.length) return toast({ title: 'Tidak ada data', variant: 'destructive' });
    void copyText(list.join('\n'), `${list.length} ${field === 'email' ? 'email' : 'nomor'}`);
  };

  const setHandled = async (r: Proof, h: boolean) => {
    const { error } = await supabase.rpc('admin_set_proof_handled', { _id: r.id, _handled: h });
    if (error) return toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    setRows((x) => x.map((y) => (y.id === r.id ? { ...y, handled: h } : y)));
  };

  const approveAndSend = async (r: Proof) => {
    const m = manual[r.id];
    if (!r.order_id && !r.show_order_id && !(m?.kind && m?.target)) {
      toast({ title: 'Pilih jenis & target', description: 'Bukti ini belum terhubung ke order — pilih Show/Replay/Membership dulu.', variant: 'destructive' });
      return;
    }
    setApproving((s) => ({ ...s, [r.id]: true }));
    const { data, error } = await supabase.functions.invoke('admin-approve-proof', {
      body: { proof_id: r.id, kind: m?.kind, target_id: m?.target, phone: r.phone, email: r.email },
    });
    setApproving((s) => ({ ...s, [r.id]: false }));
    if (error) return toast({ title: 'Gagal setujui', description: error.message, variant: 'destructive' });
    const res = data as { ok?: boolean; order_kind?: string; finalize?: { sent?: boolean; status?: string; error?: string } };
    const sent = res?.finalize?.sent;
    const tokenVal = (res?.finalize as any)?.access_token || (res?.finalize as any)?.token || '';
    if (tokenVal) setResults((x) => ({ ...x, [r.id]: String(tokenVal) }));
    setRows((x) => x.map((y) => (y.id === r.id ? { ...y, handled: true } : y)));
    if (sent) {
      toast({ title: 'Disetujui & WA terkirim', description: `${res.order_kind === 'membership' ? 'Membership' : 'Show/Replay'} aktif — token dikirim ke ${r.phone}.` });
    } else if (res?.finalize?.error) {
      toast({ title: 'Order ditandai paid, WA gagal', description: String(res.finalize.error), variant: 'destructive' });
    } else {
      toast({ title: 'Disetujui', description: 'Order ditandai paid. WA sedang diproses / tertunda — cek log.' });
    }
  };


  const remove = async (r: Proof) => {
    if (!confirm('Hapus bukti ini?')) return;
    const { data: path, error } = await supabase.rpc('admin_delete_membership_proof', { _id: r.id });
    if (error) return toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    // Remove the underlying storage object via Storage API (SQL cannot touch storage.objects).
    const p = (path as unknown as string) || r.image_path;
    if (p) {
      try { await supabase.storage.from('membership-proofs').remove([p]); } catch { /* best-effort */ }
    }
    setRows((x) => x.filter((y) => y.id !== r.id));
    toast({ title: 'Bukti dihapus' });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><Phone className="w-5 h-5" />Nomor WhatsApp Admin</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Nomor WA yang akan dihubungi user setelah upload bukti (format 628xxx)</Label>
          <div className="flex gap-2">
            <Input value={adminWa} onChange={(e) => setAdminWa(e.target.value)} placeholder="6281234567890" />
            <Button onClick={saveWa} disabled={savingWa}>{savingWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}<span className="ml-1 hidden sm:inline">Simpan</span></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base sm:text-lg flex items-center justify-between gap-2">
            <span>Bukti Transaksi ({rows.length})</span>
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => copyBulk('email')} title="Salin semua email"><Copy className="w-3.5 h-3.5 mr-1" />Email</Button>
              <Button size="sm" variant="outline" onClick={() => copyBulk('phone')} title="Salin semua nomor"><Copy className="w-3.5 h-3.5 mr-1" />Nomor</Button>
              <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Muat</Button>
            </div>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Bukti otomatis dihapus 7 hari setelah dibuat.</p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 && !loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Belum ada bukti masuk.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {rows.map((r) => (
                <div key={r.id} className="border border-border rounded-lg overflow-hidden bg-card/50">
                  {urls[r.id] ? (
                    <a href={urls[r.id]} target="_blank" rel="noreferrer" className="block">
                      <img src={urls[r.id]} alt="bukti" className="w-full h-48 object-cover" loading="lazy" />
                    </a>
                  ) : (
                    <div className="w-full h-48 bg-secondary flex items-center justify-center text-xs text-muted-foreground">Memuat gambar…</div>
                  )}
                  <div className="p-3 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant={r.handled ? 'default' : 'secondary'}>{r.handled ? 'Selesai' : 'Baru'}</Badge>
                      <Badge variant="outline">{r.order_id ? 'Membership' : r.show_order_id ? 'Show/Replay' : 'Tanpa order'}</Badge>
                      <Badge variant="outline">{r.package_name || 'Paket -'}</Badge>
                      {r.amount > 0 && <Badge variant="outline">Rp {r.amount.toLocaleString('id-ID')}</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5">📧 <span className="truncate">{r.email}</span>
                      {r.email && <button title="Salin email" onClick={() => copyText(r.email, 'Email')} className="text-muted-foreground hover:text-primary shrink-0"><Copy className="w-3 h-3" /></button>}
                    </div>
                    <div className="flex items-center gap-1.5">📱 <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" className="text-primary underline">{r.phone}</a>
                      {r.phone && <button title="Salin nomor" onClick={() => copyText(r.phone, 'Nomor')} className="text-muted-foreground hover:text-primary shrink-0"><Copy className="w-3 h-3" /></button>}
                    </div>
                    {r.order_id && <div className="font-mono text-[10px] truncate">Order Membership: {r.order_id}</div>}
                    {r.show_order_id && <div className="font-mono text-[10px] truncate">Order Show: {r.show_order_id}</div>}
                    {r.note && <div className="text-muted-foreground italic">"{r.note}"</div>}
                    <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString('id-ID')}</div>
                    {results[r.id] && (
                      <div className="font-mono text-[10px] break-all bg-secondary rounded px-2 py-1">Token: {results[r.id]}</div>
                    )}
                    {!r.order_id && !r.show_order_id && (
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-1 text-[11px]"
                          value={manual[r.id]?.kind || ''}
                          onChange={(e) => setManual((s) => ({ ...s, [r.id]: { kind: e.target.value, target: '' } }))}
                        >
                          <option value="">Jenis…</option>
                          <option value="show">Show</option>
                          <option value="replay">Replay</option>
                          <option value="membership">Membership</option>
                        </select>
                        <select
                          className="h-8 rounded-md border border-input bg-background px-1 text-[11px]"
                          value={manual[r.id]?.target || ''}
                          disabled={!manual[r.id]?.kind}
                          onChange={(e) => setManual((s) => ({ ...s, [r.id]: { kind: s[r.id]?.kind || '', target: e.target.value } }))}
                        >
                          <option value="">Pilih…</option>
                          {(manual[r.id]?.kind === 'show' ? targets.shows : manual[r.id]?.kind === 'replay' ? targets.replays : manual[r.id]?.kind === 'membership' ? targets.packages : []).map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-1 flex-wrap pt-1">
                      {(r.order_id || r.show_order_id || (manual[r.id]?.kind && manual[r.id]?.target)) && (
                        <Button
                          size="sm"
                          className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => approveAndSend(r)}
                          disabled={!!approving[r.id]}
                        >
                          {approving[r.id] ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                          Setujui & Kirim Token
                        </Button>
                      )}
                      {urls[r.id] && (
                        <a href={urls[r.id]} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="h-7 text-[11px]"><ExternalLink className="w-3 h-3 mr-1" />Buka</Button>
                        </a>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setHandled(r, !r.handled)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />{r.handled ? 'Buka lagi' : 'Tandai selesai'}
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => remove(r)}>
                        <Trash2 className="w-3 h-3 mr-1" />Hapus
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
