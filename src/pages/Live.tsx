import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, Radio } from 'lucide-react';
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
interface UnlockedConfig { title: string; type: SrcType; url: string; sources: PrivateSource[] }

const SS_KEY = 'replaytime-live-unlocked';
const SS_SRC_KEY = 'replaytime-live-source-idx';

const typeLabel = (t: string) => t === 'youtube' ? 'YouTube' : t === 'cloudflare' ? 'Cloudflare' : 'M3U8 / HLS';

export default function Live() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [unlocked, setUnlocked] = useState<UnlockedConfig | null>(null);
  const [, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

    const channel = supabase.channel('live-config-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_config_private' }, () => {
        fetchStatus().then(row => {
          if (!row?.enabled) { setUnlocked(null); try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ } }
          // re-unlock to refresh URLs if admin changed sources
          else if (unlocked) {
            const t = search.get('t');
            if (t) void doUnlock({ token: t }, true);
          }
        });
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-unlock with token from URL
  useEffect(() => {
    const t = search.get('t');
    if (!t || unlocked || statusLoading || !status?.enabled) return;
    void doUnlock({ token: t });
  }, [search, status, statusLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const doUnlock = async (opts: { token?: string }, silent = false) => {
    if (!silent) setSubmitting(true);
    if (!silent) setPwError('');
    try {
      const { data } = await supabase.functions.invoke('unlock-live', {
        body: { ...opts, browser_id: getBrowserId() },
      });
      if (data?.valid) {
        const cfg: UnlockedConfig = { title: data.title, type: data.type, url: data.url, sources: Array.isArray(data.sources) ? data.sources : [] };
        setUnlocked(cfg);
        try { sessionStorage.setItem(SS_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
        if (!silent) setPwInput('');
      } else if (!silent) {
        if (data?.reason === 'device_limit') setPwError('Batas perangkat untuk token ini telah tercapai.');
        else if (data?.reason === 'off') setPwError('Live sedang tidak aktif.');
        else if (data?.reason === 'token_required') setPwError('Akses live hanya melalui link token.');
        else setPwError('Token tidak valid atau dicabut.');
      }
    } catch {
      if (!silent) setPwError('Gagal terhubung ke server.');
    }
    if (!silent) setSubmitting(false);
  };

  // Combined sources list (default first, then extras)
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
          <div className="rounded-xl bg-card/80 border border-border p-6 max-w-md mx-auto space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-foreground font-semibold">Akses Live Terkunci</p>
              <p className="text-sm text-muted-foreground">Halaman live ini hanya bisa diakses melalui <span className="font-semibold text-foreground">link token</span> yang diberikan admin.</p>
              <p className="text-xs text-muted-foreground">Format link: <code className="px-1 py-0.5 rounded bg-secondary text-[10px]">/live?t=TOKEN</code></p>
              {status.sources?.length > 0 && (
                <p className="text-[11px] text-muted-foreground pt-1">Tersedia {status.sources.length + 1} player setelah link terbuka.</p>
              )}
            </div>
            {pwError && <p className="text-xs text-destructive text-center">{pwError}</p>}
            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>Kembali ke Beranda</Button>
          </div>
        ) : (
          <>
            {/* Source info bar */}
            {activeSource && (
              <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                <div className="text-xs text-muted-foreground">
                  Sumber aktif: <span className="font-semibold text-foreground">{activeSource.label || 'Player'}</span>
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-secondary text-[10px] uppercase tracking-wider">{typeLabel(activeSource.type)}</span>
                </div>
              </div>
            )}

            {/* Player selector */}
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

            {/* Player */}
            {activeSource && (
              activeSource.type === 'm3u8'
                ? <HlsPlayer key={`m3u8-${safeIdx}-${activeSource.url}`} src={activeSource.url} title={unlocked.title} />
                : <EmbedPlayer key={`em-${safeIdx}-${activeSource.url}`} type={activeSource.type} source={activeSource.url} title={unlocked.title} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
