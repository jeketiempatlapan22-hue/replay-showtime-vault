# Pengetatan /idn-stream-token + Mode Gratis (/free)

## Tujuan
1. `/idn-stream-token` hanya bisa dipanggil dengan **Authorization: Bearer <token akses>** yang diterbitkan server, dan hanya untuk pemilik token yang terdaftar di Token Factory (token show atau token membership). Masa berlaku maksimal 6 jam.
2. Endpoint baru `/free-token` untuk halaman `/free?show=...`: tanpa token beli, terikat sidik jari perangkat (fingerprint), berlaku 30 menit.
3. Admin punya tombol ON/OFF mode gratis + pilihan show yang digratiskan. Saat OFF, `/free-token` mati total (menolak semua permintaan).

## Yang berubah untuk pengguna
- Penonton berbayar/membership: tidak ada perubahan pengalaman. Halaman `/live` tetap seperti sekarang; token akses dibuat otomatis saat unlock dan diperbarui diam-diam sebelum 6 jam habis.
- Orang luar yang mencoba memanggil endpoint stream dari luar situs akan ditolak (401), karena tidak punya bearer token yang sah.
- Halaman baru `/free?show=<id>`: bisa ditonton tanpa token, hanya jika admin mengaktifkan mode gratis untuk show tersebut. Sesi menonton dibatasi 30 menit per perangkat, lalu perlu memuat ulang untuk sesi baru.
- Admin panel (di kontrol Live per show): saklar "Mode Gratis" ON/OFF dan pilihan show gratis.

## Rencana teknis

### 1. Token akses berbasis Token Factory (6 jam)
- Perluas `supabase/functions/_shared/stream-grant.ts`: klaim menjadi `{ sid, idn, bid, kind: 'show'|'membership'|'free', tid (id baris token), exp }`. TTL default 6 jam (21600 s); helper terpisah untuk TTL 30 menit.
- `unlock-live` sudah menerbitkan grant; tambahkan `kind` + `tid` (id di `active_show_tokens` / `membership_tokens`) saat unlock lewat token show maupun mtoken. Jalur "sandi saja" (tanpa token Factory) tidak lagi menerima grant untuk IDN — hanya sumber m3u8/YouTube biasa (dikonfirmasi ulang saat implementasi agar tidak memutus akses sandi master untuk sumber non-IDN).
- `idn-stream-token`:
  - Baca bearer dari header `Authorization` (bukan body). Body hanya `showId`.
  - Verifikasi HMAC + `exp` (tolak jika > 6 jam sejak terbit), cocokkan `claims.idn === showId`.
  - Validasi ulang ke database dengan service role: baris token `tid` masih ada, `revoked = false`, belum kedaluwarsa, dan `bid` masih terikat sebagai device sah. Jika tidak → 401/403.
  - CORS tetap dibatasi ke domain resmi seperti sekarang.
- `src/pages/Live.tsx`: kirim grant lewat `headers: { Authorization: 'Bearer ' + idnGrant }` pada `functions.invoke('idn-stream-token', ...)`; body cukup `{ showId }`. Aturan player/playlist (hls, refresh 25 menit, YouTube) tidak diubah.

### 2. `/free-token` (30 menit, terikat fingerprint)
- Fungsi baru `supabase/functions/free-token/index.ts` (`verify_jwt = false` di `config.toml`):
  - Body: `{ showId, fingerprint }`.
  - Cek `site_settings`: `free_mode_enabled = 'true'` dan `free_show_id` sama dengan show yang diminta. Jika tidak → 403 `free_off`.
  - Cek show aktif dan berada di window live (aturan auto-live 20 menit yang sudah ada).
  - Fingerprint wajib (panjang minimal), dipakai sebagai `bid` pada grant `kind: 'free'` TTL 30 menit; simpan jejak di tabel baru `free_sessions` (fingerprint, show_id, ip, expires_at) untuk batas sesi/rate-limit sederhana.
  - Mengembalikan kredensial IDN langsung (memakai generator yang sama seperti `idn-stream-token`, dipindah ke `_shared/idn-credentials.ts` agar tidak duplikat) plus `expiresIn: 1800`.
- Migrasi database: tabel `free_sessions` (dengan GRANT + RLS, hanya `service_role`), dan baris `site_settings` `free_mode_enabled` / `free_show_id`.

### 3. Halaman `/free`
- Halaman baru `src/pages/Free.tsx` + route `/free` di `App.tsx`.
- Baca `?show=<id>`, ambil fingerprint perangkat (`getBrowserId()` + sinyal ringan: userAgent, resolusi, timezone → hash), panggil `free-token`, lalu render player memakai komponen player yang sama (HlsPlayer) tanpa mengubah aturan hanabira/IDN.
- Countdown 30 menit; saat habis tampilkan pesan "Sesi gratis berakhir" + tombol mulai sesi baru.
- Jika mode OFF/show tidak cocok → tampilkan pesan bahwa siaran gratis sedang tidak tersedia.

### 4. Admin
- Di `ShowLiveControl.tsx` (kontrol live per show): saklar **Mode Gratis** (menulis `free_mode_enabled`) dan penanda show mana yang digratiskan (`free_show_id`, diisi dari show yang sedang dibuka), plus tombol salin link `/free?show=<id>`.
- Perubahan disimpan ke `site_settings` dan dibaca realtime oleh halaman `/free`.

## Catatan
- Halaman `/live` beserta aturan player, playlist, hanabira/IDN, m3u8, dan YouTube tidak diubah selain penambahan header Authorization pada pemanggilan `idn-stream-token`.
