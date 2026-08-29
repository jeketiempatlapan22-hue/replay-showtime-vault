import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogIn, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createGuestAccount } from '@/lib/guest';

export default function GuestChoice({ onGuest }: { onGuest: () => void }) {
  const navigate = useNavigate();

  const useGuest = () => {
    createGuestAccount();
    onGuest();
  };

  return (
    <main className="container mx-auto px-3 sm:px-4 py-6 max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lihat Riwayat Pembelian Kamu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pilih cara menyimpan riwayat pembelian show, replay, dan membership kamu.
          </p>

          <Button className="w-full" onClick={() => navigate('/auth?redirect=/profil')}>
            <LogIn className="w-4 h-4 mr-2" /> Buat Akun / Masuk
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Tersimpan permanen di server. Bisa dibuka di HP, TV, atau PC mana pun.
          </p>

          <div className="h-px bg-border my-2" />

          <Button variant="outline" className="w-full" onClick={useGuest}>
            <UserCircle2 className="w-4 h-4 mr-2" /> Lanjut sebagai Guest
          </Button>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-px" />
            <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-relaxed">
              Akun guest dibuat otomatis dan hanya disimpan di browser perangkat ini — tanpa email dan
              nomor HP. Kalau data browser dihapus atau kamu ganti perangkat,
              <span className="font-semibold"> riwayat pembelian dan sandi replay akan hilang </span>
              dan tidak bisa dipulihkan. Daftar dengan email + nomor HP + kata sandi untuk menyimpannya permanen.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
