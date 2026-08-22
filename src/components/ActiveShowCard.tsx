import { useEffect, useState } from 'react';
import { Calendar, Clock, Tag, Users, Radio, ShoppingCart, PlayCircle, X, Lock, Play, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import MemberAvatar from '@/components/MemberAvatar';
import BuyShowDialog from '@/components/BuyShowDialog';
import HlsPlayer from '@/components/HlsPlayer';
import EmbedPlayer from '@/components/EmbedPlayer';
import { type ActiveShow, getShowDateTime } from '@/lib/activeShows';
import { useNavigate } from 'react-router-dom';
import { getShowPurchase, setShowPurchase } from '@/lib/purchases';
import { MEMBERSHIP_UPDATED_EVENT, readMembershipCredentials } from '@/lib/membershipAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { thumbUrl } from '@/lib/imageUrl';


const CATEGORY_LABELS: Record<string, string> = {
  reguler: 'Reguler', sts: 'STS', last_show: 'Last Show', aniv: 'Anniversary', special: 'Show Spesial',
};

function pad(n: number) { return String(n).padStart(2, '0'); }

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = target.getTime() - now;
  if (diff <= 0) return { live: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { live: false, days, hours, minutes, seconds };
}

export default function ActiveShowCard({ show, index = 0 }: { show: ActiveShow; index?: number }) {
  const target = getShowDateTime(show);
  const cd = useCountdown(target);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyMode, setBuyMode] = useState<'show' | 'replay'>('show');
  const [inlinePlayerOpen, setInlinePlayerOpen] = useState(false);
  const formattedDate = target.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formattedTime = `${pad(target.getHours())}:${pad(target.getMinutes())} WIB`;

  // Replay routing: prefer inline replay_mode (m3u8/youtube), else legacy replay_id route
  const inlineReplay = !!show.replay_mode && (!!show.replay_m3u8_url || !!show.replay_youtube_url);
  const replayMode = inlineReplay || (show.replay_enabled && !!show.replay_id);
  const showAmount = (show.price_show || show.pakasir_amount || 0);
  const replayAmount = (show.price_replay || show.pakasir_amount || 0);
  const showCoinPrice = Number((show as any).price_show_coins || 0);
  const replayCoinPrice = Number((show as any).price_replay_coins || 0);
  const showPriced = showAmount >= 100;
  const replayPriced = replayAmount >= 100;
  const showBuyable = showPriced || showCoinPrice > 0;
  const replayBuyable = replayPriced || replayCoinPrice > 0;

  // LIVE detection — auto schedule membuka live 15 menit sebelum jam jadwal
  const PRE_LIVE_MS = 15 * 60 * 1000;
  const startMs = target.getTime();
  const nowMs = Date.now();
  const autoLive = !!show.live_auto_schedule && nowMs >= startMs - PRE_LIVE_MS && nowMs <= startMs + 8 * 3600 * 1000;
  const isLiveNow = !!show.is_live || autoLive;

  // Per-show unlock check (sessionStorage live unlock OR localStorage purchase)
  const [hasAccess, setHasAccess] = useState(false);
  const [purchasedToken, setPurchasedToken] = useState<string>('');
  const [membershipToken, setMembershipToken] = useState<string>('');
  const [membershipPassword, setMembershipPassword] = useState<string>('');
  useEffect(() => {
    const refresh = () => {
      try {
        const sess = !!sessionStorage.getItem(`replaytime-live-unlocked-${show.id}`);
        const purchase = getShowPurchase(show.id);
        const membership = readMembershipCredentials();
        setPurchasedToken(purchase?.token || '');
        setMembershipToken(membership?.token || '');
        setMembershipPassword(membership?.password || '');
        setHasAccess(sess || !!purchase?.token || !!membership?.token);
      } catch { /* ignore */ }
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('replaytime-purchases-updated', refresh);
    window.addEventListener(MEMBERSHIP_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('replaytime-purchases-updated', refresh);
      window.removeEventListener(MEMBERSHIP_UPDATED_EVENT, refresh);
    };
  }, [show.id]);

  // Cross-device sync: if user is logged in, fetch their paid orders for this show
  useEffect(() => {
    if (!user || !show.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('access_token,kind,status')
        .eq('user_id', user.id)
        .eq('show_id', show.id)
        .eq('status', 'paid')
        .not('access_token', 'is', null)
        .limit(5);
      if (cancelled || !data || data.length === 0) return;
      const row = data.find((r: any) => r.access_token);
      if (row?.access_token) {
        try {
          setShowPurchase(show.id, { token: row.access_token, kind: (row.kind === 'replay' ? 'replay' : 'show'), paidAt: Date.now() });
          setPurchasedToken(row.access_token);
          setHasAccess(true);
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [user, show.id]);

  const openBuy = (mode: 'show' | 'replay') => { setBuyMode(mode); setBuyOpen(true); };
  const goReplay = () => {
    if (inlineReplay) { setInlinePlayerOpen(true); return; }
    if (show.replay_id) navigate(`/replay/${show.replay_id}`);
  };
  const goLive = () => {
    if (membershipToken) navigate(`/live?show=${show.id}&mtoken=${encodeURIComponent(membershipToken)}&mp=${encodeURIComponent(membershipPassword)}`);
    else if (purchasedToken) navigate(`/live?show=${show.id}&t=${purchasedToken}`);
    else navigate(`/live?show=${show.id}`);
  };

  return (
    <div
      className="group relative rounded-xl overflow-hidden border border-border bg-card/80 backdrop-blur-sm hover:border-primary/60 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-1 animate-fade-up"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' }}
    >
      {show.image_url && (
        <div className="relative aspect-video overflow-hidden bg-muted">
          <img src={thumbUrl(show.image_url, 640, 60)} alt={show.title} width={640} height={360} loading="lazy" decoding="async" className="w-full h-full object-cover object-center" />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[show.category] || show.category}</Badge>
          </div>
          {(isLiveNow || cd.live) && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-red-600 text-white border-0 gap-1 animate-pulse">
                <Radio className="w-3 h-3" /> LIVE
              </Badge>
            </div>
          )}
          <h3 className="absolute left-3 right-3 bottom-2 text-base sm:text-lg font-bold text-white line-clamp-2 font-sans drop-shadow">{show.title}</h3>
        </div>
      )}

      <div className="p-3 space-y-2">
        {!show.image_url && (
          <h3 className="text-lg font-semibold text-foreground line-clamp-2 font-sans">{show.title}</h3>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-primary" />{formattedDate}</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-primary" />{formattedTime}</span>
        </div>


        {show.lineup.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 text-primary mt-1.5 shrink-0" aria-hidden="true" />
            <div
              role="region"
              aria-label={`Line up ${show.lineup.length} member, geser untuk melihat semua`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  e.currentTarget.scrollBy({ left: e.key === 'ArrowRight' ? 80 : -80, behavior: 'smooth' });
                }
              }}
              className="flex-1 min-w-0 overflow-x-auto overscroll-x-contain scrollbar-thin -mx-1 px-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background snap-x snap-mandatory"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <ul className="flex gap-2 w-max py-1 list-none m-0 p-0">
                {show.lineup.map((m, i) => (
                  <li key={i} className="snap-start">
                    <MemberAvatar name={m} size={40} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}


        {/* Countdown */}
        <div className="pt-3 border-t border-border/50">
          {cd.live ? (
            <div className="text-center py-2">
              <p className="text-xs text-muted-foreground mb-1">Sedang Berlangsung</p>
              <p className="text-lg font-bold text-red-500 animate-pulse">🔴 ON AIR</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground text-center mb-2">Hitung Mundur</p>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { v: cd.days, l: 'Hari' },
                  { v: cd.hours, l: 'Jam' },
                  { v: cd.minutes, l: 'Menit' },
                  { v: cd.seconds, l: 'Detik' },
                ].map((u, i) => (
                  <div key={i} className="rounded-md bg-primary/10 border border-primary/20 py-1.5">
                    <div className="text-lg sm:text-xl font-bold text-primary tabular-nums">{pad(u.v)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{u.l}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Price block */}
        {(replayMode ? replayBuyable : showBuyable) && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Harga {replayMode ? 'Replay' : 'Show'}</div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {(replayMode ? replayPriced : showPriced) ? (
                <span className="text-base font-bold text-primary">
                  Rp {(replayMode ? replayAmount : showAmount).toLocaleString('id-ID')}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Hanya tukar koin</span>
              )}
              {((replayMode ? replayCoinPrice : showCoinPrice) > 0) && (
                <Badge variant="secondary" className="text-xs">
                  {(replayMode ? replayPriced : showPriced) ? 'atau ' : ''}{replayMode ? replayCoinPrice : showCoinPrice} koin
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Salin link token banner */}
        {purchasedToken && (() => {
          const link = replayMode
            ? (show.replay_id ? `${window.location.origin}/akses?token=${purchasedToken}&replay=${show.replay_id}` : `${window.location.origin}/akses?token=${purchasedToken}`)
            : `${window.location.origin}/live?show=${show.id}&t=${purchasedToken}`;
          const copyLink = async () => {
            try { await navigator.clipboard.writeText(link); toast.success('Link akses disalin', { description: 'Tempel di browser untuk menonton.' }); } catch { /* ignore */ }
          };
          return (
            <div className="rounded-md border-2 border-primary/40 bg-primary/10 p-2 space-y-1.5">
              <div className="text-[10px] font-semibold text-primary flex items-center gap-1">
                <Copy className="w-3 h-3" /> SALIN LINK & TEMPEL DI BROWSER
              </div>
              <Button size="sm" className="w-full h-7 text-xs gap-1" onClick={copyLink}>
                <Copy className="w-3 h-3" /> Salin Link Token
              </Button>
            </div>
          );
        })()}



        {/* Action buttons */}
        <div className="pt-2 space-y-2">
          {isLiveNow && (
            hasAccess ? (
              <Button className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={goLive}>
                <Radio className="w-4 h-4" /> Tonton Live
              </Button>
            ) : (
              <Button variant="secondary" className="w-full gap-2" onClick={goLive}>
                <Lock className="w-4 h-4" /> Masukkan Sandi
              </Button>
            )
          )}
          {replayMode ? (
            purchasedToken || membershipToken ? (
              <Button className="w-full gap-2" variant="secondary" onClick={goReplay}>
                <Play className="w-4 h-4" /> Tonton Replay
              </Button>
            ) : replayBuyable ? (
              <Button className="w-full gap-2" onClick={() => openBuy('replay')}>
                <PlayCircle className="w-4 h-4" />
                {replayPriced && replayCoinPrice > 0 ? 'Beli Replay via QRIS & Koin'
                  : replayPriced ? 'Beli Replay via QRIS'
                  : `Tukar ${replayCoinPrice} Koin untuk Replay`}
              </Button>
            ) : (
              <Button className="w-full gap-2" variant="secondary" onClick={goReplay}>
                <PlayCircle className="w-4 h-4" />
                Tonton Replay
              </Button>
            )
          ) : membershipToken && !isLiveNow ? (
            <Button className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={goLive}>
              <Radio className="w-4 h-4" /> Tonton Live (Member)
            </Button>
          ) : purchasedToken ? (
            !isLiveNow && (
              <Button className="w-full gap-2" variant="secondary" onClick={goLive}>
                <Play className="w-4 h-4" /> Tonton Show
              </Button>
            )
          ) : showBuyable ? (
            <Button className="w-full gap-2" onClick={() => openBuy('show')}>
              <ShoppingCart className="w-4 h-4" />
              {showPriced && showCoinPrice > 0 ? 'Beli Show via QRIS & Koin'
                : showPriced ? 'Beli Show via QRIS'
                : `Tukar ${showCoinPrice} Koin untuk Show`}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Inline replay player dialog */}
      {inlineReplay && (
        <Dialog open={inlinePlayerOpen} onOpenChange={setInlinePlayerOpen}>
          <DialogContent className="w-[calc(100vw-0.5rem)] sm:w-[calc(100vw-2rem)] max-w-[1600px] max-h-[100dvh] p-0 overflow-hidden bg-black border-border">
            <button onClick={() => setInlinePlayerOpen(false)} className="absolute top-2 right-2 z-50 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
              <X className="w-4 h-4" />
            </button>
            {show.replay_m3u8_url
              ? <HlsPlayer src={show.replay_m3u8_url} title={show.title} />
              : show.replay_youtube_url
                ? <EmbedPlayer type="youtube" source={show.replay_youtube_url} title={show.title} />
                : null}
          </DialogContent>
        </Dialog>
      )}

      <BuyShowDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        showId={show.id}
        showTitle={show.title}
        amount={buyMode === 'replay' ? replayAmount : showAmount}
        itemTitle={buyMode === 'replay' ? `Replay: ${show.title}` : `Show: ${show.title}`}
        replayId={buyMode === 'replay' ? show.replay_id : null}
        kind={buyMode === 'replay' ? 'replay' : 'show'}
      />
    </div>
  );
}
