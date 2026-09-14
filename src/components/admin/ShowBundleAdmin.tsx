import { useCallback, useEffect, useState } from 'react';
import { Gift, RefreshCw, KeyRound, Copy, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BUNDLE_THEMES } from '@/lib/bundle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BundleItem {
  show_id: string; title: string; show_date: string;
  price_show: number; price_show_coins: number;
  excluded: boolean; converted: boolean; is_active: boolean;
}
interface BundleToken {
  token: string; password: string; label: string; phone: string;
  revoked: boolean; created_at: string; shows: number | null;
}
interface BundleData {
  bundle: any;
  current_password: string | null;
  passwords: { password: string; is_current: boolean; created_at: string }[];
  items: BundleItem[];
  tokens: BundleToken[];
}

export default function ShowBundleAdmin() {
  const [data, setData] = useState<BundleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', theme: 'gold', promo_label: '',
    discount_idr: '0', discount_coins: '0',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await (supabase as any).rpc('admin_get_show_bundle');
    if (error) toast.error(error.message);
    const d = (res as BundleData) || null;
    setData(d);
    if (d?.bundle) {
      setForm({
        name: d.bundle.name || '',
        description: d.bundle.description || '',
        theme: d.bundle.theme || 'gold',
        promo_label: d.bundle.promo_label || '',
        discount_idr: String(d.bundle.discount_idr ?? 0),
        discount_coins: String(d.bundle.discount_coins ?? 0),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveStyle = async () => {
    setBusy(true);
    const { error } = await (supabase as any).rpc('admin_update_bundle_style', {
      _name: form.name,
      _description: form.description,
      _theme: form.theme,
      _promo_label: form.promo_label,
      _discount_idr: Math.max(0, Number(form.discount_idr) || 0),
      _discount_coins: Math.max(0, Number(form.discount_coins) || 0),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Tampilan & diskon bundel disimpan');
    void load();
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} disalin`); } catch { /* ignore */ }
  };

  const setActive = async (active: boolean) => {
    setBusy(true);
    const { error } = await (supabase as any).rpc('admin_set_bundle_active', { _active: active });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(active ? 'Bundel diaktifkan' : 'Bundel dijeda');
    void load();
  };

  const toggleShow = async (showId: string, excluded: boolean) => {
    setBusy(true);
    const { error } = await (supabase as any).rpc('admin_set_bundle_show', { _show_id: showId, _excluded: excluded });
    setBusy(false);
    if (error) return toast.error(error.message);
    void load();
  };

  const rotate = async () => {
    if (!confirm('Buat sandi bundel baru? Sandi lama tetap berlaku untuk pembeli lama.')) return;
    setBusy(true);
    const { data: pw, error } = await (supabase as any).rpc('admin_rotate_bundle_password');
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Sandi baru: ${pw}`);
    void load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Memuat bundel...</p>;
  if (!data?.bundle) return <p className="text-sm text-muted-foreground">Bundel belum tersedia.</p>;

  const b = data.bundle;
  const included = (data.items || []).filter(i => !i.excluded && i.is_active && !i.converted);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><Gift className="w-4 h-4 text-primary" /> {b.name}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{b.is_active ? 'Aktif' : 'Dijeda'}</span>
            <Switch checked={!!b.is_active} disabled={busy} onCheckedChange={setActive} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">Rp{Number(b.price_idr || 0).toLocaleString('id-ID')}</Badge>
            <Badge variant="secondary">{b.price_coins} koin</Badge>
            <Badge variant="outline">{included.length} show tercakup</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Sandi berlaku:</span>
            <code className="px-2 py-1 rounded bg-muted font-mono text-xs">{data.current_password || '-'}</code>
            <Button size="sm" variant="outline" className="h-7" onClick={() => copy(data.current_password || '', 'Sandi')}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={rotate}>
              <KeyRound className="w-3.5 h-3.5 mr-1" /> Sandi Baru
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void load()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Harga bundel otomatis = total harga show tercakup dikurangi diskon di bawah.
          </p>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Nama bundel</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Deskripsi singkat</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Diskon (Rp)</Label>
              <Input type="number" min={0} value={form.discount_idr}
                onChange={e => setForm(f => ({ ...f, discount_idr: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Diskon (koin)</Label>
              <Input type="number" min={0} value={form.discount_coins}
                onChange={e => setForm(f => ({ ...f, discount_coins: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tema kartu</Label>
              <Select value={form.theme} onValueChange={(v) => setForm(f => ({ ...f, theme: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(BUNDLE_THEMES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label promo</Label>
              <Input placeholder="mis. Promo Spesial" value={form.promo_label}
                onChange={e => setForm(f => ({ ...f, promo_label: e.target.value }))} />
            </div>
            <Button className="col-span-2" size="sm" disabled={busy} onClick={saveStyle}>
              <Palette className="w-3.5 h-3.5 mr-1" /> Simpan Tampilan & Diskon
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Show dalam Bundel</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(data.items || []).length === 0 && <p className="text-xs text-muted-foreground">Belum ada show.</p>}
          {(data.items || []).map((it) => (
            <div key={it.show_id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{it.title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {it.show_date} · Rp{Number(it.price_show || 0).toLocaleString('id-ID')} · {it.price_show_coins} koin
                  {it.converted ? ' · sudah jadi replay' : ''}{!it.is_active ? ' · nonaktif' : ''}
                </div>
              </div>
              <Switch
                checked={!it.excluded}
                disabled={busy}
                onCheckedChange={(v) => toggleShow(it.show_id, !v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Token Bundel Terbit ({(data.tokens || []).length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(data.tokens || []).length === 0 && <p className="text-xs text-muted-foreground">Belum ada pembeli bundel.</p>}
          {(data.tokens || []).map((t) => (
            <div key={t.token} className="rounded-lg border border-border p-2 space-y-1">
              <div className="flex items-center gap-2">
                <code className="font-mono text-[11px] truncate flex-1">{t.token}</code>
                <Badge variant={t.revoked ? 'destructive' : 'secondary'} className="text-[10px]">
                  {t.revoked ? 'Dicabut' : `${t.shows || 0} show`}
                </Badge>
                <Button size="sm" variant="outline" className="h-7"
                  onClick={() => copy(`${window.location.origin}/shows?bt=${t.token}`, 'Link bundel')}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {t.phone || t.label || '-'} · sandi {t.password} · {new Date(t.created_at).toLocaleString('id-ID')}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
