import { useEffect, useState } from 'react';
import { ShieldAlert, MessageCircle, Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBrowserId } from '@/lib/browserId';
import { getSettings } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';

export default function BlockedScreen() {
  const [waNumber, setWaNumber] = useState('');
  const [waLink, setWaLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const browserId = getBrowserId();

  useEffect(() => {
    getSettings().then((s) => {
      setWaNumber(s.whatsapp_number || '');
      setWaLink(s.whatsapp_link || '');
    });

    // Listen for unblock in realtime
    const channel = supabase
      .channel(`block-status-${browserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'blocked_browsers', filter: `browser_id=eq.${browserId}` },
        (payload) => {
          const row = payload.new as { unblocked?: boolean };
          if (row.unblocked) {
            window.location.reload();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [browserId]);

  const copyId = () => {
    navigator.clipboard?.writeText(browserId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const checkAccess = async () => {
    setChecking(true);
    const { data } = await supabase
      .from('blocked_browsers')
      .select('unblocked')
      .eq('browser_id', browserId)
      .maybeSingle();
    setChecking(false);
    if (data?.unblocked) window.location.reload();
  };

  const waMessage = encodeURIComponent(
    `Halo Admin, saya terblokir di ReplayTime. Mohon buka kembali akses saya.\n\nBrowser ID: ${browserId}`
  );
  const waUrl = waNumber ? `https://wa.me/${waNumber.replace(/\D/g, '')}?text=${waMessage}` : waLink;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-destructive/30 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center">
            <ShieldAlert className="w-9 h-9 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-sans">Akses Diblokir</h1>
          <p className="text-sm text-muted-foreground">
            Aktivitas mencurigakan terdeteksi (DevTools/Inspect Element). Untuk mendapatkan akses kembali, hubungi admin dan kirimkan Browser ID di bawah ini.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Browser ID Anda</label>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
            <code className="flex-1 text-xs font-mono text-foreground break-all">{browserId}</code>
            <button
              type="button"
              onClick={copyId}
              className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-primary transition-colors"
              aria-label="Salin"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {waUrl && (
          <Button
            type="button"
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => window.open(waUrl, '_blank')}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Hubungi Admin via WhatsApp
          </Button>
        )}

        <Button type="button" variant="outline" className="w-full" onClick={checkAccess} disabled={checking}>
          <RefreshCw className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Memeriksa...' : 'Periksa Akses'}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          Akses akan otomatis pulih setelah admin membuka blokir.
        </p>
      </div>
    </div>
  );
}
