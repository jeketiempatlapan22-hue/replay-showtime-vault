import { useState } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  collectResetTargets, getResetAllRemaining, resetAllDevices,
  RESET_ALL_MAX_PER_DAY, type ResetAllTarget,
} from '@/lib/deviceResetAll';

export default function ResetAllDevicesButton({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState<ResetAllTarget[]>([]);
  const [remaining, setRemaining] = useState(RESET_ALL_MAX_PER_DAY);

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    setRemaining(getResetAllRemaining());
    try { setTargets(await collectResetTargets(user?.id)); } catch { setTargets([]); }
    setLoading(false);
  };

  const run = async () => {
    setBusy(true);
    const r = await resetAllDevices(targets);
    setBusy(false);
    setRemaining(getResetAllRemaining());
    setOpen(false);
    onDone?.();
    if (r.reset > 0) {
      toast.success('Semua perangkat berhasil direset', {
        description: `${r.reset} akses sekarang aktif di perangkat ini. Perangkat lain otomatis keluar.`,
      });
    } else if (r.failed > 0) {
      toast.error('Reset gagal atau kuota hari ini habis. Coba lagi besok setelah pukul 00.00.');
    } else {
      toast.info('Tidak ada akses yang perlu direset.');
    }
  };

  const exhausted = remaining <= 0;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors text-left"
      >
        <RotateCcw className="w-5 h-5 text-primary" />
        <div className="min-w-0">
          <span className="font-medium block">Reset Semua Perangkat</span>
          <span className="text-xs text-muted-foreground">Sisa {getResetAllRemaining()}/{RESET_ALL_MAX_PER_DAY} hari ini</span>
        </div>
      </button>

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset semua perangkat?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {loading ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Mencari akses Anda…</span>
                ) : targets.length === 0 ? (
                  <p>Belum ada akses live atau membership di perangkat/akun ini. Masuk ke akun atau buka link token sekali, lalu coba lagi.</p>
                ) : (
                  <>
                    <p>Semua perangkat lain akan keluar, dan <b>{targets.length} akses</b> Anda langsung aktif di perangkat ini.</p>
                    <ul className="list-disc pl-5 text-xs max-h-28 overflow-y-auto">
                      {targets.map((t) => <li key={`${t.kind}-${t.token}`} className="truncate">{t.label}</li>)}
                    </ul>
                  </>
                )}
                <p className="text-xs">
                  Kesempatan reset: <b>{remaining}/{RESET_ALL_MAX_PER_DAY}</b> hari ini. Kuota terisi ulang dan semua perangkat direset otomatis setiap pukul 00.00 WIB.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || loading || exhausted || targets.length === 0}
              onClick={(e) => { e.preventDefault(); void run(); }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RotateCcw className="w-4 h-4 mr-1" />}
              {exhausted ? 'Kuota habis' : 'Reset sekarang'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
