# Reset Perangkat di Profil, Menu Panduan, dan Kartu Bundel Baru

## 1. Tombol reset perangkat di Profil/Akun

Saat ini tombol reset hanya muncul untuk membership. Akan ditambahkan bagian **"Perangkat Saya"** di halaman Profil (dan profil Guest) yang menampilkan satu tombol reset untuk setiap akses yang dimiliki user:

- Setiap show/replay yang sudah dibeli (token show)
- Setiap membership aktif
- Token bundel show

Tiap baris menampilkan sisa kuota reset (maks 3x), dan tombolnya memakai komponen reset yang sudah ada, jadi aturan kuota dan keamanan tidak berubah. Token multi-perangkat tetap menampilkan info saja tanpa tombol.

## 2. Menu Panduan di hamburger

Menu "Panduan" saat ini satu tautan tunggal. Akan diubah menjadi menu yang bisa dibuka (accordion) berisi tautan langsung ke tiap topik:

- Panduan Pembelian (QRIS & koin)
- Panduan Nonton Live
- Panduan Nonton Replay
- Panduan Membership & Token
- Panduan Hubungkan TV/Proyektor
- Panduan Install Aplikasi
- Lihat Semua Panduan

Tiap tautan membuka halaman panduan langsung pada bagian yang dituju (anchor ke bagian yang sudah ada di halaman panduan). Bagian yang belum ada di halaman panduan (pembelian, nonton live, nonton replay) akan ditambahkan isinya di halaman panduan.

## 3. Kartu bundel lebih ringkas dan istimewa

Kartu bundel diubah jadi kartu melebar (banner horizontal), bukan kartu tinggi seperti kartu show:

- Kiri: nama bundel, jumlah show, deskripsi singkat 1 baris, badge diskon
- Kanan: harga QRIS dan harga koin, dua tombol beli berdampingan (QRIS / Koin)
- Di mobile tetap menumpuk rapi dan tidak memanjang
- Tampilan dibedakan dari kartu show/replay: bingkai bercahaya, gradien tema, badge "Bundel" dengan ikon, dan animasi kilau halus

## 4. Tema dan diskon bundel diatur admin

Di menu admin Bundel Show ditambahkan:

- **Pilihan tema kartu**: beberapa preset (Emas, Ungu Neon, Biru Laut, Merah Api, Netral) yang mengubah warna gradien dan aksen kartu bundel
- **Diskon khusus**: admin bisa mengisi nominal diskon rupiah dan koin sendiri (mengganti default Rp2.000 / 1 koin), plus label promo opsional yang tampil sebagai badge di kartu
- Harga akhir tetap dihitung otomatis dari total show aktif dikurangi diskon yang diisi admin

## Detail teknis

- Tabel `show_bundles`: tambah kolom `theme text` (default `gold`) dan `promo_label text`; kolom `discount_idr`/`discount_coins` sudah ada dan akan dipakai sebagai nilai yang bisa diubah admin (bukan konstanta).
- Fungsi sinkronisasi harga bundel (`sync_show_bundle`) diubah agar memakai `discount_idr`/`discount_coins` dari baris bundel, bukan angka tetap.
- RPC `get_show_bundle` dan `admin_get_show_bundle` mengembalikan `theme` dan `promo_label`; `src/lib/bundle.ts` menambahkan field tersebut ke tipe `ShowBundle`.
- `ShowBundleCard.tsx` ditulis ulang jadi layout horizontal dengan peta tema (kelas token semantik, tanpa warna hardcode).
- `ShowBundleAdmin.tsx`: tambah pilihan tema, input diskon rupiah/koin, dan input label promo.
- Profil: komponen baru `DeviceResetSection` memakai `my-purchases` + membership aktif + token bundel, merender `DeviceResetButton` per akses. Tidak ada perubahan pada logika token/kuota di server.
- Panduan: hamburger memakai komponen accordion yang sudah tersedia; anchor `#guide-<id>` sudah didukung halaman panduan.
