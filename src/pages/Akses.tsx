import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, PlayCircle, ShieldCheck, Lock, Calendar, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import ThemedBackground from '@/components/ThemedBackground';

type ReplayLite = {
  id: string;
  title: string;
  date: string;
  show_name: string;
  image_url: string;
  lineup: string[];
  criteria: string;
  access_token: string | null;
};

export default function Akses() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const replayId = params.get('replay') ?? '';

  const [loading, setLoading] = useState(true);
  const [replay, setReplay] = useState<ReplayLite | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!token || !replayId) {
      setError('Link tidak lengkap. Pastikan URL berisi token dan replay.');
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('replays')
        .select('id,title,date,show_name,image_url,lineup,criteria,access_token')
        .eq('id', replayId)
        .maybeSingle();
      if (error || !data) {
        setError('Replay tidak ditemukan.');
      } else {
        // Validasi penuh dilakukan server-side saat pemutaran (master atau personal token).
        setReplay(data as ReplayLite);
      }
      setLoading(false);
    })();
  }, [token, replayId]);

  const handleOpen = useCallback(() => {
    if (!replay) return;
    try {
      sessionStorage.setItem(`replaytime-tok-${replay.id}`, token);
    } catch { /* ignore */ }
    navigate(`/?token=${encodeURIComponent(token)}&replay=${replay.id}`);
  }, [replay, token, navigate]);

  // Auto-open replay langsung setelah token tervalidasi
  useEffect(() => {
    if (replay && !loading && !error) {
      const t = setTimeout(handleOpen, 600);
      return () => clearTimeout(t);
    }
  }, [replay, loading, error, handleOpen]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <ThemedBackground theme="ramadhan" />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-3">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-primary">Akses Token Replay</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">ReplayTime</h1>
            <p className="text-sm text-muted-foreground mt-1">Link akses pribadi Anda</p>
          </div>

          <div className="rounded-2xl bg-card/80 backdrop-blur-xl border border-border shadow-2xl overflow-hidden">
            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Memverifikasi token…</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <Lock className="w-12 h-12 text-destructive mx-auto mb-3" />
                <h2 className="font-semibold text-foreground mb-1">Akses Ditolak</h2>
                <p className="text-sm text-muted-foreground mb-4">{error}</p>
                <Button variant="outline" onClick={() => navigate('/')}>Ke Beranda</Button>
              </div>
            ) : replay ? (
              <>
                {replay.image_url && (
                  <div className="aspect-video bg-muted overflow-hidden">
                    <img src={replay.image_url} alt={replay.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="p-5 space-y-4">
                  <div>
                    {replay.show_name && (
                      <Badge variant="secondary" className="mb-2 text-xs">
                        <Sparkles className="w-3 h-3 mr-1" />{replay.show_name}
                      </Badge>
                    )}
                    <h2 className="text-lg font-bold text-foreground leading-snug">{replay.title}</h2>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{replay.date}</span>
                    </div>
                  </div>

                  {replay.lineup?.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Lineup: </span>
                      {replay.lineup.join(', ')}
                    </div>
                  )}

                  <Button onClick={handleOpen} size="lg" className="w-full gap-2">
                    <PlayCircle className="w-5 h-5" />
                    Buka Replay
                  </Button>

                  <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
                    🔒 Link ini bersifat pribadi. Jangan dibagikan ke orang lain.
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-4">
            © ReplayTime — Semua replay dilindungi
          </p>
        </div>
      </div>
    </div>
  );
}
