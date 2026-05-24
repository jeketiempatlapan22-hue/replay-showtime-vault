import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, ListOrdered } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Order {
  id: string;
  email: string;
  phone: string;
  kind: 'qris' | 'coins';
  amount: number;
  coin_amount: number;
  status: 'reserved' | 'paid' | 'expired' | 'cancelled';
  created_at: string;
  paid_at: string | null;
  reserved_until: string;
  membership_token_id: string | null;
}

const statusBadge = (s: Order['status']) => {
  const map = {
    paid: 'bg-green-500/15 text-green-600 border-green-500/30',
    reserved: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
    expired: 'bg-muted text-muted-foreground',
    cancelled: 'bg-muted text-muted-foreground',
  } as const;
  return map[s];
};

export default function MembershipOrdersDialog({
  open, onOpenChange, packageId, packageName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  packageId: string;
  packageName: string;
}) {
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!packageId) return;
    setLoading(true);
    const { data } = await supabase
      .from('membership_orders')
      .select('id,email,phone,kind,amount,coin_amount,status,created_at,paid_at,reserved_until,membership_token_id')
      .eq('package_id', packageId)
      .order('created_at', { ascending: false })
      .limit(200);
    setRows((data || []) as Order[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    void load();
    const ch = supabase
      .channel(`admin-membership-orders-${packageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_orders', filter: `package_id=eq.${packageId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, packageId]);

  const stats = rows.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="w-4 h-4 text-primary" /> Pesanan — {packageName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Total: {rows.length}</Badge>
          <Badge className={statusBadge('paid')}>Paid: {stats.paid || 0}</Badge>
          <Badge className={statusBadge('reserved')}>Reserved: {stats.reserved || 0}</Badge>
          <Badge variant="secondary">Expired: {stats.expired || 0}</Badge>
          <Badge variant="secondary">Cancelled: {stats.cancelled || 0}</Badge>
          <Button size="sm" variant="ghost" className="h-6 ml-auto" onClick={load}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Belum ada pesanan.</p>
        ) : (
          <div className="space-y-1.5 text-xs">
            {rows.map((r) => (
              <div key={r.id} className="border border-border rounded-md p-2 flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.email}</div>
                  <div className="text-muted-foreground font-mono text-[11px]">{r.phone}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleString('id-ID')}
                    {r.paid_at ? ` · paid ${new Date(r.paid_at).toLocaleString('id-ID')}` : ''}
                  </div>
                </div>
                <div className="text-right space-y-0.5">
                  <Badge className={statusBadge(r.status)} variant="outline">{r.status.toUpperCase()}</Badge>
                  <div className="text-[11px] font-mono">
                    {r.kind === 'qris' ? `Rp ${(r.amount || 0).toLocaleString('id-ID')}` : `${r.coin_amount} koin`}
                  </div>
                  {r.membership_token_id && <div className="text-[10px] text-green-600">✓ token aktif</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
