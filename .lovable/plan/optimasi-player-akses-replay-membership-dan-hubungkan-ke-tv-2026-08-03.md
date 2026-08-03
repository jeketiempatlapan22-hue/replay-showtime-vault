# Optimasi Player, Akses Replay Membership, dan Hubungkan ke TV

## 1. Optimasi kinerja website & ABR player

Fokus hanya pada lapisan ABR/buffer HLS dan performa render. Aturan Hanabira/IDN (pengambilan token, header, URL sumber, playlist live) tidak disentuh sama sekali.

- Perhalus ABR di `HlsPlayer` untuk jaringan kecil:
  - Estimasi bandwidth awal dari sampel nyata fragmen pertama (bukan hanya tebakan statis), lalu simpan estimasi terakhir di localStorage agar sesi berikutnya langsung mulai di level yang tepat.
  - Naik level bertahap (satu tingkat per keputusan) dan turun level cepat saat buffer menipis, supaya tidak terjadi osilasi kualitas yang memicu lag.
  - Kapping otomatis dilonggarkan sendiri setelah beberapa menit playback stabil, jadi user jaringan kecil mulai lancar lalu naik kualitas tanpa perlu menyentuh menu.
  - Turunkan kualitas otomatis saat tab tidak terlihat / baterai hemat data, dan pulihkan saat kembali.
- Kurangi error & delay:
  - Satukan watchdog stall agar tidak ada dua timer yang saling memicu recovery (penyebab tersendat berulang).
  - Backoff bertingkat untuk recovery error jaringan, sehingga error non-fatal tidak menampilkan layar error.
  - Bersihkan interval/listener saat player tidak aktif.
- Performa halaman:
  - Kartu replay dibungkus `memo` dan handler distabilkan agar daftar panjang tidak re-render tiap perubahan state.
  - Gambar kartu diberi `width`/`height` dan `fetchpriority` rendah untuk mengurangi layout shift.
  - Lazy-load komponen berat yang belum lazy di halaman utama.

## 2. Tombol "Tonton Replay" untuk membership

Aturan: membership aktif dengan paket yang memuat replay boleh menonton replay yang **tanggalnya berada dalam periode membership** (`starts_at` s/d `expires_at`).

- Backend `get-replay-source`: tambahkan jalur validasi token membership — cek token aktif, tidak dicabut, `includes_replays`, dan tanggal replay berada dalam rentang membership. Perangkat tetap dibatasi lewat tabel device membership yang sudah ada.
- Frontend: helper baru untuk mengecek apakah sebuah replay tercakup membership user.
- `ReplayCardComponent`: bila tercakup, tombol berubah jadi **Tonton Replay** (tanpa dialog sandi/beli) dan badge "Termasuk Membership".
- Bila membership aktif tapi tanggal replay di luar periode, kartu tetap menampilkan opsi beli, dengan keterangan singkat bahwa replay ini di luar periode membership.
- Player replay mengirim token membership ke `get-replay-source` saat sumber diambil.

## 3. Hubungkan ke TV / monitor

- Tambah dukungan **Google Cast** (Chromecast) di samping AirPlay/Remote Playback yang sudah ada di `HlsPlayer`, dengan satu tombol Cast yang otomatis memilih metode sesuai browser.
- Tambah **Mode TV**: layar penuh tanpa distraksi (kontrol besar, auto-hide, wake lock agar layar tidak mati) untuk pemakaian via HDMI ke TV/proyektor.
- Tombol yang sama tersedia di player replay (YouTube/HLS) — untuk sumber YouTube, Cast memakai jalur bawaan; untuk HLS memakai Cast/AirPlay langsung.
- Tambahkan opsi "Salin link untuk TV" agar user bisa membuka di browser TV.

## Catatan teknis

- File yang disentuh: `src/components/HlsPlayer.tsx` (hanya ABR/buffer/UI cast), `src/components/EmbedPlayer.tsx`, `src/components/YouTubePlayer.tsx`, `src/components/ReplayCardComponent.tsx`, helper baru di `src/lib/`, dan edge function `get-replay-source`.
- Halaman live (`src/pages/Live.tsx`) beserta aturan playlist/token Hanabira-IDN tidak diubah.
- Tidak ada perubahan skema database yang dibutuhkan.
