import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, ShoppingBag, MessageCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';
import HlsPlayer from '@/components/HlsPlayer';
import EmbedPlayer from '@/components/EmbedPlayer';
import MemberAvatar from '@/components/MemberAvatar';
import LiveChat from '@/components/LiveChat';

type SrcType = 'm3u8' | 'youtube' | 'cloudflare';
interface PublicSource { label: string; type: SrcType }
interface PrivateSource extends PublicSource { url: string }
interface LiveStatus { enabled: boolean; title: string; type: string; require_password: boolean; sources: PublicSource[]; lineup: string[]; show_date?: string; show_time?: string; image_url?: string }
interface UnlockedConfig { title: string; type: SrcType; url: string; sources: PrivateSource[]; watermark: string; enabled: boolean }

const SS_KEY_BASE = 'replaytime-live-unlocked';
const SS_SRC_KEY = 'replaytime-live-source-idx';
const WA_NUMBER = '6288809048431';
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Halo admin, saya ingin beli akses show live.')}`;

const typeLabel = (t: string) => t === 'youtube' ? 'YouTube' : t === 'cloudflare' ? 'Cloudflare' : 'M3U8 / HLS';

function pad(n: number) { return String(n).padStart(2, '0'); }

function ScheduleCountdown({ title, showDate, showTime, imageUrl }: { title: string; showDate?: string; showTime?: string; imageUrl?: string }) {
  const target = showDate && showTime ? new Date(`${showDate}T${showTime}`) : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const diff = target ? target.getTime() - now : 0;
  const past = !target || diff <= 0;
  const d = Math.max(0, Math.floor(diff / 86400000));
  const h = Math.max(0, Math.floor((diff % 86400000) / 3600000));
  const m = Math.max(0, Math.floor((diff % 3600000) / 60000));
  const s = Math.max(0, Math.floor((diff % 60000) / 1000));
  const dateLabel = target ? target.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const timeLabel = target ? `${pad(target.getHours())}:${pad(target.getMinutes())} WIB` : '';

  return (
    <div className="relative rounded-2xl overflow-hidden border border-primary/30 min-h-[320px]">
      {imageUrl && (
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url(${imageUrl})`, opacity: 0.35 }}
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/80" aria-hidden />
      <div className="relative p-6 sm:p-8 text-center space-y-4">
        <p className="text-[10px] font-bold tracking-widest text-primary uppercase">Jadwal Live</p>
        <h3 className="text-xl sm:text-3xl font-bold text-white drop-shadow">{title}</h3>
        {target && <p className="text-sm sm:text-base text-white/90 drop-shadow">{dateLabel} • {timeLabel}</p>}
        {past ? (
          <p className="text-sm sm:text-base font-semibold text-white drop-shadow">⏳ Menunggu admin memulai siaran…</p>
        ) : (
          <>
            <p className="text-xs text-white/80">Player akan terbuka otomatis ketika LIVE dimulai</p>
            <div className="grid grid-cols-4 gap-2 max-w-md mx-auto">
              {[{v:d,l:'Hari'},{v:h,l:'Jam'},{v:m,l:'Menit'},{v:s,l:'Detik'}].map((u,i)=>(
                <div key={i} className="rounded-lg bg-white/10 backdrop-blur border border-white/30 py-3">
                  <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums drop-shadow">{pad(u.v)}</div>
                  <div className="text-[10px] text-white/80 uppercase tracking-wider">{u.l}</div>
                </div>
              ))}
            </div>
          </>
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
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [kickedMsg, setKickedMsg] = useState('');
  const [sourceIdx, setSourceIdx] = useState<number>(() => {
    try { return Math.max(0, Number(sessionStorage.getItem(SS_SRC_KEY) || '0')); } catch { return 0; }
  });

  const showId = search.get('show') || '';

  const fetchStatus = () => {
    if (showId) {
      return supabase.from('active_shows')
        .select('id,title,is_live,live_type,live_url,live_sources,live_require_password,lineup,show_date,show_time,is_active,image_url')
        .eq('id', showId).maybeSingle()
        .then(({ data }) => {
          if (!data || !data.is_active) {
            setStatus({ enabled: false, title: 'Live', type: 'm3u8', require_password: true, sources: [], lineup: [] });
            setStatusLoading(false);
            return null;
          }
          const enabled = !!data.is_live;
          const pubSources = (Array.isArray(data.live_sources) ? data.live_sources : []).map((s: any) => ({ label: s.label, type: s.type }));
          let wasOff = false;
          setStatus(prev => {
            wasOff = !prev?.enabled;
            return {
              enabled, title: data.title || 'Live', type: data.live_type || 'm3u8',
              require_password: data.live_require_password !== false,
              sources: pubSources,
              lineup: Array.isArray(data.lineup) ? data.lineup : [],
              show_date: data.show_date, show_time: data.show_time,
              image_url: data.image_url || '',
            };
          });
          setUnlocked(prev => prev ? {
            ...prev,
            enabled,
            title: data.title || prev.title,
            type: (data.live_type as SrcType) || prev.type,
            url: data.live_url || '',
            sources: (Array.isArray(data.live_sources) ? data.live_sources : []) as unknown as PrivateSource[],
          } : prev);
          // When live just toggled on, silently re-call unlock to re-validate (token/blocked)
          if (enabled && wasOff) {
            const t = search.get('t');
            if (t) void doUnlock({ token: t }, true);
          }
          setStatusLoading(false);
          return data;
        });
    }
    return supabase.rpc('get_live_status').then(({ data }) => {
      const row: any = Array.isArray(data) ? data[0] : data;
      setStatus(row ? {
        enabled: !!row.enabled, title: row.title || 'Live', type: row.type || 'm3u8',
        require_password: row.require_password !== false,
        sources: Array.isArray(row.sources) ? row.sources : [],
        lineup: Array.isArray(row.lineup) ? row.lineup : [],
      } : { enabled: false, title: 'Live', type: 'm3u8', require_password: true, sources: [], lineup: [] });
      setStatusLoading(false);
      return row;
    });
  };

  const doUnlock = async (opts: { token?: string; password?: string }, silent = false) => {
    if (!silent) { setSubmitting(true); setPwError(''); }
    try {
      const { data } = await supabase.functions.invoke('unlock-live', {
        body: { ...opts, browser_id: getBrowserId(), show_id: showId || undefined },
      });
      if (data?.valid) {
        const cfg: UnlockedConfig = { title: data.title, type: data.type, url: data.url, sources: Array.isArray(data.sources) ? data.sources : [], watermark: data.watermark || '', enabled: !!data.enabled };
        setUnlocked(cfg);
        setKickedMsg('');
        try { sessionStorage.setItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`, JSON.stringify(cfg)); } catch { /* ignore */ }
      } else if (silent) {
        setUnlocked(null);
        try { sessionStorage.removeItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`); } catch { /* ignore */ }
        setKickedMsg('Akses Anda telah dicabut oleh admin.');
      } else {
        if (data?.reason === 'blocked') setPwError('Perangkat ini telah diblokir oleh admin.');
        else if (data?.reason === 'device_limit') setPwError('Batas perangkat untuk token ini telah tercapai.');
        else if (data?.reason === 'bad_password') setPwError('Sandi salah.');
        else if (data?.reason === 'revoked') setPwError('Token tidak valid atau telah dicabut.');
        else setPwError('Gagal membuka akses live.');
      }
    } catch {
      if (!silent) setPwError('Gagal terhubung ke server.');
    }
    if (!silent) setSubmitting(false);
  };

  useEffect(() => {
    fetchStatus();
    try {
      const cached = sessionStorage.getItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`);
      if (cached) setUnlocked(JSON.parse(cached));
    } catch { /* ignore */ }

    const cfgChannel = supabase.channel('live-config-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_config_private' }, () => { fetchStatus(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_shows', ...(showId ? { filter: `id=eq.${showId}` } : {}) }, () => { fetchStatus(); })
      .subscribe();

    const tokChannel = supabase.channel('live-tokens-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_tokens' }, () => {
        const t = search.get('t');
        if (t) void doUnlock({ token: t }, true);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_token_devices' }, () => {
        const t = search.get('t');
        if (t) void doUnlock({ token: t }, true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_show_tokens' }, () => {
        const t = search.get('t');
        if (t) void doUnlock({ token: t }, true);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'active_show_token_devices' }, () => {
        const t = search.get('t');
        if (t) void doUnlock({ token: t }, true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(cfgChannel);
      supabase.removeChannel(tokChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = search.get('t');
    if (!t || unlocked || statusLoading) return;
    void doUnlock({ token: t });
  }, [search, statusLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSources = useMemo<PrivateSource[]>(() => {
    if (!unlocked) return [];
    const main: PrivateSource = { label: 'Player Utama', type: unlocked.type, url: unlocked.url };
    const extras = (unlocked.sources || []).filter(s => s.url);
    if (!main.url) return extras;
    return [main, ...extras];
  }, [unlocked]);

  const safeIdx = Math.min(sourceIdx, Math.max(0, allSources.length - 1));
  const activeSource = allSources[safeIdx];

  const selectSource = (i: number) => {
    setSourceIdx(i);
    try { sessionStorage.setItem(SS_SRC_KEY, String(i)); } catch { /* ignore */ }
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwInput.trim()) return;
    void doUnlock({ password: pwInput.trim() });
  };

  const liveActive = unlocked?.enabled ?? status?.enabled ?? false;

  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 sm:px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {liveActive ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-500 text-[10px] font-bold uppercase tracking-wider">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              ON AIR
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/40 border border-border text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              OFF AIR
            </span>
          )}
          <h1 className="text-base sm:text-lg font-semibold truncate font-sans">{unlocked?.title || status?.title || 'Live'}</h1>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-4 space-y-3">
        {statusLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
        ) : !unlocked ? (
          <div className="rounded-2xl bg-card/80 border border-border p-6 max-w-md mx-auto space-y-5">
            <div className="text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Akses Live Terkunci</h2>
              <p className="text-sm text-muted-foreground">
                Masukkan <span className="font-semibold text-foreground">sandi akses</span> di bawah, atau hubungi admin untuk membeli show.
              </p>
            </div>

            <form onSubmit={submitPassword} className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Lock className="w-3.5 h-3.5" />
                Sandi Akses Live
              </label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Masukkan sandi"
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
                <Button type="submit" disabled={submitting || !pwInput.trim()}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buka'}
                </Button>
              </div>
              {pwError && <p className="text-xs text-destructive">{pwError}</p>}
              <p className="text-[11px] text-muted-foreground">
                Punya link token? Buka langsung lewat <code className="px-1 rounded bg-secondary text-[10px]">/live?t=TOKEN</code>
              </p>
            </form>

            {kickedMsg && <p className="text-xs text-destructive text-center">{kickedMsg}</p>}

            <div className="pt-4 border-t border-border space-y-3">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Belum punya akses?
                </div>
                <p className="text-xs text-muted-foreground">Hubungi admin untuk pembelian show.</p>
              </div>
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="block">
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Beli Show via WhatsApp
                </Button>
              </a>
              <p className="text-center text-[11px] text-muted-foreground">+62 888-0904-8431</p>
            </div>
          </div>
        ) : (
          <>
            {liveActive && activeSource ? (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                  <div className="text-xs text-muted-foreground">
                    Sumber aktif: <span className="font-semibold text-foreground">{activeSource.label || 'Player'}</span>
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-secondary text-[10px] uppercase tracking-wider">{typeLabel(activeSource.type)}</span>
                  </div>
                  {unlocked.watermark && (
                    <span className="text-[10px] font-mono text-muted-foreground">ID: {unlocked.watermark}</span>
                  )}
                </div>

                {allSources.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {allSources.map((s, i) => (
                      <button
                        key={i}
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

                {activeSource.type === 'm3u8'
                  ? <HlsPlayer key={`m3u8-${safeIdx}-${activeSource.url}`} src={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} />
                  : <EmbedPlayer key={`em-${safeIdx}-${activeSource.url}`} type={activeSource.type} source={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} />}
              </>
            ) : (
              <ScheduleCountdown
                title={status?.title || unlocked.title || 'Live'}
                showDate={status?.show_date}
                showTime={status?.show_time}
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
            <LiveChat />
          </>
        )}
      </div>
    </div>
  );
}
