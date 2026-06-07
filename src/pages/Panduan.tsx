import { useState } from 'react';
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
    id: 'coin',
    title: 'Cara Beli Koin',
    icon: Coins,
    image: imgCoin,
    summary: 'Top up koin untuk menukar show atau membership tanpa QRIS berulang.',
    steps: [
      { title: 'Buka menu Koin', desc: 'Pilih menu "Koin" dari navigasi bawah atau hamburger menu.' },
      { title: 'Pilih paket koin', desc: 'Tersedia beberapa paket. Semakin besar paket biasanya semakin hemat.' },
      { title: 'Bayar via QRIS', desc: 'Scan QRIS yang muncul lewat aplikasi e-wallet (DANA, OVO, GoPay, ShopeePay) atau m-banking.' },
      { title: 'Tunggu konfirmasi otomatis', desc: 'Koin masuk otomatis setelah pembayaran tervalidasi. Refresh halaman jika belum muncul.' },
      { title: 'Kirim bukti jika lama', desc: 'Jika koin belum masuk setelah 5 menit, kirim bukti pembayaran ke admin lewat tombol "Kirim Bukti".' },
    ],
  },
  {
    id: 'buy-show',
    title: 'Cara Beli Show / Replay',
    icon: Ticket,
    image: imgBuyShow,
    summary: 'Beli tiket show live atau replay untuk ditonton kapan saja.',
    steps: [
      { title: 'Buka halaman Show', desc: 'Pilih show yang ingin ditonton dari daftar show aktif.' },
      { title: 'Klik Beli Show / Beli Replay', desc: 'Pilih metode bayar: QRIS atau tukar Koin (jika koin cukup).' },
      { title: 'Selesaikan pembayaran', desc: 'Untuk QRIS — scan kode dan bayar. Untuk Koin — konfirmasi penukaran.' },
      { title: 'Link token dikirim otomatis', desc: 'Setelah pembayaran sukses, link token + sandi dikirim via WhatsApp dan muncul di kartu show.' },
      { title: 'Salin link & buka', desc: 'Klik tombol "Salin Link Token", tempel di browser perangkat yang akan dipakai menonton.' },
    ],
    note: 'Jika notifikasi WhatsApp belum sampai, link tetap muncul di kartu show pada akun yang sama (asal login).',
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
      { title: 'Kuota reset maksimum 3×', desc: 'Reset manual dibatasi 3 kali per token agar tidak disalahgunakan. Hubungi admin jika sudah habis.' },
    ],
    note: 'Token MULTI-PERANGKAT (untuk paket khusus) bisa dipakai di banyak perangkat sekaligus dan tidak perlu (tidak bisa) direset manual.',
  },
  {
    id: 'membership',
    title: 'Membership: Akses Tanpa Beli Per Show',
    icon: Crown,
    image: imgBuyShow,
    summary: 'Member aktif bisa langsung nonton semua live tanpa beli tiket per show.',
    steps: [
      { title: 'Pilih paket di halaman Membership', desc: 'Buka menu "Membership", pilih paket sesuai durasi.' },
      { title: 'Bayar via QRIS atau Koin', desc: 'Setelah bayar, token membership + sandi dikirim ke WhatsApp.' },
      { title: 'Aktifkan di profil', desc: 'Buka halaman Profil, masukkan token + sandi membership. Status akan berubah jadi "Member Aktif".' },
      { title: 'Tonton live langsung', desc: 'Selama membership aktif, tombol "Tonton Live (Member)" muncul otomatis di kartu show.' },
    ],
  },
  {
    id: 'tips',
    title: 'Tips: Fonnte Pause / Token Belum Diterima',
    icon: KeyRound,
    image: imgRegister,
    summary: 'Apa yang harus dilakukan jika notifikasi WhatsApp belum sampai.',
    steps: [
      { title: 'Tunggu 1–3 menit', desc: 'Kadang notifikasi WA delay karena antrean gateway.' },
      { title: 'Cek kartu show di akun', desc: 'Token juga muncul otomatis di kartu show pada akun yang sama (login dulu).' },
      { title: 'Kirim bukti pembayaran ke admin', desc: 'Klik tombol "Kirim Bukti" — kamu langsung diarahkan ke WhatsApp admin. Admin akan kirim link manual.' },
      { title: 'Pastikan nomor WA benar', desc: 'Cek nomor di profil. Salah angka 1 saja, notifikasi tidak akan sampai.' },
    ],
  },
];

export default function Panduan() {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>('mobile');
  const [lightMode, setLightMode] = useState(() => { try { return localStorage.getItem('replaytime-mode') === 'light'; } catch { return false; } });

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
            <div className="font-semibold text-foreground mb-0.5">Sudah beli show?</div>
            <div className="text-muted-foreground">
              Klik tombol <b>"Salin Link Token"</b> di kartu show, lalu tempel di browser perangkat tujuan. Token otomatis aktif di perangkat itu.
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
                className="rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md"
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
          Masih bingung? Hubungi admin lewat menu <b>Hubungi Admin</b> di hamburger menu.
        </div>
      </main>
    </div>
  );
}
