import { useEffect, useState } from 'react';
import { DollarSign, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/backend';
import { toast } from '@/hooks/use-toast';

type Show = { id: string; title: string; show_date: string; category: string };
type Price = { show_id: string; price_per_link: number };

const fmtRp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.max(0, Number(n) || 0));

export default function ResellerPricingAdmin() {
  const [defaultPrice, setDefaultPrice] = useState<number>(0);
  const [shows, setShows] = useState<Show[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: settings }, { data: shows }, { data: prices }] = await Promise.all([
      supabase.from('site_settings').select('key,value').eq('key', 'reseller_price_per_link').maybeSingle(),
      supabase.rpc('admin_get_active_shows'),
      supabase.from('reseller_show_prices').select('show_id,price_per_link'),
    ]);
    setDefaultPrice(Number(settings?.value || 0));
    setShows((shows ?? []) as Show[]);
    const m: Record<string, number> = {};
    for (const p of (prices ?? []) as Price[]) m[p.show_id] = Number(p.price_per_link) || 0;
    setPriceMap(m);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const saveDefault = async () => {
    setSavingDefault(true);
    const { error } = await supabase.from('site_settings')
      .upsert({ key: 'reseller_price_per_link', value: String(defaultPrice) }, { onConflict: 'key' });
    setSavingDefault(false);
    if (error) toast({ title: 'Gagal simpan default', description: error.message, variant: 'destructive' });
    else toast({ title: 'Harga default disimpan' });
  };

  const savePrice = async (showId: string) => {
    setSavingId(showId);
    const v = Math.max(0, Number(priceMap[showId] || 0));
    const { error } = await supabase.from('reseller_show_prices')
      .upsert({ show_id: showId, price_per_link: v, updated_at: new Date().toISOString() }, { onConflict: 'show_id' });
    setSavingId(null);
    if (error) toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
    else toast({ title: 'Harga show disimpan', description: `Rp ${fmtRp(v)} / link` });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Harga Salin Link Reseller
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Muat ulang
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border border-border rounded-lg p-3 bg-secondary/30">
          <Label className="text-xs font-semibold">Harga default (semua show tanpa override)</Label>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm">Rp</span>
            <Input
              type="number" min={0} value={defaultPrice}
              onChange={(e) => setDefaultPrice(Number(e.target.value) || 0)}
              className="h-9 max-w-[140px]"
            />
            <span className="text-xs text-muted-foreground">/ link</span>
            <Button size="sm" onClick={saveDefault} disabled={savingDefault}>
              <Save className="w-4 h-4 mr-1" />Simpan
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Override harga per show (kosongkan/0 → pakai default).</p>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Memuat…</p>
          ) : shows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Belum ada show.</p>
          ) : shows.map((s) => {
            const v = priceMap[s.id] ?? 0;
            return (
              <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border bg-card/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground">{s.show_date} · {s.category}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs">Rp</span>
                  <Input
                    type="number" min={0} value={v}
                    onChange={(e) => setPriceMap((m) => ({ ...m, [s.id]: Number(e.target.value) || 0 }))}
                    className="h-8 w-24"
                  />
                  {v > 0 && <Badge variant="secondary" className="text-[10px]">override</Badge>}
                  <Button size="sm" variant="outline" onClick={() => savePrice(s.id)} disabled={savingId === s.id}>
                    <Save className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
