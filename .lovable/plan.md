## Goals

1. Bersihkan halaman `/kunci`: hilangkan kartu "JADWAL LIVE / Live / Menunggu admin memulai siaran" di atas. Hanya tampilkan kolom sandi + deskripsi + tombol beli + tombol reset perangkat.
2. Perbaiki countdown di player `/live` yang terpotong (overflow di mobile).
3. Pastikan toggle live admin → hasil embed langsung tampil di player tanpa restart, lag, atau loop ulang.

## Changes

### 1. `src/pages/Kunci.tsx` — sederhanakan
- Hapus komponen `ScheduleCountdown` dan pemanggilannya.
- Hapus state `status` + fetch `active_shows` / `get_live_status` (tidak dipakai lagi setelah card dihilangkan).
- Layout final hanya berisi:
  - Sticky header "Kunci Akses Live"
  - Kartu pusat (`max-w-md`) dengan ikon gembok, judul "Akses Live Terkunci", deskripsi, form sandi, tombol "Beli Show via WhatsApp", dan tombol "Reset perangkat membership saya".
- Tetap pertahankan: redirect ke `/live` jika sudah ada cache di sessionStorage, parsing `?reason=`, integrasi `unlock-live`, `membership-self-reset`.

### 2. `src/pages/Live.tsx` — perbaiki countdown player
- Pada `ScheduleCountdown` (lines 74–115) ganti `aspect-video` jadi tinggi adaptif (`min-h-[260px] sm:aspect-video`) supaya konten tidak terpotong di layar sempit.
- Kecilkan padding (`py-4 sm:py-6`), gap (`gap-2 sm:gap-3`), dan ukuran angka countdown di mobile (`text-xl sm:text-4xl`) agar grid 4 kolom muat di lebar 360–500px tanpa overflow.
- Pastikan teks judul + tanggal ber-`break-words`/`flex-wrap` (sudah ada) tetap aman.

### 3. `src/pages/Live.tsx` — embed seamless saat toggle live ON
- Logic silent-unlock (lines 231–245) sudah ada — pertahankan: tidak overwrite `url`/`sources` jika sudah ada (mencegah React key player berubah → remount).
- Tambahkan jaminan: ketika `enabled` berubah dari false→true tetapi player sebelumnya menampilkan `ScheduleCountdown` (karena `!unlocked.enabled`), gunakan key player yang stabil berbasis `unlocked.url` + `activeSource.url` saja, bukan `enabled`. Verifikasi block render player (di luar window yg sudah dilihat) tidak menambah `enabled` ke key. Jika ditemukan, hapus `enabled` dari key.
- Tidak ada perubahan ke edge function / DB.

## Out of scope

- Tidak mengubah `unlock-live`, `verify-password`, RLS, atau skema DB.
- Tidak mengubah token link flow, membership flow, atau halaman lain.

## Technical notes

- Penyebab countdown terpotong: `aspect-video` memaksa rasio 16:9. Pada lebar 497px → tinggi ~280px, padahal konten (judul + tanggal + 4 angka besar) butuh lebih dari itu sehingga grid teroverflow. Solusi: tinggi minimum + aspect-video hanya pada `sm` ke atas.
- Penyebab embed restart: jika React key elemen player berubah saat status update, iframe/HLS akan di-remount dari awal. Silent-unlock saat ini sudah aman; perlu memastikan blok render (lines >371) juga tidak memasukkan `enabled` atau timestamp ke key.
