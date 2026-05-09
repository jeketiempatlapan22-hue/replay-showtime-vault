## Pisahkan halaman live & sandi

### Masalah
Saat ini `/live` menampilkan satu halaman serbaguna: jika user belum unlock, area player tetap menampilkan kartu "JADWAL LIVE / Menunggu admin memulai siaran" (ScheduleCountdown) lalu form sandi di bawahnya, bahkan Live Chat juga muncul. Akibatnya area player terlihat seakan sudah aktif padahal user belum memasukkan sandi.

### Tujuan
- `/kunci` — halaman khusus form sandi.
- `/live` — halaman khusus tonton (player + chat + lineup). Hanya bisa diakses jika sudah unlock.
- Token link (`/live?t=TOKEN` atau `?mtoken=...`) tetap langsung membuka `/live` (bypass `/kunci`).
- Sandi benar di `/kunci` → simpan unlock ke `sessionStorage` → redirect ke `/live` (preserve `?show=...`).

### Perubahan

1. **Buat halaman baru `src/pages/Kunci.tsx`**
   - Pindahkan UI form sandi dari `Live.tsx` (kartu "Akses Live Terkunci", tombol Beli via WhatsApp, tombol "Reset perangkat membership").
   - Tampilkan juga `ScheduleCountdown` di atas form (judul + jadwal + countdown), supaya user tetap tahu kapan live mulai.
   - Logika: panggil `unlock-live` edge function dengan password.
   - Sukses → simpan ke `sessionStorage` (`replaytime-live-unlocked[-${showId}]`) → `navigate('/live?show=...')`.
   - Tetap baca `?show=...` dari URL agar terikat per-show.

2. **Tambah route di `src/App.tsx`**
   - `<Route path="/kunci" element={<Kunci />} />`

3. **Sederhanakan `src/pages/Live.tsx`**
   - Hapus blok form sandi & ScheduleCountdown di cabang `!unlocked`.
   - Saat mount: cek `?t=` / `?mtoken=` → tetap auto-unlock seperti sekarang.
   - Jika TIDAK ada token URL DAN tidak ada cache `sessionStorage` unlock → `navigate('/kunci?show=...', { replace: true })`.
   - Saat unlock dicabut/diblokir di runtime (silent revalidation menemukan `revoked`/`blocked`) → redirect ke `/kunci` dengan pesan via query param atau state.
   - Cabang `unlocked` tetap apa adanya (player, chat, lineup, ScheduleCountdown saat off-air).

4. **Tidak diubah**
   - Edge function `unlock-live`, `verify-password`, `get-replay-source`.
   - Skema database, RLS, security memory.
   - Logika token link, membership, multi-device, brute-force protection, dsb.

### Detail teknis
- Cache key `sessionStorage`: `replaytime-live-unlocked` (global) atau `replaytime-live-unlocked-${showId}` (per-show) — sama persis dengan yang sekarang dipakai `Live.tsx`, agar kompatibel.
- `/kunci` memanggil `unlock-live` dengan body `{ password, browser_id, show_id }`. Kalau `data.valid` → tulis cache → `navigate(`/live?show=${showId}`)`.
- `/live` deteksi unlock:
  ```text
  hasToken   = !!(search.get('t') || search.get('mtoken'))
  hasCached  = !!sessionStorage.getItem(SS_KEY)
  if (!hasToken && !hasCached) navigate('/kunci?show=' + showId, { replace: true })
  ```
- `/kunci` link "Beli Show via WhatsApp" + "Reset perangkat membership" sama persis dengan yang ada di `Live.tsx` saat ini.