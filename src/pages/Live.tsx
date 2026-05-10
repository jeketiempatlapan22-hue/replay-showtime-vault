import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Users, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';
import { clearMembershipCredentials, saveMembershipCredentials } from '@/lib/membershipAccess';
import MemberAvatar from '@/components/MemberAvatar';
import { useAutoHideOnInteraction } from '@/hooks/useAutoHideOnInteraction';

// Lazy-load player & chat: bundle awal lebih kecil, terutama di mobile.
const HlsPlayer = lazy(() => import('@/components/HlsPlayer'));
const EmbedPlayer = lazy(() => import('@/components/EmbedPlayer'));
const LiveChat = lazy(() => import('@/components/LiveChat'));

const PlayerFallback = () => (
  <div className="aspect-video w-full rounded-2xl bg-card/80 border border-border flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-primary animate-spin" />
  </div>
);
const ChatFallback = () => (
  <div className="rounded-2xl bg-card/80 border border-border h-[60vh] min-h-[380px] flex items-center justify-center">
    <Loader2 className="w-6 h-6 text-primary animate-spin" />
  </div>
);

type SrcType = 'm3u8' | 'youtube' | 'cloudflare';
interface PublicSource { label: string; type: SrcType }
interface PrivateSource extends PublicSource { url: string }
interface MembershipInfo { expires_at?: string; resets_used: number; resets_max: number; remaining: number; includes_replays?: boolean; max_devices?: number }
interface LiveStatus { enabled: boolean; title: string; type: string; require_password: boolean; sources: PublicSource[]; lineup: string[]; show_date?: string; show_time?: string; image_url?: string }
interface UnlockedConfig { title: string; type: SrcType; url: string; sources: PrivateSource[]; watermark: string; enabled: boolean }
type SourceLike = Partial<Record<keyof PrivateSource, unknown>>;

const SS_KEY_BASE = 'replaytime-live-unlocked';
const SS_SRC_KEY = 'replaytime-live-source-idx';

const typeLabel = (t: string) => t === 'youtube' ? 'YouTube' : t === 'cloudflare' ? 'Cloudflare' : 'M3U8 / HLS';

const isSrcType = (value: unknown): value is SrcType => value === 'm3u8' || value === 'youtube' || value === 'cloudflare';
const asSourceLike = (value: unknown): SourceLike | null => value && typeof value === 'object' ? value as SourceLike : null;
const toPublicSources = (value: unknown): PublicSource[] => Array.isArray(value)
  ? value.flatMap((item) => {
    const source = asSourceLike(item);
    return source ? [{ label: String(source.label || ''), type: isSrcType(source.type) ? source.type : 'm3u8' }] : [];
  })
  : [];
const toPrivateSources = (value: unknown): PrivateSource[] => Array.isArray(value)
  ? value.flatMap((item) => {
    const source = asSourceLike(item);
    return source ? [{ label: String(source.label || ''), type: isSrcType(source.type) ? source.type : 'm3u8', url: String(source.url || '') }] : [];
  })
  : [];

function pad(n: number) { return String(n).padStart(2, '0'); }

