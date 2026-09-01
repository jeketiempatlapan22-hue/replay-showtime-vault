import { useEffect, useState } from 'react';
import { RotateCcw, Loader2, AlertTriangle, Users, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';

type Props =
  | { kind: 'show'; token: string; label?: string }
  | { kind: 'membership'; token: string; password: string; label?: string };

type Quota = {
  used: number;
  max: number;
  remaining: number;
  eligible: boolean;
  reason?: string;
} | null;

/**
 * Banner + tombol reset perangkat (kuota maks 3×). Saat ditekan, semua perangkat
 * lama akan dilepas dan perangkat ini langsung jadi pemilik tunggal token.
 * Untuk token multi-device, banner info ditampilkan tanpa tombol reset.
 */
export default function DeviceResetButton(props: Props) {
  const { kind, token } = props;
  const [quota, setQuota] = useState<Quota>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const peek = async () => {
    if (!token) { setQuota(null); setLoading(false); return; }
    setLoading(true);
    try {
      const fn = kind === 'show' ? 'show-token-self-reset' : 'membership-self-reset';
      const body: Record<string, unknown> = { browser_id: getBrowserId(), peek: true };
      if (kind === 'show') body.token = token;
      else { body.mtoken = token; body.mpassword = (props as any).password; }
      const { data } = await supabase.functions.invoke(fn, { body });
      if (data?.ok) {
        setQuota({
          used: Number(data.used || 0),
          max: Number(data.max || 3),
          remaining: Number(data.remaining || 0),
          eligible: data.eligible !== false,
          reason: data.reason,
        });
      } else {
        setQuota(null);
      }
    } catch {
      setQuota(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void peek(); /* eslint-disable-next-line */ }, [token]);

  const doReset = async () => {
    if (!quota || !quota.eligible || quota.remaining <= 0 || busy) return;
    const ok = window.confirm(
      'Yakin reset perangkat?\n\n' +
      'Perangkat lain yang sedang memakai token ini akan otomatis keluar dan token hanya bisa dipakai di perangkat ini.\n\n' +
      `Sisa kesempatan reset: ${quota.remaining}/${quota.max}`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const fn = kind === 'show' ? 'show-token-self-reset' : 'membership-self-reset';
      const body: Record<string, unknown> = { browser_id: getBrowserId() };
      if (kind === 'show') body.token = token;
      else { body.mtoken = token; body.mpassword = (props as any).password; }
      const { data } = await supabase.functions.invoke(fn, { body });
      if (data?.ok) {
        toast.success('Perangkat berhasil direset', {
          description: `Perangkat lama dikeluarkan. Sisa kuota reset: ${data.remaining}/${data.max}.`,
        });
        setQuota({
          used: Number(data.used || 0),
          max: Number(data.max || 3),
          remaining: Number(data.remaining || 0),
          eligible: Number(data.remaining || 0) > 0,
        });
      } else {
        const reason = data?.reason;
        const msg = reason === 'quota_exhausted' ? 'Kuota reset manual sudah habis. Hubungi admin.'
          : reason === 'multi_device_no_reset' ? 'Token multi-device tidak bisa direset manual.'
          : reason === 'revoked' ? 'Token sudah dicabut.'
          : reason === 'expired' ? 'Token sudah kedaluwarsa.'
          : reason === 'bad_password' ? 'Sandi tidak cocok.'
          : 'Gagal reset perangkat. Coba lagi.';
        toast.error(msg);
      }
    } catch {
      toast.error('Gagal terhubung ke server saat reset.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Memuat info reset perangkat…
      </div>
    );
  }
  if (!quota) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] leading-snug text-muted-foreground">
        Info reset perangkat tidak tersedia untuk token ini. Jika tidak bisa dibuka di perangkat ini, hubungi admin.
      </div>
    );
  }


  // Multi-device banner — no reset button, just info.
  if (quota.reason === 'multi_device') {
    return (
      <div className="rounded-md border-2 border-blue-500/40 bg-blue-500/10 p-2.5">
        <div className="flex items-start gap-2 text-[11px] leading-snug">
          <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <div className="font-semibold text-blue-700 dark:text-blue-400">
              Token Multi-Perangkat
            </div>
            <div className="text-muted-foreground">
              Token ini sudah bisa dipakai di beberapa perangkat sekaligus, jadi tidak perlu (dan tidak bisa) direset manual. Untuk perubahan akses, hubungi admin.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (quota.reason === 'revoked' || quota.reason === 'expired') {
    return (
      <div className="rounded-md border-2 border-destructive/40 bg-destructive/5 p-2.5">
        <div className="flex items-start gap-2 text-[11px] leading-snug">
          <ShieldX className="w-3.5 h-3.5 mt-0.5 shrink-0 text-destructive" />
          <div className="flex-1">
            <div className="font-semibold text-destructive">
              {quota.reason === 'revoked' ? 'Token sudah dicabut admin' : 'Token sudah kedaluwarsa'}
            </div>
            <div className="text-muted-foreground">Hubungi admin untuk bantuan lanjutan.</div>
          </div>
        </div>
      </div>
    );
  }

  const exhausted = quota.remaining <= 0;

  return (
    <div className={`rounded-md border-2 p-2 space-y-1.5 ${exhausted ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/10'}`}>
      <div className="flex items-start gap-1.5 text-[11px] leading-snug">
        <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${exhausted ? 'text-destructive' : 'text-amber-600'}`} />
        <div className="flex-1">
          <div className={`font-semibold ${exhausted ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
            Pindah perangkat? Reset manual {quota.used}/{quota.max} terpakai
          </div>
          <div className="text-muted-foreground">
            {exhausted
              ? 'Kuota reset habis. Hubungi admin untuk bantuan pindah perangkat.'
              : <>Sisa <b>{quota.remaining}×</b> kesempatan reset. Saat direset, perangkat lama otomatis keluar dan {kind === 'show' ? 'token' : 'membership'} hanya aktif di perangkat ini.</>}
          </div>
        </div>
      </div>
      {!exhausted && (
        <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" disabled={busy} onClick={doReset}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
          {busy ? 'Mereset…' : `Reset perangkat (sisa ${quota.remaining})`}
        </Button>
      )}
    </div>
  );
}
