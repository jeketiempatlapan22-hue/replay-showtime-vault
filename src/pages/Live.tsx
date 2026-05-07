import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, Radio, ShoppingBag, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';
import HlsPlayer from '@/components/HlsPlayer';
import EmbedPlayer from '@/components/EmbedPlayer';

type SrcType = 'm3u8' | 'youtube' | 'cloudflare';
interface PublicSource { label: string; type: SrcType }
interface PrivateSource extends PublicSource { url: string }
interface LiveStatus { enabled: boolean; title: string; type: string; require_password: boolean; sources: PublicSource[] }
interface UnlockedConfig { title: string; type: SrcType; url: string; sources: PrivateSource[]; watermark: string }

const SS_KEY = 'replaytime-live-unlocked';
const SS_SRC_KEY = 'replaytime-live-source-idx';
const WA_NUMBER = '6288809048431';
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Halo admin, saya ingin beli akses show live.')}`;

const typeLabel = (t: string) => t === 'youtube' ? 'YouTube' : t === 'cloudflare' ? 'Cloudflare' : 'M3U8 / HLS';

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

  const fetchStatus = () => supabase.rpc('get_live_status').then(({ data }) => {
    const row: any = Array.isArray(data) ? data[0] : data;
    setStatus(row ? { enabled: !!row.enabled, title: row.title || 'Live', type: row.type || 'm3u8', require_password: row.require_password !== false, sources: Array.isArray(row.sources) ? row.sources : [] }
      : { enabled: false, title: 'Live', type: 'm3u8', require_password: true, sources: [] });
    setStatusLoading(false);
    return row;
  });

  const doUnlock = async (opts: { token?: string; password?: string }, silent = false) => {
    if (!silent) { setSubmitting(true); setPwError(''); }
    try {
      const { data } = await supabase.functions.invoke('unlock-live', {
        body: { ...opts, browser_id: getBrowserId() },
      });
      if (data?.valid) {
        const cfg: UnlockedConfig = { title: data.title, type: data.type, url: data.url, sources: Array.isArray(data.sources) ? data.sources : [], watermark: data.watermark || '' };
        setUnlocked(cfg);
        setKickedMsg('');
        try { sessionStorage.setItem(SS_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
      } else if (silent) {
        // Silent revalidation failed → kick
        setUnlocked(null);
        try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
        setKickedMsg('Akses Anda telah dicabut oleh admin.');
      } else {
        if (data?.reason === 'device_limit') setPwError('Batas perangkat untuk token ini telah tercapai.');
        else if (data?.reason === 'off') setPwError('Live sedang tidak aktif.');
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
    let cancelled = false;
    fetchStatus().then(row => {
      if (cancelled) return;
      if (!row?.enabled) { setUnlocked(null); try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ } }
    });
    try {
      const cached = sessionStorage.getItem(SS_KEY);
      if (cached) setUnlocked(JSON.parse(cached));
    } catch { /* ignore */ }

    const cfgChannel = supabase.channel('live-config-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_config_private' }, () => {
        fetchStatus().then(row => {
          if (!row?.enabled) { setUnlocked(null); try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ } }
        });
      })
      .subscribe();

    // Realtime kick when admin revokes/deletes tokens
    const tokChannel = supabase.channel('live-tokens-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_tokens' }, () => {
        const t = search.get('t');
        if (t) void doUnlock({ token: t }, true);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_token_devices' }, () => {
        const t = search.get('t');
        if (t) void doUnlock({ token: t }, true);
      })
      .subscribe();

    // Re-validate on tab focus
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const t = search.get('t');
      if (t && unlocked) void doUnlock({ token: t }, true);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      supabase.removeChannel(cfgChannel);
      supabase.removeChannel(tokChannel);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-unlock with token from URL
  useEffect(() => {
    const t = search.get('t');
    if (!t || unlocked || statusLoading || !status?.enabled) return;
    void doUnlock({ token: t });
  }, [search, status, statusLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 sm:px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {status?.enabled ? (
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
        ) : !status?.enabled ? (
          <div className="rounded-xl bg-card/80 border border-border p-10 text-center space-y-3">
            <Radio className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-foreground font-semibold">Live tidak aktif</p>
            <p className="text-sm text-muted-foreground">Belum ada siaran live saat ini. Cek kembali nanti.</p>
          </div>
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

            {/* Password form — primary action */}
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

            {/* Beli Show CTA */}
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
            {activeSource && (
              <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                <div className="text-xs text-muted-foreground">
                  Sumber aktif: <span className="font-semibold text-foreground">{activeSource.label || 'Player'}</span>
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-secondary text-[10px] uppercase tracking-wider">{typeLabel(activeSource.type)}</span>
                </div>
                {unlocked.watermark && (
                  <span className="text-[10px] font-mono text-muted-foreground">ID: {unlocked.watermark}</span>
                )}
              </div>
            )}

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

            {activeSource && (
              activeSource.type === 'm3u8'
                ? <HlsPlayer key={`m3u8-${safeIdx}-${activeSource.url}`} src={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} />
                : <EmbedPlayer key={`em-${safeIdx}-${activeSource.url}`} type={activeSource.type} source={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
