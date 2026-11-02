import { useEffect, useState } from 'react';
import { Wallet, RefreshCw, Edit3, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/backend';
import { toast } from '@/hooks/use-toast';

type Row = {
  reseller_phone: string;
  reseller_label: string;
  total_links: number;
  total_amount: number;
  has_pending: boolean;
  pending_bill_id: string | null;
  pending_amount: number | null;
};

const fmtRp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.max(0, Number(n) || 0));

export default function ResellerBillingAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_reseller_billing_summary');
    if (error) toast({ title: 'Gagal memuat', description: error.message, variant: 'destructive' });
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const startEdit = (r: Row) => {
    setEditing(r.pending_bill_id || r.reseller_phone);
    setDraft(Number(r.pending_amount ?? r.total_amount) || 0);
  };

  const saveOverride = async (r: Row) => {
    if (!r.pending_bill_id) {
      toast({ title: 'Belum ada tagihan pending', description: 'Reseller belum membuka tagihan.' });
      setEditing(null);
      return;
    }
    const { error } = await supabase.rpc('admin_override_reseller_bill', {
      _bill_id: r.pending_bill_id, _amount: Math.max(0, Math.floor(draft)),
    });
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Tagihan diperbarui', description: fmtRp(draft) });
    setEditing(null);
    await load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Tagihan Reseller
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Muat ulang
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-center text-muted-foreground py-6">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-6">Belum ada aktivitas berbayar.</p>
        ) : rows.map((r) => {
          const isEdit = editing === (r.pending_bill_id || r.reseller_phone);
          return (
            <div key={r.reseller_phone} className="border border-border rounded-lg bg-card/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">+{r.reseller_phone}</p>
                  {r.reseller_label && <p className="text-[11px] text-muted-foreground">{r.reseller_label}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{r.total_links} link</Badge>
                  <Badge className="text-[11px]">Auto: {fmtRp(r.total_amount)}</Badge>
                  {r.has_pending && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                      Pending: {fmtRp(r.pending_amount || 0)}
                    </Badge>
                  )}
                </div>
              </div>

              {r.has_pending && (
                <div className="flex items-center gap-2">
                  {isEdit ? (
                    <>
                      <span className="text-xs">Rp</span>
                      <Input
                        type="number" min={0} value={draft}
                        onChange={(e) => setDraft(Number(e.target.value) || 0)}
                        className="h-8 max-w-[140px]"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => saveOverride(r)}><Check className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="w-4 h-4" /></Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                      <Edit3 className="w-3.5 h-3.5 mr-1" />Ubah jumlah tagihan
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground italic pt-2">
          ℹ️ Override hanya berlaku untuk tagihan pending. Setelah reseller membayar via QRIS, log salin akan otomatis terhapus.
        </p>
      </CardContent>
    </Card>
  );
}
