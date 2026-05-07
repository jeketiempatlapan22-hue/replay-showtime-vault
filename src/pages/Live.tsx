import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';
import HlsPlayer from '@/components/HlsPlayer';
import EmbedPlayer from '@/components/EmbedPlayer';

interface LiveStatus { enabled: boolean; title: string; type: string; require_password: boolean }
interface UnlockedConfig { title: string; type: 'm3u8' | 'youtube' | 'cloudflare'; url: string }

const SS_KEY = 'replaytime-live-unlocked';

export default function Live() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [unlocked, setUnlocked] = useState<UnlockedConfig | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_live_status').then(({ data }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      setStatus(row || { enabled: false, title: 'Live', type: 'm3u8', require_password: true });
      setStatusLoading(false);
    });
    // restore session
    try {
      const cached = sessionStorage.getItem(SS_KEY);
      if (cached) setUnlocked(JSON.parse(cached));
    } catch { /* ignore */ }

    const channel = supabase.channel('live-config-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_config_private' }, () => {
        supabase.rpc('get_live_status').then(({ data }) => {
          const row = Array.isArray(data) ? data[0] : data;
          setStatus(row || { enabled: false, title: 'Live', type: 'm3u8', require_password: true });
          // if disabled, drop unlock
          if (!row?.enabled) { setUnlocked(null); try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ } }
        });
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  // Auto-unlock with token from URL
  useEffect(() => {
    const t = search.get('t');
    if (!t || unlocked || statusLoading || !status?.enabled) return;
    void doUnlock({ token: t });
  }, [search, status, statusLoading]);

  const doUnlock = async (opts: { password?: string; token?: string }) => {
    setSubmitting(true);
    setPwError('');
    try {
      const { data } = await supabase.functions.invoke('unlock-live', {
        body: { ...opts, browser_id: getBrowserId() },
      });
      if (data?.valid) {
        const cfg: UnlockedConfig = { title: data.title, type: data.type, url: data.url };
        setUnlocked(cfg);
        try { sessionStorage.setItem(SS_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
        setPwInput('');
      } else {
        if (data?.reason === 'device_limit') setPwError('Batas perangkat untuk token ini telah tercapai.');
        else if (data?.reason === 'off') setPwError('Live sedang tidak aktif.');
        else setPwError(opts.token ? 'Token tidak valid atau dicabut.' : 'Sandi salah.');
      }
    } catch {
      setPwError('Gagal terhubung ke server.');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 sm:px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full ${status?.enabled ? 'bg-red-500 opacity-75 animate-ping' : 'bg-muted-foreground opacity-40'}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${status?.enabled ? 'bg-red-500' : 'bg-muted-foreground'}`} />
          </span>
          <h1 className="text-base sm:text-lg font-semibold truncate font-sans">{unlocked?.title || status?.title || 'Live'}</h1>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-4">
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
            <div className="text-center">
              <p className="text-foreground font-semibold">Akses Live Terkunci</p>
              <p className="text-sm text-muted-foreground mt-1">Masukkan sandi atau gunakan link dengan token.</p>
            </div>
            <Input type="password" placeholder="Sandi live..." value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(''); }}
              onKeyDown={e => e.key === 'Enter' && pwInput.trim() && doUnlock({ password: pwInput.trim() })}
              autoFocus
            />
            {pwError && <p className="text-xs text-destructive text-center">{pwError}</p>}
            <Button className="w-full" disabled={submitting || !pwInput.trim()} onClick={() => doUnlock({ password: pwInput.trim() })}>
              {submitting ? 'Memeriksa...' : 'Buka Live'}
            </Button>
          </div>
        ) : unlocked.type === 'm3u8' ? (
          <HlsPlayer src={unlocked.url} title={unlocked.title} />
        ) : (
          <EmbedPlayer type={unlocked.type as 'youtube' | 'cloudflare'} source={unlocked.url} title={unlocked.title} />
        )}
      </div>
    </div>
  );
}
