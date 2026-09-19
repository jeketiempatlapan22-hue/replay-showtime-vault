import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Smartphone, Tv, Projector, UserPlus, Coins, Ticket,
  ChevronDown, ChevronUp, Link as LinkIcon, Copy, KeyRound, Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import HamburgerMenu from '@/components/HamburgerMenu';
import logoImg from '@/assets/logo.png';
import imgMobile from '@/assets/guide-mobile.jpg';
import imgTv from '@/assets/guide-tv.jpg';
import imgProjector from '@/assets/guide-projector.jpg';
import imgRegister from '@/assets/guide-register.jpg';
import imgCoin from '@/assets/guide-coin.jpg';
import imgBuyShow from '@/assets/guide-buy-show.jpg';
import imgLiveTv from '@/assets/guide-live-tv.jpg';
import imgLiveProjector from '@/assets/guide-live-projector.jpg';

type Guide = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  image: string;
  summary: string;
  steps: { title: string; desc: string }[];
  note?: string;
};

const GUIDES: Guide[] = [
  {
    id: 'mobile',
    title: 'Akses Website di Mobile (HP)',
    icon: Smartphone,
    image: imgMobile,
    summary: 'Cara membuka dan menonton lewat smartphone Android maupun iPhone.',
    steps: [
      { title: 'Buka browser', desc: 'Gunakan Chrome (Android) atau Safari (iPhone). Hindari browser dalam aplikasi (mis. dari WA) — buka di browser utama.' },
      { title: 'Masukkan alamat website', desc: 'Ketik alamat resmi website di address bar lalu tekan Enter.' },
      { title: 'Putar layar ke landscape', desc: 'Saat menonton, putar HP ke samping (landscape) atau ketuk ikon fullscreen di pemutar untuk pengalaman terbaik.' },
      { title: 'Tambahkan ke layar utama (opsional)', desc: 'Pada menu browser pilih "Tambahkan ke Layar Utama" agar website bisa dibuka seperti aplikasi.' },
    ],
    note: 'Jika video sering buffering, periksa kuota/sinyal. Coba refresh halaman atau ganti dari data seluler ke WiFi.',
  },
  {
    id: 'tv',
    title: 'Akses Website di Smart TV',
    icon: Tv,
    image: imgTv,
    summary: 'Tonton show & replay di layar besar lewat Smart TV.',
    steps: [
      { title: 'Buka browser di TV', desc: 'Smart TV (Samsung, LG, Android TV, Google TV) biasanya punya browser bawaan. Cari aplikasi "Internet" atau "Web Browser".' },
      { title: 'Ketik alamat website', desc: 'Gunakan remote untuk mengetik alamat. Tip: ketik di HP, lalu kirim ke TV dengan QR code menu/share browser.' },
      { title: 'Login & buka link token', desc: 'Tempel link token yang kamu dapatkan dari WhatsApp ke address bar. Pakai keyboard bluetooth jika tersedia.' },
      { title: 'Alternatif: Casting', desc: 'Buka website di HP lalu Cast/Mirror ke TV via Chromecast, AirPlay, atau "Smart View" (Samsung).' },
      { title: 'Alternatif: HDMI', desc: 'Hubungkan laptop ke TV pakai kabel HDMI. Buka website di laptop dan pindahkan ke layar TV.' },
    ],
    note: 'Untuk Smart TV yang tidak punya browser bagus, cara paling stabil adalah cast dari HP atau hubungkan laptop via HDMI.',
  },
  {
    id: 'projector',
    title: 'Akses Website di Proyektor',
    icon: Projector,
    image: imgProjector,
    summary: 'Setup nonton bareng (nobar) menggunakan proyektor.',
    steps: [
      { title: 'Siapkan sumber video', desc: 'Pakai laptop, mini PC, atau Android TV Box sebagai sumber. Pastikan tersambung ke internet (WiFi/LAN).' },
      { title: 'Sambungkan ke proyektor', desc: 'Hubungkan dengan kabel HDMI dari laptop ke proyektor. Untuk wireless, pakai Anycast/Chromecast/Miracast.' },
      { title: 'Atur tampilan ke "Duplicate"', desc: 'Di Windows tekan Win+P → Duplicate. Di Mac, buka System Settings → Displays → Mirror Display.' },
      { title: 'Atur resolusi proyektor', desc: 'Pilih 1920×1080 (Full HD) jika tersedia agar gambar tajam.' },
      { title: 'Buka website & login', desc: 'Buka browser, masuk ke website, tempel link token, lalu masuk fullscreen (tekan F11 di laptop).' },
      { title: 'Atur suara', desc: 'Pastikan output audio diarahkan ke proyektor atau speaker tambahan. Cek volume sistem & volume player.' },
    ],
    note: 'Untuk nobar besar, kabel HDMI lebih stabil dari wireless. Tes setup minimal 30 menit sebelum acara mulai.',
  },
  {
    id: 'live-tv',
    title: 'Nonton Halaman Live di Smart TV',
    icon: Tv,
    image: imgLiveTv,
    summary: 'Cara membuka halaman live show di Smart TV agar bisa ditonton di layar besar.',
    steps: [
      { title: 'Buka link/token live di HP dulu', desc: 'Pastikan link token live (atau sandi membership) sudah aktif & bisa diputar di HP terlebih dahulu — supaya verifikasi token tidak terkunci ke perangkat yang salah.' },
      { title: 'Pilih cara casting ke TV', desc: 'Tiga opsi: (a) Cast/Mirror dari HP via Chromecast / AirPlay / Smart View, (b) Sambungkan HP/laptop ke TV pakai kabel HDMI + adapter USB-C/Lightning, atau (c) Buka langsung di browser bawaan Smart TV.' },
      { title: 'Casting dari HP (Android/iPhone)', desc: 'Android: tarik panel notifikasi → ketuk "Cast / Screen Mirror" → pilih TV. iPhone: Control Center → "Screen Mirroring" → pilih Apple TV / AirPlay receiver.' },
      { title: 'Kabel HDMI (paling stabil)', desc: 'Pakai adapter USB-C → HDMI (Android/iPhone 15+) atau Lightning → HDMI (iPhone lama). Colok ke port HDMI TV, ganti input TV ke HDMI tersebut.' },
      { title: 'Buka halaman live & fullscreen', desc: 'Setelah tampil di TV, ketuk ikon fullscreen pada player. Jangan tekan "Watch on YouTube" — player sudah dikunci di website.' },
      { title: 'Reset perangkat bila perlu', desc: 'Jika token live menolak dengan pesan "dipakai di perangkat lain", klik tombol Reset Perangkat di halaman akses, lalu reload di TV.' },
    ],
    note: 'Browser Smart TV sering tertinggal. Jika player tidak lancar, cara paling stabil adalah cast/mirror dari HP atau pakai kabel HDMI dari laptop.',
  },
  {
    id: 'live-projector',
    title: 'Nonton Halaman Live di Proyektor (Nobar)',
    icon: Projector,
    image: imgLiveProjector,
    summary: 'Setup nonton bareng halaman live show menggunakan proyektor.',
    steps: [
      { title: 'Siapkan sumber video', desc: 'Pakai laptop / mini PC / Android TV Box yang stabil & terhubung internet WiFi atau LAN. Hindari pakai HP untuk sesi panjang (overheating).' },
      { title: 'Sambungkan ke proyektor via HDMI', desc: 'Colok kabel HDMI dari laptop ke proyektor. Tekan Win+P (Windows) → Duplicate, atau di Mac: System Settings → Displays → Mirror.' },
      { title: 'Atur resolusi & rasio 16:9', desc: 'Set resolusi 1920×1080 (Full HD) dan aspect ratio 16:9 di proyektor agar tidak terpotong atau gepeng.' },
      { title: 'Buka halaman live di browser', desc: 'Buka website, masuk ke halaman live (lewat link token atau sandi member). Klik fullscreen di player, lalu tekan F11 di browser untuk fullscreen total.' },
      { title: 'Atur audio ke speaker eksternal', desc: 'Proyektor speaker bawaan biasanya kecil. Hubungkan output 3.5mm laptop ke speaker bluetooth / soundbar / mixer untuk audio yang layak nobar.' },
      { title: 'Cek koneksi & buffering', desc: 'Tes 30 menit sebelum acara: pastikan playback tidak buffering. Jika sering putus, pindah ke koneksi LAN kabel atau dekatkan router.' },
      { title: 'Reset perangkat bila perlu', desc: 'Jika token live menolak dengan pesan "dipakai di perangkat lain", buka halaman akses di laptop yang sama lalu klik Reset Perangkat.' },
    ],
    note: 'JANGAN sentuh tombol playlist saat live sedang lancar — biarkan player di sumber default. Ganti playlist hanya jika sumber utama mati.',
  },

  {
    id: 'register',
    title: 'Cara Daftar di Website',
    icon: UserPlus,
    image: imgRegister,
    summary: 'Buat akun untuk bisa beli show, beli koin, dan ikut membership.',
    steps: [
      { title: 'Klik menu Masuk / Daftar', desc: 'Buka menu (ikon ☰) lalu pilih "Masuk / Daftar".' },
      { title: 'Pilih tab "Daftar"', desc: 'Isi email aktif dan buat sandi minimal 6 karakter.' },
      { title: 'Konfirmasi email (jika diminta)', desc: 'Cek inbox email — buka link konfirmasi yang dikirim sistem.' },
      { title: 'Lengkapi profil', desc: 'Setelah masuk, buka halaman Profil untuk lengkapi nama dan nomor WhatsApp.' },
    ],
    note: 'Pakai email yang benar-benar aktif — link token & notifikasi pembayaran dikirim ke email/WhatsApp tersebut.',
  },
  {
    id: 'buy-show',
    title: 'Cara Beli Show / Replay (Langsung di Website)',
    icon: Ticket,
    image: imgBuyShow,
    summary: 'Semua pembelian selesai sendiri di website — tidak perlu chat admin.',
    steps: [
      { title: '1 menit: pilih show/replay', desc: 'Di halaman depan pilih kartu show atau replay yang ingin ditonton, lalu tekan tombol harga (mis. "Beli Show" / "Beli Replay").' },
      { title: 'Isi nomor WhatsApp & email', desc: 'Nomor dipakai sebagai tanda kepemilikan pembelian. Cukup isi sekali; tidak dikirim ke siapa pun selain sistem.' },
      { title: 'Pilih cara bayar: QRIS atau Koin', desc: 'QRIS: nominal sudah otomatis sesuai harga. Koin: saldo langsung dipotong dan akses aktif seketika.' },
      { title: 'Scan QRIS lalu tunggu di halaman yang sama', desc: 'Bayar dari e-wallet atau m-banking apa pun. Jangan tutup halaman — status berubah otomatis begitu pembayaran masuk (biasanya di bawah 1 menit).' },
      { title: 'Tekan "Tonton Sekarang"', desc: 'Begitu lunas, tombol tonton langsung muncul di kotak pembayaran dan di kartu show. Klik dan langsung diputar — tanpa menyalin link atau meminta token ke admin.' },
      { title: 'Buka lagi kapan saja lewat Profil', desc: 'Semua pembelian tersimpan di halaman Profil → Riwayat Pembelian. Klik salah satu baris untuk membukanya kembali di perangkat mana pun.' },
    ],
    note: 'Jika status masih "menunggu" lebih dari 5 menit, tekan tombol "Cek Status Pembayaran" di kotak yang sama — sistem akan memeriksa ulang ke penyedia pembayaran.',
  },
  {
    id: 'coin',
    title: 'Cara Beli Koin',
    icon: Coins,
    image: imgCoin,
    summary: 'Isi koin sekali, lalu beli show/replay/membership tanpa scan QRIS berulang.',
    steps: [
      { title: 'Buka menu Koin', desc: 'Lewat navigasi bawah atau hamburger menu → "Koin".' },
      { title: 'Pilih paket koin', desc: 'Paket lebih besar biasanya lebih hemat per koinnya.' },
      { title: 'Bayar QRIS', desc: 'Scan dengan DANA, OVO, GoPay, ShopeePay, atau m-banking. Nominal sudah pas, tidak perlu diubah.' },
      { title: 'Saldo masuk otomatis', desc: 'Saldo koin bertambah sendiri setelah pembayaran tervalidasi. Tidak perlu konfirmasi ke admin.' },
      { title: 'Pakai koin', desc: 'Di kartu show/replay/membership pilih tombol bayar dengan Koin — akses aktif saat itu juga.' },
    ],
    note: 'Saldo koin bisa dilihat kapan saja di halaman Profil.',
  },
  {
    id: 'token',
    title: 'Cara Pakai Link Token & Reset Perangkat',
    icon: LinkIcon,
    image: imgMobile,
    summary: 'Token adalah kunci pribadi untuk masuk ke show/replay yang sudah dibeli.',
    steps: [
      { title: 'Salin link token', desc: 'Buka kartu show yang sudah dibeli, klik "Salin Link Token".' },
      { title: 'Tempel di browser perangkat tujuan', desc: 'Buka browser di HP/TV/Laptop yang akan dipakai menonton, paste link ke address bar, tekan Enter.' },
      { title: 'Token mengunci ke 1 perangkat', desc: 'Link token (1 perangkat) otomatis terkunci ke perangkat pertama yang membukanya.' },
      { title: 'Ingin pindah perangkat? Reset!', desc: 'Buka link di perangkat baru, masuk ke halaman akses, klik "Reset Perangkat". Perangkat lama otomatis keluar.' },
      { title: 'Kuota reset maksimum 3×', desc: 'Reset mandiri dibatasi 3 kali per token agar tidak disalahgunakan.' },
    ],
    note: 'Token MULTI-PERANGKAT (untuk paket khusus) bisa dipakai di banyak perangkat sekaligus dan tidak perlu (tidak bisa) direset manual.',
  },
  {
    id: 'membership',
    title: 'Membership: Akses Tanpa Beli Per Show',
    icon: Crown,
    image: imgBuyShow,
    summary: 'Beli membership sendiri di website; akses aktif otomatis setelah bayar.',
    steps: [
      { title: 'Buka menu Membership', desc: 'Pilih paket sesuai durasi (1 bulan = 31 hari, 2 bulan = 62 hari).' },
      { title: 'Isi nomor WhatsApp & email', desc: 'Dipakai sebagai penanda kepemilikan membership kamu.' },
      { title: 'Bayar QRIS atau tukar Koin', desc: 'Nominal QRIS sudah otomatis sesuai harga paket. Dengan koin, akses aktif seketika.' },
      { title: 'Akses aktif otomatis', desc: 'Setelah lunas, status berubah jadi "Member Aktif" dan tombol "Tonton Live (Member)" muncul sendiri di kartu show — tanpa memasukkan token manual.' },
      { title: 'Cek masa aktif di Profil', desc: 'Halaman Profil menampilkan sisa masa aktif dan tombol reset perangkat bila ganti HP/TV.' },
    ],
    note: 'Jika paket sedang dijeda admin, tombol beli membership tidak muncul — coba lagi nanti.',
  },
  {
    id: 'watch-live',
    title: 'Cara Nonton Live',
    icon: Tv,
    image: imgLiveTv,
    summary: 'Langkah menonton siaran live setelah beli show atau punya membership.',
    steps: [
      { title: 'Pastikan akses sudah aktif', desc: 'Beli show-nya, pakai link token, atau aktifkan membership. Kartu show akan berubah jadi tombol "Tonton".' },
      { title: 'Buka halaman Live', desc: 'Klik tombol "Tonton Live" di kartu show, atau buka menu Live dari hamburger menu.' },
      { title: 'Masukkan sandi bila diminta', desc: 'Sandi ada di kartu akses (tombol salin sandi) atau pesan WhatsApp yang kamu terima.' },
      { title: 'Atur tampilan', desc: 'Ketuk ikon fullscreen / putar HP ke landscape. Untuk layar besar, pakai menu Hubungkan TV/Proyektor.' },
      { title: 'Jika video macet', desc: 'Refresh halaman satu kali. Kualitas akan menyesuaikan otomatis jika jaringan melemah.' },
    ],
    note: 'Live baru bisa ditonton saat admin sudah menyalakan siaran atau jadwal live otomatis sudah masuk.',
  },
  {
    id: 'watch-replay',
    title: 'Cara Nonton Replay',
    icon: Smartphone,
    image: imgMobile,
    summary: 'Menonton ulang show yang sudah selesai, kapan saja.',
    steps: [
      { title: 'Buka halaman utama', desc: 'Daftar replay dikelompokkan per bulan pada halaman depan.' },
      { title: 'Pilih replay & buka', desc: 'Klik kartu replay yang sudah kamu beli, atau beli dulu jika belum.' },
      { title: 'Masukkan sandi replay', desc: 'Sandi replay ada di kartu akses di halaman Profil atau di pesan WhatsApp.' },
      { title: 'Gunakan kontrol pemutar', desc: 'Tersedia play/pause, maju–mundur 10 detik, geser waktu, pengatur kecepatan, dan fullscreen.' },
    ],
    note: 'Sandi bundel juga membuka replay dari show yang termasuk dalam bundel.',
  },
  {
    id: 'tips',
    title: 'Pembayaran Lama Terkonfirmasi? Ini Solusinya',
    icon: KeyRound,
    image: imgRegister,
    summary: 'Langkah mandiri jika status pembayaran belum berubah.',
    steps: [
      { title: 'Tunggu 1–3 menit', desc: 'Konfirmasi QRIS biasanya masuk di bawah 1 menit, kadang sampai 3 menit saat ramai.' },
      { title: 'Tekan "Cek Status Pembayaran"', desc: 'Tombol ada di kotak pembayaran yang sama. Sistem akan menanyakan ulang statusnya ke penyedia pembayaran.' },
      { title: 'Buka Profil → Riwayat Pembelian', desc: 'Pembelian yang sudah lunas selalu tampil di sini beserta tombol tonton.' },
      { title: 'Pastikan nomor WhatsApp benar', desc: 'Pembelian tanpa login dikenali dari nomor WhatsApp. Gunakan nomor yang sama saat membuka kembali di perangkat lain.' },
      { title: 'QRIS kedaluwarsa? Ulangi saja', desc: 'Jika kode QRIS habis masa berlaku, tutup lalu tekan tombol beli lagi — kode baru dibuat otomatis dan uang tidak terpotong dua kali.' },
    ],
  },
];

