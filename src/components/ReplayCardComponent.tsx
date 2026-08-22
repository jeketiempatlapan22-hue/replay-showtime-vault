import { memo, useEffect, useState, useMemo } from 'react';
import { Lock, Unlock, Play, Calendar, Users, Tag, Star, Tv, Bookmark, BookmarkCheck, ShoppingCart, Copy, Crown } from 'lucide-react';
import { type ReplayRow, verifyPasswordDetailed } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MemberAvatar from '@/components/MemberAvatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import BuyShowDialog from '@/components/BuyShowDialog';
import { getReplayPurchase } from '@/lib/purchases';
import { toast } from '@/hooks/use-toast';
import type { ActiveMembership } from '@/hooks/useActiveMembership';
import { isReplayCoveredByMembership } from '@/lib/membershipReplayAccess';
import { thumbUrl } from '@/lib/imageUrl';


const CRITERIA_LABELS: Record<string, string> = {
  reguler: 'Reguler', sts: 'STS', last_show: 'Last Show', aniv: 'Anniversary', special: 'Show Spesial',
};

interface Props {
  replay: ReplayRow;
  isUnlocked: boolean;
  onUnlock: (id: string) => void;
  onWatch: (replay: ReplayRow) => void;
  onUnlockAndWatch?: (replay: ReplayRow) => void;
  index?: number;
  isBookmarked?: boolean;
  onToggleBookmark?: (id: string) => void;
  searchQuery?: string;
  membership?: ActiveMembership | null;
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">{part}</mark> : part
  );
}

const FIT_CLASS: Record<string, string> = {
  contain: 'object-contain',
  'scale-down': 'object-scale-down',
  cover: 'object-cover',
};

const REPLAY_DEFAULT_PRICE = 2000;
const getReplayPrice = (r: any) => {
  const v = Number(r?.price_idr);
  return Number.isFinite(v) && v > 0 ? v : REPLAY_DEFAULT_PRICE;
};

