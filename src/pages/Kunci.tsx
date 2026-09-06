import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, ShoppingBag, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';
import { DEFAULT_ADMIN_WA } from '@/lib/adminWa';

const SS_KEY_BASE = 'replaytime-live-unlocked';
const WA_NUMBER = DEFAULT_ADMIN_WA;
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Halo admin, saya ingin beli akses show live.')}`;

const reasonMessage = (reason?: string): string => {
  switch (reason) {
    case 'blocked': return 'Perangkat ini telah diblokir oleh admin.';
    case 'device_limit': return 'Token ini sudah terikat ke perangkat lain.';
    case 'no_device': return 'ID perangkat tidak terdeteksi. Aktifkan penyimpanan browser lalu muat ulang.';
    case 'bad_password': return 'Sandi yang dimasukkan salah. Coba lagi.';
    case 'bad_membership_password': return 'Sandi membership salah.';
    case 'revoked': return 'Token tidak valid atau telah dicabut.';
    case 'expired': return 'Membership Anda telah berakhir.';
    case 'not_started': return 'Membership belum aktif.';
    case 'rate_limited': return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
    case 'off': return 'Live belum aktif.';
    case 'multi_device_no_reset': return 'Membership multi-device/publik tidak dapat direset manual.';
    case 'quota_exhausted': return 'Kuota reset manual sudah habis.';
    default: return 'Gagal membuka akses live.';
  }
};

export default function Kunci() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const showId = search.get('show') || '';
  const ssKey = `${SS_KEY_BASE}${showId ? '-' + showId : ''}`;

  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  // If already unlocked (cached), bounce straight to /live
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(ssKey);
      if (cached) {
        navigate(`/live${showId ? `?show=${showId}` : ''}`, { replace: true });
        return;
      }
    } catch { /* ignore */ }

    const reason = search.get('reason');
    if (reason) setNotice(reasonMessage(reason));
  }, [showId, ssKey, navigate, search]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwInput.trim()) { setPwError('Sandi wajib diisi.'); return; }
    setSubmitting(true); setPwError('');
    try {
      const { data } = await supabase.functions.invoke('unlock-live', {
        body: { password: pwInput.trim(), browser_id: getBrowserId(), show_id: showId || undefined },
      });
      if (data?.valid) {
        // Simpan grant & idn_show_id agar pemutar Hanabira/IDN (yang membutuhkan
        // signed grant) langsung siap di /live tanpa "Sesi akses belum siap".
        const cfg = {
          title: data.title,
          type: data.type || 'm3u8',
          url: data.url || '',
          sources: Array.isArray(data.sources) ? data.sources : [],
          watermark: data.watermark || '',
          enabled: !!data.enabled,
          idn_show_id: data.idn_show_id || '',
          grant: data.grant || '',
        };
        try { sessionStorage.setItem(ssKey, JSON.stringify(cfg)); } catch { /* ignore */ }
        navigate(`/live${showId ? `?show=${showId}` : ''}`, { replace: true });
      } else {
        setPwError(reasonMessage(data?.reason));
      }
    } catch {
      setPwError('Gagal terhubung ke server.');
    }
    setSubmitting(false);
  };

  const handleSelfReset = async () => {
    const mt = prompt('Masukkan token membership:') || '';
    if (!mt) return;
    const mp = prompt('Masukkan sandi membership:') || '';
    if (!mp) return;
    if (!confirm('Reset perangkat akan memutus akses dari perangkat lama dan menggunakan 1 kuota reset manual. Lanjutkan?')) return;
    try {
      const { data } = await supabase.functions.invoke('membership-self-reset', {
        body: { mtoken: mt, mpassword: mp, browser_id: getBrowserId() },
      });
      if (data?.ok) {
        alert(`Perangkat berhasil direset. Sisa kuota reset manual: ${data.remaining}/${data.max}.`);
      } else {
        alert(`Reset gagal: ${reasonMessage(data?.reason)}`);
      }
    } catch {
      alert('Gagal terhubung ke server.');
    }
  };

  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-sm sm:text-lg font-semibold truncate font-sans min-w-0 flex-1">Kunci Akses Live</h1>
      </div>

      <div className="w-full max-w-screen-md mx-auto px-2 sm:px-4 lg:px-6 py-6 sm:py-10">
        <div className="rounded-2xl bg-card/80 border border-border p-6 max-w-md mx-auto space-y-5">
          <div className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Akses Live Terkunci</h2>
            <p className="text-sm text-muted-foreground">
              Masukkan <span className="font-semibold text-foreground">sandi satuan show</span> atau <span className="font-semibold text-foreground">sandi master bulanan</span>, atau hubungi admin untuk membeli show.
            </p>
          </div>

          {notice && <p className="text-xs text-destructive text-center">{notice}</p>}

          <form onSubmit={submitPassword} className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Lock className="w-3.5 h-3.5" />
              Sandi Akses Live
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Masukkan sandi"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                disabled={submitting}
                autoFocus
              />
              <Button type="submit" disabled={submitting || !pwInput.trim()}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buka'}
              </Button>
            </div>
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <p className="text-[11px] text-muted-foreground">
              Punya link token? Buka langsung lewat <code className="px-1 rounded bg-secondary text-[10px]">/live?t=TOKEN</code>
            </p>
          </form>

          <div className="pt-4 border-t border-border space-y-3">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ShoppingBag className="w-3.5 h-3.5" />
                Belum punya akses?
              </div>
              <p className="text-xs text-muted-foreground">Hubungi admin untuk pembelian show.</p>
            </div>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="block">
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white gap-2">
                <MessageCircle className="w-4 h-4" />
                Beli Show via WhatsApp
              </Button>
            </a>
            <p className="text-center text-[11px] text-muted-foreground">+62 838-9908-7711</p>

            <div className="pt-3 border-t border-border">
              <Button type="button" variant="ghost" size="sm" className="w-full text-xs" onClick={handleSelfReset}>
                Reset perangkat membership saya
              </Button>
              <p className="text-[10px] text-muted-foreground text-center mt-1">
                Gunakan jika ingin pindah browser/device. Maks. 3x reset manual; otomatis reset tiap 00:00 WIB.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
