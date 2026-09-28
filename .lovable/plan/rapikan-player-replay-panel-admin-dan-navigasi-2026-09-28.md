# Rapikan Player Replay, Panel Admin, dan Navigasi

## Hasil yang akan dibuat
- Player YouTube replay tidak lagi ditutup lapisan transparan penuh. Kontrol replay tetap tersedia, termasuk suara, play/pause, bar waktu, maju/mundur 10 detik, kecepatan, TV, dan layar penuh.
- Menu **Monitor Live** menjadi **Live & Buat Link**. Monitor tetap tampil seperti halaman penonton; bagian pembuatan link ditempatkan setelah monitor/live chat pada halaman yang sama.
- Panel admin diringkas dengan penggabungan sedang:
  - **Reseller**: Audit, Tagihan, dan Harga dalam satu menu dengan pilihan bagian di dalamnya.
  - **Membership**: Token, User, dan Paket dalam satu menu dengan pilihan bagian di dalamnya.
  - **Keamanan**: Blokir serta IP & Rate Limit dalam satu menu dengan pilihan bagian di dalamnya.
  - Menu lainnya tetap terpisah agar pekerjaan admin tidak berubah terlalu banyak.
- Navigasi utama `/` berubah dari **Beranda** menjadi **Replay**, memakai ikon video/replay yang sesuai pada navigasi bawah dan menu samping.

## Cara pengerjaan
1. Ubah interaksi player YouTube agar tidak memakai penutup klik transparan di seluruh video. Gesture suara dan tampilan kontrol dipindahkan ke elemen yang terlihat dan kontrol yang sudah ada.
2. Gabungkan komponen Monitor Live dan Buat Link dalam satu tampilan berurutan, lalu hapus pintasan menu Buat Link yang terpisah.
3. Buat tiga tampilan kelompok admin dengan pilihan bagian internal, lalu arahkan daftar menu dan judul halaman ke kelompok baru tanpa mengubah fungsi setiap alat.
4. Selaraskan nama dan ikon Replay pada navigasi bawah serta menu samping.

## Verifikasi
- Periksa player replay YouTube pada desktop dan ukuran ponsel: video tidak tertutup, kontrol dapat disentuh, suara/play/seek/kecepatan/TV/layar penuh tetap merespons.
- Periksa panel admin: Live & Buat Link menampilkan monitor lebih dulu dan pembuatan link setelahnya; seluruh bagian Reseller, Membership, dan Keamanan tetap dapat dibuka.
- Periksa navigasi bawah dan menu samping menampilkan Replay dengan ikon baru.
- Jalankan pemeriksaan kode dan pastikan preview tidak menampilkan error.

## Detail teknis
- Perubahan player dibatasi pada jalur replay YouTube; aturan Live, Hanabira, dan HLS tidak diubah.
- Penggabungan menu hanya mengubah susunan tampilan. Komponen dan proses data yang sudah ada tetap digunakan.
