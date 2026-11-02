import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/backend';

/**
 * Kolom sandi replay yang selalu terlihat untuk user anon (tanpa akun).
 * Sandi diambil dari sandi yang diatur admin untuk show tersebut, lalu
 * disimpan di localStorage supaya tetap bisa dilihat kapan saja.
 */
export default function AnonReplayPassword({ token, showId, replayId }: { token: string; showId?: string; replayId?: string }) {
  const cacheKey = `replaytime-show-pw-${showId || replayId || token}`;
  const [password, setPassword] = useState<string>(() => {
    try { return localStorage.getItem(cacheKey) || ''; } catch { return ''; }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (password || !token) return;
    let cancelled = false;
    setLoading(true);
    supabase.functions
      .invoke('get-access-info', { body: { token, show_id: showId, replay_id: replayId } })
      .then(({ data }) => {
        if (cancelled) return;
        const pw = String((data as any)?.password || '');
        if (pw) {
          setPassword(pw);
          try { localStorage.setItem(cacheKey, pw); } catch { /* ignore */ }
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, showId, replayId, password, cacheKey]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Sandi replay disalin');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = password;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast.success('Sandi replay disalin');
      } catch {
        toast.error('Gagal menyalin, salin manual');
      }
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2 flex items-center gap-2">
      <KeyRound className="w-3.5 h-3.5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Sandi replay show ini</div>
        {loading && !password ? (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Memuat…
          </span>
        ) : password ? (
          <code className="text-[12px] font-mono font-semibold break-all text-foreground select-all">{password}</code>
        ) : (
          <span className="text-[11px] text-muted-foreground">Belum diatur admin.</span>
        )}
      </div>
      {!!password && (
        <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={copy}>
          <Copy className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