function ReplayCardComponent({ replay, isUnlocked, onUnlock, onWatch, onUnlockAndWatch, index = 0, isBookmarked, onToggleBookmark, searchQuery = '', membership = null }: Props) {
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [purchasedToken, setPurchasedToken] = useState<string>('');
  const [imgLoaded, setImgLoaded] = useState(false);

  // Sync purchase state from localStorage
  useEffect(() => {
    const refresh = () => {
      const p = getReplayPurchase(replay.id);
      setPurchasedToken(p?.token || '');
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('replaytime-purchases-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('replaytime-purchases-updated', refresh);
    };
  }, [replay.id]);

  const membershipCovered = useMemo(() => isReplayCoveredByMembership(replay.date, membership), [replay.date, membership]);
  const membershipActiveButOutside = !!membership?.token && !membershipCovered && !!membership?.includes_replays;

  const isPurchased = !!purchasedToken;
  useEffect(() => {
    if (isPurchased && !isUnlocked) onUnlock(replay.id);
  }, [isPurchased, isUnlocked, replay.id, onUnlock]);



  const watchWithMembership = () => {
    if (membership?.token) {
      try { sessionStorage.setItem(`replaytime-tok-${replay.id}`, membership.token); } catch { /* ignore */ }
    }
    if (onUnlockAndWatch) onUnlockAndWatch(replay);
    else { onUnlock(replay.id); onWatch(replay); }
  };


  const accessLink = purchasedToken
    ? `${window.location.origin}/akses?token=${purchasedToken}&replay=${replay.id}`
    : '';
  const copyToken = async () => {
    try { await navigator.clipboard.writeText(purchasedToken); toast({ title: 'Sandi disalin' }); } catch { /* ignore */ }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(accessLink); toast({ title: 'Link akses disalin', description: 'Tempel di browser untuk menonton.' }); } catch { /* ignore */ }
  };

  const handleSubmitPassword = async () => {
    if (checking) return;

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setError('Sandi wajib diisi.');
      return;
    }

    setChecking(true);
    const res = await verifyPasswordDetailed(replay.id, trimmedPassword);
    setChecking(false);
    if (res.valid) {
      // Persist password for this replay so the player can fetch the source
      try {
        sessionStorage.setItem(`replaytime-pw-${replay.id}`, trimmedPassword);
        // Buang token lama yang mungkin sudah tidak valid agar player memakai sandi ini.
        const stale = sessionStorage.getItem(`replaytime-tok-${replay.id}`);
        if (stale && stale !== purchasedToken && stale !== membership?.token) {
          sessionStorage.removeItem(`replaytime-tok-${replay.id}`);
        }
      } catch { /* ignore */ }
      setShowPasswordDialog(false);
      setPassword('');
      setError('');
      if (onUnlockAndWatch) {
        onUnlockAndWatch(replay);
      } else {
        onUnlock(replay.id);
      }
    } else if (res.reason === 'rate_limited') {
      setError('Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.');
    } else {
      setError('Sandi salah! Coba lagi.');
    }

  };

  const formattedDate = new Date(replay.date).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const criteriaLabel = CRITERIA_LABELS[replay.criteria] || replay.criteria;
  // SECURITY: thumbnail uses uploaded image only — youtube_id is hidden
  // from the client until the user enters the correct password.
  const thumbnailUrl = replay.image_url ? thumbUrl(replay.image_url, 640, 60) : '/placeholder.svg';
  const fitClass = FIT_CLASS[(replay as any).image_fit as string] || 'object-contain';

  return (
    <div>
      <div
        className="group relative rounded-xl overflow-hidden border border-border bg-card/95 hover:border-primary/50 transition-colors duration-200 animate-fade-up"
        style={{ animationDelay: `${Math.min(index, 3) * 35}ms`, animationFillMode: 'forwards', contentVisibility: 'auto', containIntrinsicSize: '520px' }}
      >
        <div className="relative aspect-video overflow-hidden bg-muted">
          {!imgLoaded && (
            <div className="absolute inset-0 bg-muted animate-pulse" aria-hidden />
          )}
          <img
            src={thumbnailUrl}
            alt={replay.title}
            width={640}
            height={360}
            loading="lazy"
            decoding="async"
            fetchPriority={index < 3 ? 'auto' : 'low'}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            className={`w-full h-full ${fitClass} transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          />

          {!isUnlocked && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Lock className="w-10 h-10 text-primary animate-pulse" />
            </div>
          )}
          {isUnlocked && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-green-600/90 text-foreground border-0">
                <Unlock className="w-3 h-3 mr-1" /> Terbuka
              </Badge>
            </div>
          )}
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-xs">{criteriaLabel}</Badge>
          </div>
          {onToggleBookmark && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(replay.id); }}
              className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-all duration-200 ${isBookmarked ? 'bg-primary text-primary-foreground' : 'bg-background/60 backdrop-blur text-muted-foreground hover:text-primary'}`}
            >
              {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="p-4 space-y-3">
          <h3 className="text-lg font-semibold text-foreground line-clamp-2 font-sans">{highlightText(replay.title, searchQuery)}</h3>

          {replay.show_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tv className="w-4 h-4 text-primary" />
              <span>{highlightText(replay.show_name, searchQuery)}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{formattedDate}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Tag className="w-4 h-4 text-primary" />
            <span>{criteriaLabel}</span>
          </div>

          {replay.featured_member && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Star className="w-4 h-4 text-primary" />
              <span className="font-medium">{highlightText(replay.featured_member, searchQuery)}</span>
            </div>
          )}

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 text-primary mt-1.5 shrink-0" aria-hidden="true" />
            <div
              role="region"
              aria-label={`Line up ${replay.lineup.length} member, geser untuk melihat semua`}
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
                {replay.lineup.map((member, i) => (
                  <li key={i} className="snap-start">
                    <MemberAvatar name={member} size={40} />
                  </li>
                ))}
              </ul>

            </div>
          </div>


          {membershipCovered ? (
            <div className="space-y-2 mt-2">
              <Button type="button" className="w-full" onClick={watchWithMembership}>
                <Play className="w-4 h-4 mr-2" /> Tonton Replay
              </Button>
              <div className="rounded-md border border-primary/30 bg-primary/10 p-2 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[10px] text-primary font-semibold">
                  Termasuk Membership {membership?.package_name ? `· ${membership.package_name}` : ''}
                </span>
              </div>
            </div>
          ) : isPurchased ? (
            <div className="space-y-2 mt-2">
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  if (purchasedToken) {
                    try { sessionStorage.setItem(`replaytime-tok-${replay.id}`, purchasedToken); } catch { /* ignore */ }
                  }
                  onWatch(replay);
                }}
              >
                <Play className="w-4 h-4 mr-2" /> Tonton Replay
              </Button>
              <div className="rounded-md border-2 border-primary/40 bg-primary/10 p-2 space-y-1.5">
                <div className="text-[10px] font-semibold text-primary flex items-center gap-1">
                  <Copy className="w-3 h-3" /> SALIN LINK & TEMPEL DI BROWSER
                </div>
                <Button type="button" size="sm" className="w-full h-7 text-xs gap-1" onClick={copyLink}>
                  <Copy className="w-3 h-3" /> Salin Link Token
                </Button>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sandi akses</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] font-mono break-all text-foreground">{purchasedToken}</code>
                  <Button type="button" size="sm" variant="outline" onClick={copyToken} className="h-7 px-2"><Copy className="w-3 h-3" /></Button>
                </div>
              </div>
            </div>
          ) : isUnlocked ? (
            <Button type="button" className="w-full mt-2" onClick={() => onWatch(replay)}>
              <Play className="w-4 h-4 mr-2" /> Tonton Sekarang
            </Button>
          ) : (
            <div className="space-y-2 mt-2">
              {membershipActiveButOutside && (
                <div className="rounded-md border border-border bg-muted/30 p-2 text-[10px] text-muted-foreground">
                  Replay ini di luar periode membership kamu, jadi masih perlu dibeli terpisah.
                </div>
              )}
              <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Harga Replay</div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-base font-bold text-primary">Rp {getReplayPrice(replay).toLocaleString('id-ID')}</span>
                  {((replay as any).price_coins ?? 0) > 0 && (
                    <Badge variant="secondary" className="text-xs">atau {(replay as any).price_coins} koin</Badge>
                  )}
                </div>
              </div>
              <Button type="button" className="w-full gap-2" onClick={() => setBuyOpen(true)}>
                <ShoppingCart className="w-4 h-4" />
                {((replay as any).price_coins ?? 0) > 0 ? 'Beli Replay via QRIS & Koin' : 'Beli Replay via QRIS'}
              </Button>
              <Button type="button" variant="outline" className="w-full border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => setShowPasswordDialog(true)}>
                <Lock className="w-4 h-4 mr-2" /> Buka dengan Sandi
              </Button>
            </div>
          )}

        </div>
      </div>

      <BuyShowDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        showId=""
        showTitle={replay.title}
        amount={getReplayPrice(replay)}
        itemTitle={`Replay: ${replay.title}`}
        replayId={replay.id}
        kind="replay_only"
      />

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-sans">Masukkan Sandi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Masukkan sandi satuan atau sandi master untuk membuka replay ini.</p>
            <Input type="password" placeholder="Masukkan sandi..." value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitPassword()} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="button" className="w-full" onClick={handleSubmitPassword} disabled={checking}>
              {checking ? 'Memeriksa...' : 'Buka Replay'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default memo(ReplayCardComponent);

