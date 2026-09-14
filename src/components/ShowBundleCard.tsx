import { useEffect, useState } from 'react';
import { Gift, Ticket, Coins, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BuyShowDialog from '@/components/BuyShowDialog';
import AccessInfoCard from '@/components/AccessInfoCard';
import { getShowBundle, getBundleToken, type ShowBundle } from '@/lib/bundle';

export default function ShowBundleCard() {
  const [bundle, setBundle] = useState<ShowBundle | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [owned, setOwned] = useState(getBundleToken());

  useEffect(() => {
    void getShowBundle().then(setBundle);
    const onUpdate = () => setOwned(getBundleToken());
    window.addEventListener('replaytime-purchases-updated', onUpdate);
    return () => window.removeEventListener('replaytime-purchases-updated', onUpdate);
  }, []);

  if (!bundle || !bundle.is_active || bundle.show_count < 2) return null;

  const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

  return (
    <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary shrink-0" />
            <h3 className="font-bold text-base sm:text-lg truncate">{bundle.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {bundle.description || 'Satu link dan satu sandi untuk menonton semua show yang tersedia.'}
          </p>
        </div>
        <Badge className="shrink-0">{bundle.show_count} show</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 font-bold text-primary">
          <Ticket className="w-4 h-4" /> {rupiah(bundle.price_idr)}
        </span>
        {bundle.price_coins > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Coins className="w-4 h-4" /> {bundle.price_coins} koin
          </span>
        )}
        <Badge variant="secondary" className="text-[10px]">Hemat Rp2.000 / 1 koin</Badge>
      </div>

      {owned ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <Check className="w-3.5 h-3.5" /> Bundel sudah aktif di perangkat ini
          </div>
          <AccessInfoCard token={owned} compact />
        </div>
      ) : (
        <Button className="w-full" onClick={() => setBuyOpen(true)}>
          <Gift className="w-4 h-4 mr-2" /> Beli Bundel Semua Show
        </Button>
      )}

      <BuyShowDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        kind="bundle"
        showTitle={bundle.name}
        itemTitle={`${bundle.name} (${bundle.show_count} show)`}
        amount={bundle.price_idr}
      />
    </div>
  );
}
