# Riwayat Pembelian Rapi + Show Bundle

## 1. Profil: riwayat pembelian gaya akordeon

Daftar show/replay yang sudah dibeli ditampilkan sebagai baris ringkas (judul, tanggal, label Show/Replay, tanggal bayar). Tombol "Salin Link + Sandi" dan detail akses baru muncul setelah baris diklik, dan hanya satu baris terbuka dalam satu waktu.

- Berlaku untuk pengguna login (Profil) maupun akun guest.
- Isi yang terbuka tetap memakai kartu info akses yang sekarang (link, sandi replay, info replay, tombol salin).
- Baris bundel ditandai lencana "Bundel" dan saat dibuka menampilkan satu link + satu sandi, lalu daftar show yang tercakup.

## 2. Show Bundle

### Aturan isi bundel
- Bundel otomatis berisi semua show aktif yang masih tayang.
- Admin bisa mengecualikan show tertentu lewat centang di panel bundel.
- Harga bundel = jumlah harga semua show di bundel dikurangi Rp2.000; harga koin = jumlah koin dikurangi 1 koin.
- Saat satu show dikonversi jadi replay atau dikeluarkan dari bundel, harga dan koin dihitung ulang otomatis dengan aturan yang sama.

### Sandi bundel
- Satu sandi acak berlaku untuk semua replay hasil show di bundel.
- Setiap kali isi bundel berkurang, sandi baru dibuat. Sandi lama tetap berlaku selamanya bagi pembeli lama, jadi tidak ada pembeli yang kehilangan akses.
- Semua replay hasil konversi show bundel menerima daftar sandi bundel yang berlaku, tanpa mengubah sandi replay satuan yang sudah ada.

### Pembelian
- Tombol beli bundel muncul di halaman show (kartu khusus "Bundel Semua Show") dengan dua cara bayar: QRIS Pakasir dan koin.
- Setelah lunas, sistem membuat satu token bundel per pembeli (1 token = 1 user, batas perangkat sama seperti show satuan). Token yang sama didaftarkan ke setiap show anggota bundel saat pembelian, sehingga seluruh kartu show anggota langsung berubah jadi "Tonton Live" dan punya tombol salin link + sandi, persis seperti pembelian satuan.
- Isi bundel dikunci pada saat pembelian: show yang ditambahkan admin setelah itu tidak ikut.
- Setelah show anggota jadi replay, token dan sandi bundel tetap membuka replaynya.
- Jika pembeli sudah punya token bundel aktif, pembelian ulang mengembalikan token yang sama, bukan token baru.

### Panel admin
Menu baru "Bundel Show" berisi: daftar show anggota dengan centang pengecualian, ringkasan harga/koin hasil hitung otomatis, sandi bundel aktif + riwayat sandi, tombol aktif/jeda penjualan bundel, dan daftar pembeli beserta tokennya.

## Catatan teknis

- Tabel baru: `show_bundles` (nama, status aktif, harga IDR/koin hasil hitung, diskon 2000/1), `show_bundle_items` (bundel, show, ikut/dikecualikan), `show_bundle_passwords` (riwayat sandi, semua tetap valid), `show_bundle_tokens` (token per pembeli + snapshot daftar show saat beli) — semuanya dengan GRANT + RLS; kolom sensitif (sandi, token) hanya lewat RPC/edge function, sesuai pola proteksi yang sudah dipakai.
- Trigger/RPC menghitung ulang harga bundel saat show ditambah, dikecualikan, atau dikonversi ke replay, sekaligus membuat sandi baru saat isi berkurang.
- `create-pakasir-order` dan `purchase-with-coins` mendapat `kind: 'bundle'`; setelah lunas (`pakasir-webhook`, `check-pakasir-status`, `poll-pending-orders`, jalur koin) token bundel dibuat dan didaftarkan sebagai baris `active_show_tokens` untuk tiap show anggota agar seluruh pengecekan akses yang ada tetap berlaku tanpa perubahan aturan.
- `verify-password` dan `get-replay-source` menerima sandi bundel yang valid untuk replay anggota; aturan Hanabira/HLS dan sandi master tidak diubah.
- `get-access-info` dan `my-purchases` mengembalikan entri bundel (link, sandi aktif, daftar show) agar profil, guest, dan kartu show menampilkan status yang sama.
