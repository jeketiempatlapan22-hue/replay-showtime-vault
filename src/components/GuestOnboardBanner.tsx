import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserCircle2, LogIn, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createGuestAccount, getGuestAccount } from '@/lib/guest';

const DISMISS_KEY = 'replaytime-guest-banner-dismissed';

/**
 * Banner pemberitahuan untuk user anon: pilih akun guest atau daftar akun.
 * Kalau ditutup, user tetap bisa memakai aturan lama (tombol tonton muncul
 * otomatis setelah pembelian terkonfirmasi Pakasir).
 */
export default function GuestOnboardBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (user) { setVisible(false); return; }
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
      if (getGuestAccount()) return;
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, [user]);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-16 sm:bottom-4 z-40 px-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-xl border border-primary/40 bg-card/95 backdrop-blur-md shadow-lg p-3 space-y-2 animate-fade-up">
        <div className="flex items-start gap-2">
          <UserCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">Simpan riwayat pembelianmu</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Pilih akun guest (tersimpan di browser ini saja) atau daftar akun supaya riwayat show, replay,
              dan sandi replay tidak hilang. Tidak memilih juga tidak apa-apa — tombol Tonton tetap muncul
              setelah pembayaran terkonfirmasi.
            </p>
          </div>
          <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" className="h-8 text-[11px] gap-1" onClick={() => { dismiss(); navigate('/auth?redirect=/profil'); }}>
            <LogIn className="w-3 h-3" /> Daftar / Masuk
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px] gap-1"
            onClick={() => { createGuestAccount(); dismiss(); }}
          >
            <UserCircle2 className="w-3 h-3" /> Pakai Akun Guest
          </Button>
        </div>
        <button onClick={dismiss} className="w-full text-[10px] text-muted-foreground underline underline-offset-2">
          Nanti saja, lanjut tanpa akun
        </button>
      </div>
    </div>
  );
}