export default function Panduan() {
  const navigate = useNavigate();
  const initialId = (() => {
    const h = typeof window !== 'undefined' ? window.location.hash.replace('#guide-', '') : '';
    return h && GUIDES.some(g => g.id === h) ? h : 'mobile';
  })();
  const [openId, setOpenId] = useState<string | null>(initialId);
  const [lightMode, setLightMode] = useState(() => { try { return localStorage.getItem('replaytime-mode') === 'light'; } catch { return false; } });

  // Buka & gulirkan ke panduan yang dituju dari menu (#guide-<id>)
  useEffect(() => {
    const apply = () => {
      const id = window.location.hash.replace('#guide-', '');
      if (!id || !GUIDES.some(g => g.id === id)) return;
      setOpenId(id);
      setTimeout(() => {
        document.getElementById(`guide-anchor-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  const toggle = (mode: boolean) => {
    setLightMode(mode);
    try {
      document.documentElement.classList.toggle('light', mode);
      localStorage.setItem('replaytime-mode', mode ? 'light' : 'dark');
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center gap-2">
          <HamburgerMenu whatsappNumber="" whatsappLink="" lightMode={lightMode} onToggleMode={() => toggle(!lightMode)} />
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0" title="Kembali">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={logoImg} alt="RealTime48" className="w-8 h-8 rounded-full object-cover" loading="lazy" />
          <h1 className="text-base sm:text-lg font-bold text-primary truncate">Panduan Penggunaan</h1>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 pb-28 sm:pb-10 max-w-3xl">
        <section className="text-center mb-6 sm:mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
            <KeyRound className="w-3.5 h-3.5" /> Panduan & Cara Pakai
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Mulai Dari Sini</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto px-2">
            Panduan lengkap akses website di HP, TV, proyektor & PC, plus cara daftar, beli koin, beli show, dan pakai link token.
          </p>
        </section>

        {/* Banner ringkas tombol salin link */}
        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3 sm:p-4 mb-6 flex items-start gap-3">
          <Copy className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <div className="font-semibold text-foreground mb-0.5">Semua pembelian selesai di website ini</div>
            <div className="text-muted-foreground">
              Pilih show → bayar QRIS atau Koin → tombol <b>"Tonton Sekarang"</b> muncul otomatis. Tidak perlu chat admin untuk minta link atau token.
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {GUIDES.map((g) => {
            const Icon = g.icon;
            const isOpen = openId === g.id;
            return (
              <article
                key={g.id}
                id={`guide-anchor-${g.id}`}
                className="scroll-mt-20 rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : g.id)}
                  className="w-full flex items-center gap-3 p-3 sm:p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-expanded={isOpen}
                  aria-controls={`guide-${g.id}`}
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-foreground leading-snug">{g.title}</h3>
                    <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 mt-0.5">{g.summary}</p>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {isOpen && (
                  <div id={`guide-${g.id}`} className="border-t border-border">
                    <div className="aspect-video bg-muted overflow-hidden">
                      <img
                        src={g.image}
                        alt={g.title}
                        loading="lazy"
                        width={1024}
                        height={640}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <ol className="p-3 sm:p-4 space-y-3">
                      {g.steps.map((s, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground">{s.title}</div>
                            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed">{s.desc}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {g.note && (
                      <div className="mx-3 sm:mx-4 mb-3 sm:mb-4 rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] sm:text-xs text-amber-700 dark:text-amber-400">
                        <b>Catatan:</b> {g.note}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          Semua langkah pembelian di atas bisa diselesaikan sendiri langsung di website ini.
        </div>
      </main>
    </div>
  );
}
