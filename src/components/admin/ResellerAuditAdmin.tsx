import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCw, Search, Trash2, ShieldOff, RotateCcw, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type StatRow = {
  reseller_phone: string;
  reseller_label: string;
  kind: 'show' | 'replay' | 'membership';
  target_id: string | null;
  target_title: string;
  copies: number;
  last_copied: string;
};

type BulkItem = { phone: string; kind: 'show' | 'replay' | 'membership'; target_id: string | null; target_title: string };

type PendingAction =
  | { type: 'clear_log'; phone?: string; label?: string }
  | { type: 'reset_devices'; phone?: string; label?: string }
  | { type: 'exhaust'; phone: string; label?: string }
  | { type: 'delete_entry'; phone: string; kind: 'show' | 'replay' | 'membership'; target_id: string | null; target_title: string }
  | { type: 'delete_bulk'; items: BulkItem[] };


const kindBadge: Record<string, { label: string; cls: string }> = {
  show: { label: '📺 Show', cls: 'bg-red-500/15 text-red-500 border-red-500/30' },
  replay: { label: '🎬 Replay', cls: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
  membership: { label: '👑 Membership', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
};

export default function ResellerAuditAdmin() {
  const [rows, setRows] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [defaultPrice, setDefaultPrice] = useState(0);
  const [editing, setEditing] = useState<(StatRow & { phone: string }) | null>(null);
  const [editCopies, setEditCopies] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (phone: string, it: StatRow) => {
    setEditing({ ...it, phone });
    setEditCopies(Number(it.copies) || 0);
    setEditPrice(it.target_id ? (prices[it.target_id] ?? defaultPrice) : defaultPrice);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase.rpc('admin_set_reseller_copy_count', {
        _phone: editing.reseller_phone,
        _kind: editing.kind,
        _target_id: editing.target_id,
        _count: Math.max(0, Math.floor(editCopies)),
      });
      if (error) throw error;
      if (editing.target_id) {
        const { error: pErr } = await supabase.from('reseller_show_prices').upsert(
          { show_id: editing.target_id, price_per_link: Math.max(0, Math.floor(editPrice)), updated_at: new Date().toISOString() },
          { onConflict: 'show_id' },
        );
        if (pErr) throw pErr;
      }
      toast({ title: 'Data diperbarui' });
      setEditing(null);
      await load();
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e?.message || 'gagal', variant: 'destructive' });
    }
    setSavingEdit(false);
  };

  const keyOf = (phone: string, kind: string, target_id: string | null) => `${phone}|${kind}|${target_id ?? ''}`;
  const toggleSel = (k: string) => setSel(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });


  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: pr }, { data: st }] = await Promise.all([
      supabase.rpc('admin_reseller_copy_stats'),
      supabase.from('reseller_show_prices').select('show_id,price_per_link'),
      supabase.from('site_settings').select('value').eq('key', 'reseller_price_per_link').maybeSingle(),
    ]);
    if (error) toast({ title: 'Gagal memuat', description: error.message, variant: 'destructive' });
    else setRows((data ?? []) as StatRow[]);
    const m: Record<string, number> = {};
    for (const p of (pr ?? []) as { show_id: string; price_per_link: number }[]) m[p.show_id] = Number(p.price_per_link) || 0;
    setPrices(m);
    setDefaultPrice(Number(st?.value || 0));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const s = q.trim().toLowerCase();
    const map = new Map<string, { phone: string; label: string; total: number; items: StatRow[] }>();
    for (const r of rows) {
      if (s && !r.reseller_phone.toLowerCase().includes(s)
        && !r.reseller_label.toLowerCase().includes(s)
        && !r.target_title.toLowerCase().includes(s)) continue;
      const key = r.reseller_phone;
      const g = map.get(key) ?? { phone: r.reseller_phone, label: r.reseller_label, total: 0, items: [] };
      g.items.push(r);
      g.total += Number(r.copies) || 0;
      if (!g.label && r.reseller_label) g.label = r.reseller_label;
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows, q]);

  const confirmAction = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      if (pending.type === 'clear_log') {
        const { data, error } = await supabase.rpc('admin_clear_reseller_copy_log', { _phone: pending.phone ?? null });
        if (error) throw error;
        toast({ title: `Terhapus ${data ?? 0} catatan` });
      } else if (pending.type === 'reset_devices') {
        const { data, error } = await supabase.rpc('admin_reset_reseller_token_devices', { _phone: pending.phone ?? null });
        if (error) throw error;
        toast({ title: `${data ?? 0} perangkat dilepas. Link bisa dipakai lagi di perangkat lain.` });
      } else if (pending.type === 'delete_entry') {
        const { data, error } = await supabase.rpc('admin_delete_reseller_copy_entry', {
          _phone: pending.phone,
          _kind: pending.kind,
          _target_id: pending.target_id,
        });
        if (error) throw error;
        const res = (data ?? {}) as { log_deleted?: number; tokens_deleted?: number };
        toast({ title: `Riwayat dihapus`, description: `${res.log_deleted ?? 0} catatan & ${res.tokens_deleted ?? 0} link token dihapus.` });
      } else if (pending.type === 'delete_bulk') {
        let log = 0, tok = 0, fail = 0;
        for (const it of pending.items) {
          const { data, error } = await supabase.rpc('admin_delete_reseller_copy_entry', {
            _phone: it.phone, _kind: it.kind, _target_id: it.target_id,
          });
          if (error) { fail++; continue; }
          const r = (data ?? {}) as { log_deleted?: number; tokens_deleted?: number };
          log += r.log_deleted ?? 0; tok += r.tokens_deleted ?? 0;
        }
        setSel(new Set());
        toast({ title: `${pending.items.length - fail} riwayat dihapus`, description: `${log} catatan & ${tok} link token dihapus${fail ? ` · ${fail} gagal` : ''}.` });
      } else {
        const { data, error } = await supabase.rpc('admin_exhaust_reseller_tokens', { _phone: pending.phone });
        if (error) throw error;
        toast({ title: `${data ?? 0} token reseller dihabiskan (revoked)` });
      }

      setPending(null);
      await load();
    } catch (err: any) {
      toast({ title: 'Gagal', description: err?.message || 'gagal', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const target = pending
    ? (pending.type === 'clear_log'
        ? (pending.phone ? `riwayat salin link +${pending.phone}` : 'SELURUH riwayat salin link reseller')
        : pending.type === 'reset_devices'
        ? (pending.phone
            ? `daftar perangkat semua link token milik +${pending.phone}. Link tetap aktif dan bisa dipakai lagi di perangkat lain.`
            : `daftar perangkat SEMUA link token reseller. Semua link tetap aktif.`)
        : pending.type === 'delete_entry'
        ? `riwayat & SEMUA link token "${pending.target_title}" milik +${pending.phone}. Link akan langsung hilang dari website.`
        : pending.type === 'delete_bulk'
        ? `riwayat & SEMUA link token dari ${pending.items.length} show/replay yang dicentang. Link akan langsung hilang dari website.`
        : `SEMUA link token aktif +${pending.phone} (link akan tidak bisa dipakai lagi)`)

    : '';

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2 leading-tight">
            <ClipboardList className="w-4 h-4" /> Riwayat Salin Link Reseller
          </CardTitle>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 sm:pb-0">
            <Button size="sm" variant="outline" className="shrink-0" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Muat ulang
            </Button>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setPending({ type: 'reset_devices' })} disabled={loading || rows.length === 0} title="Lepaskan semua perangkat dari semua link reseller. Link tetap aktif.">
              <RotateCcw className="w-4 h-4 mr-1" />Reset device semua
            </Button>
            <Button size="sm" variant="destructive" className="shrink-0" onClick={() => setPending({ type: 'clear_log' })} disabled={loading || rows.length === 0}>
              <Trash2 className="w-4 h-4 mr-1" />Hapus riwayat
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-3 sm:px-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cari nomor / label / judul…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          {sel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2">
              <span className="text-xs font-medium">{sel.size} show dicentang</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSel(new Set())}>Batal pilih</Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs ml-auto"
                onClick={() => {
                  const items: BulkItem[] = [];
                  for (const g of grouped) {
                    for (const it of g.items) {
                      if (sel.has(keyOf(g.phone, it.kind, it.target_id))) {
                        items.push({ phone: g.phone, kind: it.kind, target_id: it.target_id, target_title: it.target_title });
                      }
                    }
                  }
                  if (items.length) setPending({ type: 'delete_bulk', items });
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />Hapus yang dicentang
              </Button>
            </div>
          )}


          {loading ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Memuat…</p>
          ) : grouped.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Belum ada aktivitas salin link.</p>
          ) : (
            <div className="space-y-3">
              {grouped.map((g) => (
                <div key={g.phone} className="border border-border rounded-lg bg-card/50 overflow-hidden min-w-0">
                  <div className="flex flex-col gap-2 p-3 bg-secondary/30 border-b border-border">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary shrink-0"
                        title="Centang semua show reseller ini"
                        checked={g.items.length > 0 && g.items.every(it => sel.has(keyOf(g.phone, it.kind, it.target_id)))}
                        onChange={(e) => setSel(prev => {
                          const n = new Set(prev);
                          for (const it of g.items) {
                            const k = keyOf(g.phone, it.kind, it.target_id);
                            if (e.target.checked) n.add(k); else n.delete(k);
                          }
                          return n;
                        })}
                      />
                      <span className="font-mono text-sm font-semibold truncate">+{g.phone}</span>
                      {g.label && <span className="text-xs text-muted-foreground">({g.label})</span>}
                      <Badge variant="secondary" className="text-[10px]">{g.total} link total</Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 justify-start text-xs text-amber-600 hover:text-amber-600"
                        onClick={() => setPending({ type: 'exhaust', phone: g.phone, label: g.label })}>
                        <ShieldOff className="w-3.5 h-3.5 mr-1" />Habiskan link
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 justify-start text-xs text-blue-600 hover:text-blue-600"
                        title="Lepaskan perangkat agar link bisa dipakai lagi"
                        onClick={() => setPending({ type: 'reset_devices', phone: g.phone, label: g.label })}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />Reset device
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 justify-start text-xs text-destructive hover:text-destructive col-span-2 sm:col-span-1"
                        onClick={() => setPending({ type: 'clear_log', phone: g.phone, label: g.label })}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" />Hapus riwayat
                      </Button>
                    </div>
                  </div>
                  <div className="p-2 space-y-1">
                    {g.items.map((it, i) => {
                      const kb = kindBadge[it.kind];
                      const k = keyOf(g.phone, it.kind, it.target_id);
                      return (
                        <div key={`${it.kind}-${it.target_id}-${i}`} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-secondary/40 min-w-0 ${sel.has(k) ? 'bg-primary/10' : ''}`}>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary shrink-0"
                              checked={sel.has(k)}
                              onChange={() => toggleSel(k)}
                            />
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${kb.cls}`}>{kb.label}</Badge>
                            <span className="text-sm truncate">{it.target_title || '—'}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 max-w-[55%] sm:max-w-none">
                            <span className="hidden min-[380px]:inline text-[10px] text-muted-foreground truncate">{fmtDate(it.last_copied)}</span>
                            <Badge className="text-[11px] font-semibold">{it.copies} link</Badge>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                              title="Hapus riwayat & link token untuk show ini"
                              onClick={() => setPending({
                                type: 'delete_entry',
                                phone: g.phone,
                                kind: it.kind,
                                target_id: it.target_id,
                                target_title: it.target_title || '—',
                              })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(v) => { if (!v && !busy) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.type === 'exhaust'
                ? 'Habiskan link token reseller?'
                : pending?.type === 'reset_devices'
                ? 'Reset perangkat link token?'
                : pending?.type === 'delete_entry'
                ? 'Hapus riwayat & link token show ini?'
                : 'Konfirmasi hapus riwayat'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan {pending?.type === 'exhaust' ? 'menghabiskan (revoke)' : pending?.type === 'reset_devices' ? 'melepaskan' : 'menghapus'} {target}.
              {pending?.type !== 'reset_devices' && <> Tindakan ini <strong>tidak bisa dibatalkan</strong>.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmAction(); }}
              disabled={busy}
              className={pending?.type === 'reset_devices' ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
            >
              {busy ? 'Memproses…' : 'Ya, lanjutkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