function ScheduleCountdown({ title, showDate, showTime, imageUrl }: { title: string; showDate?: string; showTime?: string; imageUrl?: string }) {
  const target = showDate && showTime ? new Date(`${showDate}T${showTime}`) : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, []);

  const diff = target ? target.getTime() - now : 0;
  const past = !target || diff <= 0;
  const d = Math.max(0, Math.floor(diff / 86400000));
  const h = Math.max(0, Math.floor((diff % 86400000) / 3600000));
  const m = Math.max(0, Math.floor((diff % 3600000) / 60000));
  const s = Math.max(0, Math.floor((diff % 60000) / 1000));
  const dateLabel = target ? target.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const timeLabel = target ? `${pad(target.getHours())}:${pad(target.getMinutes())} WIB` : '';

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-primary/30 bg-black min-h-[320px] sm:aspect-video sm:min-h-0">
      {imageUrl && (
        <div
          className="absolute inset-0 bg-center bg-cover scale-110 blur-sm"
          style={{ backgroundImage: `url(${imageUrl})` }}
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-primary/20 to-black/80" aria-hidden />
      <div className="relative h-full w-full flex flex-col items-center justify-center text-center px-3 sm:px-6 py-4 sm:py-6 gap-2 sm:gap-4">
        <h3 className="text-base sm:text-2xl font-bold text-white drop-shadow">
          {past ? 'Menunggu Siaran' : 'Show Belum Dimulai'}
        </h3>
        <div className="text-lg sm:text-3xl font-bold text-primary drop-shadow flex items-center justify-center gap-2 flex-wrap">
          <span aria-hidden>🥷</span>
          <span>{title}</span>
        </div>
        {target && (
          <p className="text-xs sm:text-base text-white/90 drop-shadow flex items-center justify-center gap-1.5 flex-wrap">
            <span aria-hidden>📅</span><span>{dateLabel}</span>
            <span className="text-white/50">•</span>
            <span aria-hidden>🕐</span><span>{timeLabel}</span>
          </p>
        )}
        {past ? (
          <p className="text-xs sm:text-base font-semibold text-white drop-shadow">⏳ Menunggu admin memulai siaran…</p>
        ) : (
          <div className="rounded-2xl bg-black/40 backdrop-blur border border-white/15 px-2 sm:px-6 py-2 sm:py-4 max-w-lg w-full">
            <div className="grid grid-cols-4 gap-1 sm:gap-3 items-center">
              {[{v:d,l:'Hari'},{v:h,l:'Jam'},{v:m,l:'Menit'},{v:s,l:'Detik'}].map((u,i)=>(
                <div key={i} className="text-center">
                  <div className="text-xl sm:text-4xl font-bold text-primary tabular-nums drop-shadow tracking-wider">{pad(u.v)}</div>
                  <div className="text-[9px] sm:text-xs text-white/70 uppercase tracking-widest mt-0.5 sm:mt-1">{u.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Live() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [unlocked, setUnlocked] = useState<UnlockedConfig | null>(null);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [, setPwError] = useState('');
  const [, setSubmitting] = useState(false);
  const [failedSourceKeys, setFailedSourceKeys] = useState<string[]>([]);
  const [tokenInfo, setTokenInfo] = useState<{ kind: string; max_devices: number } | null>(null);
  const navVisible = useAutoHideOnInteraction(!!unlocked, 3000);
  const [sourceIdx, setSourceIdx] = useState<number>(() => {
    try { return Math.max(0, Number(sessionStorage.getItem(SS_SRC_KEY) || '0')); } catch { return 0; }
  });

  const showId = search.get('show') || '';

  const fetchStatus = () => {
    if (showId) {
      return supabase.from('active_shows')
        .select('id,title,is_live,live_type,live_require_password,lineup,show_date,show_time,is_active,image_url')
        .eq('id', showId).maybeSingle()
        .then(({ data }) => {
          if (!data || !data.is_active) {
            setStatus({ enabled: false, title: 'Live', type: 'm3u8', require_password: true, sources: [], lineup: [] });
            setStatusLoading(false);
            return null;
          }
          const enabled = !!data.is_live;
          let wasOff = false;
          setStatus(prev => {
            wasOff = !prev?.enabled;
            return {
              enabled, title: data.title || 'Live', type: data.live_type || 'm3u8',
              require_password: data.live_require_password !== false,
              sources: [],
              lineup: Array.isArray(data.lineup) ? data.lineup : [],
              show_date: data.show_date, show_time: data.show_time,
              image_url: data.image_url || '',
            };
          });
          // Stream URLs are no longer readable from the public table — only the
          // unlock-live edge function returns them. When live just toggled on,
          // silently re-call unlock to refresh url/sources.
          setUnlocked(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              enabled,
              title: data.title || prev.title,
              type: (data.live_type as SrcType) || prev.type,
            };
          });
          if (enabled && wasOff) {
            const t = search.get('t');
            const mt = search.get('mtoken');
            const mp = search.get('mp') || search.get('mpassword') || '';
            if (t) void doUnlock({ token: t }, true);
            else if (mt) void doUnlock({ mtoken: mt, mpassword: mp }, true);
            // For password-cached users, URL/sources were fetched at initial unlock.
          }
          setStatusLoading(false);
          return data;
        });
    }
    return supabase.rpc('get_live_status').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setStatus(row ? {
        enabled: !!row.enabled, title: row.title || 'Live', type: row.type || 'm3u8',
        require_password: row.require_password !== false,
        sources: toPublicSources(row.sources),
        lineup: Array.isArray(row.lineup) ? row.lineup : [],
      } : { enabled: false, title: 'Live', type: 'm3u8', require_password: true, sources: [], lineup: [] });
      setStatusLoading(false);
      return row;
    });
  };

  const reasonMessage = (reason?: string): string => {
    switch (reason) {
      case 'blocked': return 'Perangkat ini telah diblokir oleh admin.';
      case 'device_limit': return 'Token ini sudah terikat ke perangkat lain. Klik "Reset perangkat membership saya" jika ingin pindah perangkat.';
      case 'no_device': return 'ID perangkat tidak terdeteksi. Aktifkan penyimpanan browser lalu muat ulang halaman.';
      case 'bad_password': return 'Sandi yang dimasukkan salah. Coba lagi.';
      case 'bad_membership_password': return 'Sandi membership salah. Periksa kembali sandi Anda.';
      case 'revoked': return 'Token tidak valid atau telah dicabut.';
      case 'expired': return 'Membership Anda telah berakhir. Silakan perpanjang ke admin.';
      case 'not_started': return 'Membership belum aktif (belum mencapai waktu mulai).';
      case 'scope': return 'Membership ini tidak mencakup akses replay.';
      case 'off': return 'Live belum aktif.';
      case 'password_or_token_required': return 'Masukkan sandi atau gunakan link token.';
      case 'multi_device_no_reset': return 'Membership multi-device/publik tidak dapat direset manual.';
      case 'quota_exhausted': return 'Kuota reset manual sudah habis.';
      default: return 'Gagal membuka akses live.';
    }
  };

  const doUnlock = async (opts: { token?: string; password?: string; mtoken?: string; mpassword?: string }, silent = false) => {
    if (!silent) { setSubmitting(true); setPwError(''); }
    try {
      const { data } = await supabase.functions.invoke('unlock-live', {
        body: { ...opts, browser_id: getBrowserId(), show_id: showId || undefined, silent },
      });
      if (data?.valid) {
        const cfg: UnlockedConfig = {
          title: data.title,
          type: isSrcType(data.type) ? data.type : 'm3u8',
          url: data.url || '',
          sources: toPrivateSources(data.sources),
          watermark: data.watermark || '',
          enabled: !!data.enabled,
        };
        // For silent revalidation, NEVER overwrite the existing player URL/sources.
        // Doing so would change the React key on the player and remount it, restarting the live stream from the beginning.
        if (silent) {
          // Refresh metadata + flip enabled, and adopt new URL/sources only when current is empty
          // (avoid remounting the player mid-stream).
          setUnlocked(prev => {
            if (!prev) return cfg;
            const next = { ...prev, enabled: cfg.enabled, title: cfg.title, type: cfg.type };
            if (!prev.url && cfg.url) next.url = cfg.url;
            if ((!prev.sources || prev.sources.length === 0) && cfg.sources?.length) next.sources = cfg.sources;
            try { sessionStorage.setItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
          });
        } else {
          setUnlocked(cfg);
          try { sessionStorage.setItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`, JSON.stringify(cfg)); } catch { /* ignore */ }
        }
        if (data.membership) {
          setMembership(data.membership as MembershipInfo);
          if (opts.mtoken) saveMembershipCredentials(opts.mtoken, opts.mpassword || '');
        }
        if (data.token_kind || data.max_devices) {
          setTokenInfo({ kind: String(data.token_kind || 'personal'), max_devices: Number(data.max_devices || 1) });
        }
        
      } else if (silent) {
        // Only kick on hard security reasons. Other transient/server errors must NOT log user out.
        const reason = data?.reason;
        if (reason === 'revoked' || reason === 'blocked') {
          setUnlocked(null);
          setMembership(null);
          if (reason === 'revoked') clearMembershipCredentials();
          try { sessionStorage.removeItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`); } catch { /* ignore */ }
          navigate(`/kunci?reason=${reason}${showId ? `&show=${showId}` : ''}`, { replace: true });
        }
        // device_limit / off / network: ignore silently — keep user inside.
      } else {
        setPwError(reasonMessage(data?.reason));
      }
    } catch {
      if (!silent) setPwError('Gagal terhubung ke server.');
    }
    if (!silent) setSubmitting(false);
  };

  useEffect(() => {
    fetchStatus();
    const tParam = search.get('t');
    const mtParam = search.get('mtoken');
    let cached: string | null = null;
    try {
      cached = sessionStorage.getItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`);
      if (cached) setUnlocked(JSON.parse(cached));
    } catch { /* ignore */ }

    // Gate: if no token URL and no cached unlock, send user to the dedicated /kunci page.
    if (!tParam && !mtParam && !cached) {
      navigate(`/kunci${showId ? `?show=${showId}` : ''}`, { replace: true });
      return;
    }

    // Scope realtime subscriptions narrowly to reduce server load with many concurrent users.
    const bid = getBrowserId();
    const cfgChannel = showId
      ? supabase.channel(`live-cfg:${showId}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_shows', filter: `id=eq.${showId}` }, () => { fetchStatus(); })
          .subscribe()
      : supabase.channel('live-cfg:global')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_config_private' }, () => { fetchStatus(); })
          .subscribe();

    const tokChannel = supabase.channel(`live-blk:${bid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_browsers', filter: `browser_id=eq.${bid}` }, () => {
        if (tParam) void doUnlock({ token: tParam }, true);
        else if (unlocked) {
          setUnlocked(null);
          try { sessionStorage.removeItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`); } catch { /* ignore */ }
          navigate(`/kunci?reason=blocked${showId ? `&show=${showId}` : ''}`, { replace: true });
        }
      })
      .subscribe();

    // Lightweight token revalidation: poll every 60s instead of subscribing to entire token tables.
    const revalidate = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (tParam) void doUnlock({ token: tParam }, true);
      else if (mtParam) void doUnlock({ mtoken: mtParam, mpassword: search.get('mp') || search.get('mpassword') || '' }, true);
    }, 60000);

    return () => {
      window.clearInterval(revalidate);
      supabase.removeChannel(cfgChannel);
      supabase.removeChannel(tokChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = search.get('t');
    const mt = search.get('mtoken');
    const mp = search.get('mp') || search.get('mpassword') || '';
    if (unlocked || statusLoading) return;
    if (mt) void doUnlock({ mtoken: mt, mpassword: mp });
    else if (t) void doUnlock({ token: t });
  }, [search, statusLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelfReset = async () => {
    const mt = search.get('mtoken') || prompt('Masukkan token membership:') || '';
    if (!mt) return;
    const mp = search.get('mp') || search.get('mpassword') || prompt('Masukkan sandi membership:') || '';
    if (!mp) return;
    if (!confirm('Reset perangkat akan memutus akses dari perangkat lama dan menggunakan 1 kuota reset manual. Lanjutkan?')) return;
    try {
      const { data } = await supabase.functions.invoke('membership-self-reset', {
        body: { mtoken: mt, mpassword: mp, browser_id: getBrowserId() },
      });
      if (data?.ok) {
        setPwError('');
        if (typeof data.used === 'number' && typeof data.max === 'number') {
          setMembership((prev) => prev ? { ...prev, resets_used: data.used, resets_max: data.max, remaining: data.remaining } : prev);
        }
        alert(`Perangkat berhasil direset. Sisa kuota reset manual: ${data.remaining}/${data.max}.`);
        // Re-unlock with new device
        void doUnlock({ mtoken: mt, mpassword: mp });
      } else {
        alert(`Reset gagal: ${reasonMessage(data?.reason)}`);
      }
    } catch {
      alert('Gagal terhubung ke server.');
    }
  };

  const allSources = useMemo<PrivateSource[]>(() => {
    if (!unlocked) return [];
    const main: PrivateSource = { label: 'Player Utama', type: unlocked.type, url: unlocked.url };
    const extras = (unlocked.sources || []).filter(s => s.url);
    if (!main.url) return extras;
    return [main, ...extras];
  }, [unlocked]);

  useEffect(() => {
    setFailedSourceKeys([]);
  }, [unlocked?.url, unlocked?.sources]);

  const safeIdx = Math.min(sourceIdx, Math.max(0, allSources.length - 1));
  const activeSource = allSources[safeIdx];
  const sourceKey = (source: PrivateSource, index: number) => `${index}:${source.type}:${source.url}`;

  const selectSource = (i: number) => {
    setSourceIdx(i);
    try { sessionStorage.setItem(SS_SRC_KEY, String(i)); } catch { /* ignore */ }
  };

  const handleSourceFatalError = () => {
    const failedKey = activeSource ? sourceKey(activeSource, safeIdx) : '';
    setFailedSourceKeys(prev => failedKey && !prev.includes(failedKey) ? [...prev, failedKey] : prev);
    const next = allSources.findIndex((source, index) => index !== safeIdx && !failedSourceKeys.includes(sourceKey(source, index)));
    if (next >= 0) selectSource(next);
  };


  // ON AIR hanya saat admin manual mengaktifkan toggle is_live di admin panel.
  // status.enabled & unlocked.enabled keduanya bersumber dari kolom is_live.
  const liveActive = !!(status?.enabled || unlocked?.enabled);

  // ============ VIEWER COUNTER (presence) — count unique browser_id ============
  const showKey = search.get('show') || 'global';
  const [viewerCount, setViewerCount] = useState<number>(0);
  useEffect(() => {
    if (!liveActive) { setViewerCount(0); return; }
    const bid = getBrowserId();
    const channel = supabase.channel(`live-viewers:${showKey}`, {
      config: { presence: { key: bid } },
    });
    let pending: number | null = null;
    const recount = () => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = null;
        try {
          const state = channel.presenceState() as Record<string, unknown[]>;
          // Each unique presence key (browser_id) counts once even with multiple tabs
          const unique = new Set<string>();
          for (const k of Object.keys(state)) if (k && Array.isArray(state[k]) && state[k].length > 0) unique.add(k);
          setViewerCount(unique.size);
        } catch { /* ignore */ }
      }, 600);
    };
    let tracked = false;
    let heartbeat: number | null = null;
    channel
      .on('presence', { event: 'sync' }, recount)
      .on('presence', { event: 'join' }, recount)
      .on('presence', { event: 'leave' }, recount)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !tracked) {
          tracked = true;
          try { await channel.track({ at: Date.now() }); } catch { /* ignore */ }
          recount();
          // Heartbeat: re-track every 25s so phantom presences expire & counter stays accurate
          heartbeat = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
              channel.track({ at: Date.now() }).catch(() => {});
            }
          }, 25000);
        }
      });
    return () => {
      if (pending) window.clearTimeout(pending);
      if (heartbeat) window.clearInterval(heartbeat);
      try { void channel.untrack(); } catch { /* ignore */ }
      supabase.removeChannel(channel);
    };
  }, [liveActive, showKey]);

  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className={`sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3 transition-all duration-300 ${navVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {liveActive ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-500 text-[10px] font-bold uppercase tracking-wider">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              ON AIR
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/40 border border-border text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              OFF AIR
            </span>
          )}
        </div>
      </div>

      <div className="w-full max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-3">
        {statusLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
        ) : !unlocked ? (
          // No cached unlock + no token URL → redirect to /kunci is in flight (or token unlock in progress).
          <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
        ) : (
          <>
            {liveActive && activeSource ? (
              <>
                <Suspense fallback={<PlayerFallback />}>
                  {activeSource.type === 'm3u8'
                    ? <HlsPlayer key={`m3u8-${safeIdx}`} src={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} onFatalError={handleSourceFatalError} hideSeekButtons />
                    : <EmbedPlayer key={`em-${safeIdx}-${activeSource.type}`} type={activeSource.type} source={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} hideSeekButtons isLive />}
                </Suspense>

                <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold">
                    <Eye className="w-3.5 h-3.5" />
                    {viewerCount.toLocaleString('id-ID')} menonton
                  </span>
                  {unlocked.watermark && (
                    <span className="text-[10px] font-mono text-muted-foreground">ID: {unlocked.watermark}</span>
                  )}
                </div>

                {membership && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-foreground">Membership aktif</div>
                      <div className="text-muted-foreground">
                        {membership.expires_at ? `Berlaku s/d ${new Date(membership.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Tanpa batas waktu'}
                      </div>
                      {(membership.max_devices || 1) <= 1 && (
                        <div className="text-muted-foreground">
                          Reset perangkat: <span className="font-mono text-foreground">{membership.resets_used}/{membership.resets_max}</span> terpakai · Sisa <span className="font-mono text-foreground">{membership.remaining}</span>
                        </div>
                      )}
                    </div>
                    {(membership.max_devices || 1) <= 1 && (!tokenInfo || (tokenInfo.kind !== 'public' && tokenInfo.max_devices <= 1)) && (
                      <Button type="button" variant="outline" size="sm" onClick={handleSelfReset} disabled={membership.remaining <= 0}>
                        Reset perangkat ini
                      </Button>
                    )}
                  </div>
                )}

                {allSources.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {allSources.map((s, i) => (
                      <button
                        key={`${s.type}-${s.url}-${i}`}
                        type="button"
                        onClick={() => selectSource(i)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          i === safeIdx ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-secondary'
                        }`}
                      >
                        {s.label || `Player ${i + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <ScheduleCountdown
                title={status?.title || unlocked.title || 'Live'}
                showDate={status?.show_date}
                showTime={status?.show_time}
                imageUrl={status?.image_url}
              />
            )}

            {/* LINEUP */}
            {status?.lineup && status.lineup.length > 0 && (
              <div className="rounded-2xl bg-card/80 border border-border p-3 sm:p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Lineup</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {status.lineup.map((m, i) => (
                    <MemberAvatar key={i} name={m} size={56} />
                  ))}
                </div>
              </div>
            )}

            {/* LIVE CHAT */}
            <Suspense fallback={<ChatFallback />}>
              <LiveChat />
            </Suspense>
          </>
        )}
      </div>
    </div>
  );
}
