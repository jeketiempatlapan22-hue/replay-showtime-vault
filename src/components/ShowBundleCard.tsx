import { useEffect, useState } from 'react';
import { Gift, Ticket, Coins, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BuyShowDialog from '@/components/BuyShowDialog';
import AccessInfoCard from '@/components/AccessInfoCard';
import { getShowBundle, getBundleToken, bundleTheme, type ShowBundle } from '@/lib/bundle';

export default function ShowBundleCard() {
  const [bundle, setBundle] = useState<ShowBundle | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [method, setMethod] = useState<'qris' | 'coin'>('qris');
  const [owned, setOwned] = useState(getBundleToken());

  useEffect(() => {
    const refresh = () => { void getShowBundle().then(setBundle); };
    refresh();
    const onUpdate = () => setOwned(getBundleToken());
    // Harga bundel bisa berubah saat admin mengubah show; segarkan agar nominal
    // pada kartu selalu sama dengan QRIS yang nanti dibuat.
    const onFocus = () => refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('replaytime-purchases-updated', onUpdate);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('replaytime-purchases-updated', onUpdate);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!bundle || !bundle.is_active || bundle.show_count < 2) return null;

  const t = bundleTheme(bundle.theme);
  const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
  const open = (m: 'qris' | 'coin') => { setMethod(m); setBuyOpen(true); };

  return (
    <div className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-r ${t.wrap} ${t.glow} p-3 sm:p-4`}>
      {/* kilau halus */}
      <div className="pointer-events-none absolute -inset-y-10 -left-1/3 w-1/3 rotate-12 bg-white/10 blur-2xl animate-pulse" aria-hidden />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={`gap-1 text-[10px] ${t.badge}`}><Gift className="w-3 h-3" /> BUNDEL</Badge>
            <Badge variant="outline" className="text-[10px]">{bundle.show_count} show</Badge>
            {bundle.promo_label && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Sparkles className="w-3 h-3" /> {bundle.promo_label}
              </Badge>
            )}
          </div>
          <h3 className={`mt-1 font-bold text-base sm:text-lg truncate ${t.accent}`}>{bundle.name}</h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">
            {bundle.description || 'Satu link dan satu sandi untuk semua show yang tersedia.'}
          </p>
        </div>

        {owned ? (
          <div className="sm:w-64 shrink-0 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <Check className="w-3.5 h-3.5" /> Bundel aktif di perangkat ini
            </div>
            <AccessInfoCard token={owned} compact />
          </div>
        ) : (
          <div className="shrink-0 flex items-center gap-2 sm:flex-col sm:items-end">
            <div className="min-w-0 flex-1 sm:flex-none sm:text-right">
              <div className={`font-bold text-sm sm:text-base ${t.accent}`}>{rupiah(bundle.price_idr)}</div>
              {bundle.price_coins > 0 && (
                <div className="text-[11px] text-muted-foreground">atau {bundle.price_coins} koin</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 text-xs" onClick={() => open('qris')}>
                <Ticket className="w-3.5 h-3.5 mr-1" /> QRIS
              </Button>
              {bundle.price_coins > 0 && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => open('coin')}>
                  <Coins className="w-3.5 h-3.5 mr-1" /> Koin
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <BuyShowDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        kind="bundle"
        defaultMethod={method}
        showTitle={bundle.name}
        itemTitle={`${bundle.name} (${bundle.show_count} show)`}
        amount={bundle.price_idr}
      />
    </div>
  );
}
