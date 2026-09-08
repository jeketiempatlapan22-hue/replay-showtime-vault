import { useState } from 'react';
import { Download, Share, Plus, MoreVertical, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { cn } from '@/lib/utils';

interface Props {
  variant?: 'icon' | 'menu';
  className?: string;
  onDone?: () => void;
}

export default function InstallAppButton({ variant = 'icon', className, onDone }: Props) {
  const { canPrompt, installed, promptInstall, ios } = usePwaInstall();
  const [open, setOpen] = useState(false);

  if (installed) return null;

  const handleClick = async () => {
    const result = await promptInstall();
    if (result !== 'accepted') setOpen(true);
    else onDone?.();
  };

  const handleDirectInstall = async () => {
    const result = await promptInstall();
    if (result === 'accepted') { setOpen(false); onDone?.(); }
  };

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClick}
          className={cn('gap-1.5 text-foreground hover:text-primary px-2', className)}
          aria-label="Pasang aplikasi"
        >
          <Download className="w-4 h-4" />
          <span className="text-xs font-semibold hidden xs:inline sm:inline">Install</span>
        </Button>
      ) : (
        <button
          onClick={handleClick}
          className={cn(
            'flex items-center gap-3 w-full px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors',
            className
          )}
        >
          <Download className="w-5 h-5 text-primary" />
          <span className="font-medium flex-1 text-left">Install Aplikasi</span>
          {canPrompt && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
              SIAP
            </span>
          )}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-primary">Cara Install Aplikasi</DialogTitle>
            <DialogDescription>
              Setelah dipasang, ReplayTime terbuka seperti aplikasi biasa dengan semua fitur yang sama.
            </DialogDescription>
          </DialogHeader>

          {canPrompt && (
            <Button className="w-full gap-2" size="lg" onClick={handleDirectInstall}>
              <Download className="w-5 h-5" />
              Install Sekarang
            </Button>
          )}

          <div className="space-y-4 text-sm">
            {ios ? (
              <Steps
                title="iPhone / iPad (Safari)"
                steps={[
                  <>Buka situs ini di <b>Safari</b>.</>,
                  <>Ketuk ikon <Share className="inline w-4 h-4 mb-0.5" /> <b>Bagikan</b> di bawah layar.</>,
                  <>Pilih <b>Tambahkan ke Layar Utama</b> <Plus className="inline w-4 h-4 mb-0.5" />.</>,
                  <>Ketuk <b>Tambah</b>, lalu buka ikon ReplayTime di layar utama.</>,
                ]}
              />
            ) : (
              <>
                <Steps
                  title="Android (Chrome)"
                  steps={[
                    <>Ketuk menu <MoreVertical className="inline w-4 h-4 mb-0.5" /> di pojok kanan atas browser.</>,
                    <>Pilih <b>Install aplikasi</b> atau <b>Tambahkan ke Layar utama</b>.</>,
                    <>Konfirmasi dengan <b>Install</b>.</>,
                  ]}
                />
                <Steps
                  title="Komputer (Chrome / Edge)"
                  steps={[
                    <>Klik ikon <Download className="inline w-4 h-4 mb-0.5" /> di ujung kanan kolom alamat.</>,
                    <>Klik <b>Install</b> pada jendela yang muncul.</>,
                  ]}
                />
              </>
            )}
          </div>

          <Button className="w-full mt-2" onClick={() => setOpen(false)}>Mengerti</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Steps({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  return (
    <div className="rounded-lg border border-border p-3 bg-secondary/40">
      <p className="font-semibold text-foreground mb-2 flex items-center gap-2">
        <Check className="w-4 h-4 text-primary" /> {title}
      </p>
      <ol className="space-y-1.5 list-decimal list-inside text-muted-foreground">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
